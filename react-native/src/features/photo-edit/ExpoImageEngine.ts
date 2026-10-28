import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { CancelledError } from '../../core/http/ApiError';
import { throwIfAborted } from '../../core/http/abort';
import { encodePng } from '../signature/encodePng';
import type {
  AnalysisSampleRequest,
  EncodedImage,
  ImageEngine,
  WebpEncodeRequest,
} from './ImageEngine';
import { ImageDecodeError } from './ImageErrors';
import type { ImageFile, RgbaImage, Size } from './ImageTypes';
import { identityEdit, isIdentityEdit } from './PhotoEdit';
import { limitLongEdge } from './PhotoEditTransform';
import { cropPixelRect, hasColorEdit, renderPixels } from './PhotoPixelRenderer';
import { decodePng } from './PngDecoder';

/** 편집기 미리보기 파일의 JPEG 품질(0~1). 편집기 안에서만 쓰고 업로드 결과에는 섞이지 않는다. */
const EDITABLE_QUALITY = 0.92;

let tempCounter = 0;

/** 앱 캐시에 겹치지 않는 임시 파일을 하나 만든다(만들기만 하고 쓰지 않는다). */
function tempFile(extension: string): File {
  tempCounter += 1;
  const stamp = Math.random().toString(36).slice(2, 10);
  return new File(Paths.cache, `chalkak-edit-${tempCounter}-${stamp}.${extension}`);
}

/**
 * expo-image-manipulator + 순수 TS 색 파이프라인 구현.
 *
 * - 크기·방향(EXIF)·회전·자르기·축소·WebP 저장은 모두 네이티브(manipulator)가 한다. 원본은 디코드 한 번, 저장 한 번이다.
 * - 색(조정·필터)이 있는 편집만 중간에 **무손실 PNG**로 내려 받아 TS(`renderPixels`, 테스트가 오라클로 검증한 같은 코드)로 칠하고
 *   PNG로 다시 써서 manipulator가 WebP로 저장한다. 손실 압축(JPEG)을 중간에 끼우지 않는다.
 * - 자동 보정 표본(samplePixels)도 같은 경로의 무손실 PNG를 TS로 읽는다.
 *
 * 임시 파일은 호출한 쪽이 지우는 결과 파일(편집용 이미지, WebP)을 빼고 이 클래스가 만든 즉시 지운다.
 * 네이티브 작업은 취소할 수 없어 signal은 단계 사이에서만 확인한다(취소되면 만든 임시 파일을 지우고 CancelledError).
 */
export class ExpoImageEngine implements ImageEngine {
  async readBounds(uri: string, signal?: AbortSignal): Promise<Size> {
    throwIfAborted(signal);
    const ref = await this.render(ImageManipulator.manipulate(uri));
    try {
      throwIfAborted(signal);
      return { width: ref.width, height: ref.height };
    } finally {
      ref.release();
    }
  }

