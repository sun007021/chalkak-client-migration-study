import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';

import { CancelledError } from '../../core/http/ApiError';
import { throwIfAborted } from '../../core/http/abort';
import { ImageDecodeError } from '../../core/image/ImageErrors';
import { decodePng, encodePng } from '../../core/image/png';
import type {
  AnalysisSampleRequest,
  EncodedImage,
  ImageEngine,
  WebpEncodeRequest,
} from './ImageEngine';
import type { ImageFile, RgbaImage, Size } from './ImageTypes';
import { identityEdit, isIdentityEdit, type PhotoEdit } from './PhotoEdit';
import { limitLongEdge } from './PhotoEditTransform';
import { createRenderJob, cropPixelRect, hasColorEdit } from './PhotoPixelRenderer';

/** 편집기 미리보기 파일의 JPEG 품질(0~1). 편집기 안에서만 쓰고 업로드 결과에는 섞이지 않는다. */
const EDITABLE_QUALITY = 0.92;
/** 중간 PNG의 zlib 수준: 속도 우선(파일 크기는 중요하지 않다). */
const INTERMEDIATE_PNG_LEVEL = 1;
/** 색을 칠하다가 이벤트 루프를 양보하고 취소를 확인하는 줄 간격. */
const PAINT_ROWS_PER_SLICE = 64;

let tempCounter = 0;

/** 앱 캐시에 겹치지 않는 임시 파일을 하나 만든다(만들기만 하고 쓰지 않는다). */
function tempFile(extension: string): File {
  tempCounter += 1;
  const stamp = Math.random().toString(36).slice(2, 10);
  return new File(Paths.cache, `chalkak-edit-${tempCounter}-${stamp}.${extension}`);
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** 한 라운드(같은 사진·크기·편집)의 기하와 색이 끝난 이미지. 품질 사다리는 이것을 WebP로 여러 번 저장한다. */
type Round = { key: string; ref: ImageRef };

/**
 * expo-image-manipulator + 순수 TS 색 파이프라인 구현.
 *
 * - 크기·방향(EXIF)·회전·자르기·축소·WebP 저장은 네이티브(manipulator)가 한다.
 * - 색(조정·필터)이 있는 편집만 중간에 **무손실 PNG**로 내려 받아 TS(`createRenderJob`, 테스트가 오라클로 검증한 같은 식)로 칠하고
 *   PNG로 다시 써서 불러온다. 칠하기는 업로드 크기(`targetSize`)에서 **라운드마다 한 번**이고, 품질 사다리는 그 결과를 WebP로만 다시 저장한다.
 *   라운드는 `releaseRound()`(또는 다른 입력의 다음 라운드)까지 메모리에 둔다. 중간 파일은 읽거나 불러온 즉시 지운다.
 * - 칠하는 동안 `PAINT_ROWS_PER_SLICE`줄마다 이벤트 루프를 양보하고 취소를 확인한다.
 * - 무거운 작업(encodeWebp)은 한 번에 하나만 돈다: 앞 작업이 (취소돼도) 끝난 뒤에야 다음이 시작한다.
 */
export class ExpoImageEngine implements ImageEngine {
  private round: Round | null = null;
  private tail: Promise<unknown> = Promise.resolve();

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
    let png: string | undefined;
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
        png = (await ref.saveAsync({ format: SaveFormat.PNG })).uri;
      } finally {
        ref.release();
      }
      throwIfAborted(signal);
      return decodePng(await new File(png).bytes());
    } catch (error) {
      if (error instanceof CancelledError) throw error;
      return null; // 분석할 수 없다 -> 자동 보정 없음(REQ-EDIT-027)
    } finally {
      discard(png);
    }
  }

  encodeWebp(request: WebpEncodeRequest, signal?: AbortSignal): Promise<EncodedImage> {
    return this.exclusive(async () => {
      throwIfAborted(signal);
      const ref = await this.roundFor(request, signal);
      throwIfAborted(signal);
      const saved = await ref.saveAsync({
        format: SaveFormat.WEBP,
        compress: request.quality / 100,
      });
      if (signal?.aborted) {
        discard(saved.uri);
        throw new CancelledError('aborted');
      }
      const byteLength = new File(saved.uri).size;
      if (byteLength === null || byteLength === undefined) {
        // 크기를 모르면 한도(maxBytes) 판정을 할 수 없다: 0으로 통과시키지 않는다.
        discard(saved.uri);
        throw new Error('cannot read the size of the encoded image');
      }
      return { uri: saved.uri, width: saved.width, height: saved.height, byteLength };
    }, signal);
  }

  releaseRound(): void {
    this.round?.ref.release();
    this.round = null;
  }

  /** 앞 작업이 끝난 뒤에 실행한다. 앞 작업의 실패는 이 작업과 상관없다. */
  private exclusive<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const run = this.tail.then(() => {
      throwIfAborted(signal);
      return work();
    });
    this.tail = run.catch(() => undefined);
    return run;
  }

  /** 같은 라운드면 만들어 둔 이미지를, 아니면 이전 라운드를 놓고 새로 만든다. */
  private async roundFor(request: WebpEncodeRequest, signal?: AbortSignal): Promise<ImageRef> {
    const edit = request.edit && !isIdentityEdit(request.edit) ? request.edit : null;
    const key = JSON.stringify([request.sourceUri, request.targetSize, edit]);
    if (this.round?.key === key) return this.round.ref;
    this.releaseRound();

    const { sourceUri, sourceSize, targetSize } = request;
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
        const painted = await this.paint(ref, edit, signal);
        ref = painted;
      }
      throwIfAborted(signal);
    } catch (error) {
      ref.release();
      throw error;
    }
    this.round = { key, ref };
    return ref;
  }

  /**
   * 기하가 끝난 이미지에 색 편집만 칠해 새 이미지로 돌려준다. 받은 `ref`는 PNG로 저장한 즉시 놓는다(성공·실패 모두).
   * 무손실 PNG -> TS 칠하기(양보하며) -> 무손실 PNG -> 불러오기. 두 중간 파일은 읽거나 불러온 즉시 지운다.
   */
  private async paint(ref: ImageRef, edit: PhotoEdit, signal?: AbortSignal): Promise<ImageRef> {
    let lossless: string;
    try {
      lossless = (await ref.saveAsync({ format: SaveFormat.PNG })).uri;
    } finally {
      ref.release();
    }
    let pixels;
    try {
      pixels = decodePng(await new File(lossless).bytes());
    } finally {
      discard(lossless);
    }
    const job = createRenderJob(pixels, {
      ...identityEdit(),
      filter: edit.filter,
      adjustments: edit.adjustments,
    });
    for (let row = 0; row < job.height; row += PAINT_ROWS_PER_SLICE) {
      throwIfAborted(signal);
      job.renderRows(row, Math.min(job.height, row + PAINT_ROWS_PER_SLICE));
      await yieldToEventLoop();
    }
    throwIfAborted(signal);
    const colored = job.result();
    const out = tempFile('png');
    try {
      out.create({ overwrite: true });
      out.write(
        encodePng(
          new Uint8Array(colored.data.buffer),
          colored.width,
          colored.height,
          INTERMEDIATE_PNG_LEVEL,
        ),
      );
      return await this.render(ImageManipulator.manipulate(out.uri));
    } finally {
      discard(out.uri);
    }
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