  async prepareEditable(
    uri: string,
    maxLongEdge: number,
    signal?: AbortSignal,
  ): Promise<ImageFile> {
    throwIfAborted(signal);
    // 불러올 때 이미 줄여서(디코드 단계) 전체 해상도 비트맵을 메모리에 올리지 않는다.
    const ref = await this.render(
      ImageManipulator.manipulate(uri, { maxWidth: maxLongEdge, maxHeight: maxLongEdge }),
    );
    try {
      throwIfAborted(signal);
      const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: EDITABLE_QUALITY });
      if (signal?.aborted) {
        discard(saved.uri);
        throw new CancelledError('aborted');
      }
      return { uri: saved.uri, width: saved.width, height: saved.height };
    } finally {
      ref.release();
    }
  }

  async samplePixels(
    request: AnalysisSampleRequest,
    signal?: AbortSignal,
  ): Promise<RgbaImage | null> {
    throwIfAborted(signal);
    const { sourceUri, sourceSize, quarterTurns, crop, maxLongEdge } = request;
    const rect = cropPixelRect(sourceSize, { quarterTurns, crop });
    const out = limitLongEdge({ width: rect.width, height: rect.height }, maxLongEdge);
    let png: File | null = null;
    try {
      let context = ImageManipulator.manipulate(sourceUri);
      if (quarterTurns !== 0) context = context.rotate(quarterTurns * 90);
      context = context.crop({
        originX: rect.x0,
        originY: rect.y0,
        width: rect.width,
        height: rect.height,
      });
      if (out.width !== rect.width || out.height !== rect.height) context = context.resize(out);
      const ref = await this.render(context);
      try {
        const saved = await ref.saveAsync({ format: SaveFormat.PNG });
        png = new File(saved.uri);
      } finally {
        ref.release();
      }
      throwIfAborted(signal);
      return decodePng(await png.bytes());
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      return null; // 분석할 수 없다 -> 자동 보정 없음(REQ-EDIT-027)
    } finally {
      discard(png?.uri);
    }
  }

  async encodeWebp(request: WebpEncodeRequest, signal?: AbortSignal): Promise<EncodedImage> {
    throwIfAborted(signal);
    const { sourceUri, sourceSize, targetSize, quality } = request;
    const edit = request.edit && !isIdentityEdit(request.edit) ? request.edit : null;
    const temps: (string | undefined)[] = [];
    try {
      let context = ImageManipulator.manipulate(sourceUri);
      if (targetSize.width !== sourceSize.width || targetSize.height !== sourceSize.height) {
        context = context.resize({ width: targetSize.width, height: targetSize.height });
      }
      if (edit) {
        if (edit.quarterTurns !== 0) context = context.rotate(edit.quarterTurns * 90);
        const rect = cropPixelRect(targetSize, edit);
        const rotated = edit.quarterTurns % 2 === 0 ? targetSize : swap(targetSize);
        if (rect.width !== rotated.width || rect.height !== rotated.height) {
          context = context.crop({
            originX: rect.x0,
            originY: rect.y0,
            width: rect.width,
            height: rect.height,
          });
        }
      }
      let ref = await this.render(context);
      try {
        throwIfAborted(signal);
        if (edit && hasColorEdit(edit)) {
          // 기하(회전·자르기)는 끝났으니 색만 칠한다: 무손실 PNG -> TS -> 무손실 PNG -> WebP.
          const painted = await this.paint(ref, edit, temps, signal);
          ref.release();
          ref = painted;
        }
        throwIfAborted(signal);
        const saved = await ref.saveAsync({ format: SaveFormat.WEBP, compress: quality / 100 });
        if (signal?.aborted) {
          discard(saved.uri);
          throw new CancelledError('aborted');
        }
        const size = new File(saved.uri).size;
        return { uri: saved.uri, width: saved.width, height: saved.height, byteLength: size ?? 0 };
      } finally {
        ref.release();
      }
    } finally {
      for (const uri of temps) discard(uri);
    }
  }

  /** 기하가 끝난 이미지에 색 편집만 칠해 새 이미지로 돌려준다. */
  private async paint(
    ref: ImageRef,
    edit: NonNullable<WebpEncodeRequest['edit']>,
    temps: (string | undefined)[],
    signal?: AbortSignal,
  ): Promise<ImageRef> {
    const lossless = await ref.saveAsync({ format: SaveFormat.PNG });
    temps.push(lossless.uri);
    const pixels = decodePng(await new File(lossless.uri).bytes());
    throwIfAborted(signal);
    const colored = renderPixels(pixels, {
      ...identityEdit(),
      filter: edit.filter,
      adjustments: edit.adjustments,
    });
    const out = tempFile('png');
    temps.push(out.uri);
    out.create({ overwrite: true });
    out.write(encodePng(new Uint8Array(colored.data.buffer), colored.width, colored.height));
    return this.render(ImageManipulator.manipulate(out.uri));
  }

  /** 읽을 수 없는 사진은 모두 ImageDecodeError로 통일한다. */
  private async render(context: ReturnType<typeof ImageManipulator.manipulate>): Promise<ImageRef> {
    try {
      return await context.renderAsync();
    } catch (error) {
      throw new ImageDecodeError(error instanceof Error ? error.message : undefined);
    } finally {
      context.release();
    }
  }
}

const swap = (size: Size): Size => ({ width: size.height, height: size.width });

function discard(uri: string | undefined): void {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 캐시 폴더라 시스템이 정리한다.
  }
}
