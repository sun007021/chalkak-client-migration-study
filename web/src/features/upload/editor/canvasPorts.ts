import { POST_IMAGE_CONTENT_TYPE } from '../../../constants';
import { throwIfAborted } from '../../../core/abort';
import type { BlobUrlFactory } from '../../signature/BlobUrlFactory';
import type { PhotoEdit } from '../editModel';
import type { DecodedImage } from '../imagePorts';
import { fitLongEdge } from '../imageSizing';
import type { AdjustmentValues } from './adjustments';
import { analysisSize, computeAutoValues } from './autoAdjust';
import { applyColorPipeline, colorParamsOf, hasColorEffect } from './colorPipeline';
import { planGeometry } from './cropGeometry';
import type { AutoAnalysisRegion, AutoAnalyzer, PixelSurfaceFactory, PreviewFrame, PreviewRenderer } from './editorPorts';

/**
 * 미리보기 이미지 형식은 앱의 사진 형식(WebP)과 같게 둔다. 화면에만 쓰고 올리지 않는다.
 * WebP 인코딩을 못 하는 브라우저는 canvas가 PNG를 돌려주지만 <img>로 보이는 데는 문제가 없어 형식은 확인하지 않는다.
 */
const PREVIEW_TYPE = POST_IMAGE_CONTENT_TYPE;
const PREVIEW_QUALITY = 0.85;

/** 표면이 만든 이미지를 Blob으로 바꾼다. 실제 canvas 표면의 결과(BrowserDecodedImage.drawable)만 다룬다. */
export function decodedImageToBlob(image: DecodedImage): Promise<Blob> {
  const drawable = (image as { drawable?: unknown }).drawable;
  if (!(drawable instanceof HTMLCanvasElement)) return Promise.reject(new Error('image is not a canvas image'));
  return new Promise((resolve, reject) => {
    drawable.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), PREVIEW_TYPE, PREVIEW_QUALITY);
  });
}

export interface CanvasPreviewDeps {
  createSurface: PixelSurfaceFactory;
  blobUrls: BlobUrlFactory;
  /** 표면 결과를 Blob으로. 기본 decodedImageToBlob. */
  toBlob?: (image: DecodedImage) => Promise<Blob>;
}

/**
 * 실제 미리보기 렌더(canvas → blob URL). PixelSurface 위에서 CanvasEditRenderer와 같은 연산(기하 → 조정 → 필터)을 쓰되,
 * 자른 결과를 긴 변 maxLongEdge 이내로 줄여 그린다(확대하지 않음, REQ-EDIT-007). 입력 이미지는 release하지 않는다. jsdom에서 테스트하지 않는다(Playwright).
 */
export class CanvasPreviewRenderer implements PreviewRenderer {
  constructor(protected readonly deps: CanvasPreviewDeps) {}

  async render(image: DecodedImage, edit: PhotoEdit, options: { maxLongEdge: number }, signal: AbortSignal): Promise<PreviewFrame> {
    throwIfAborted(signal);
    const plan = planGeometry(image, edit);
    const output = fitLongEdge(plan.output, options.maxLongEdge);
    const surface = this.deps.createSurface(output);
    let rendered: DecodedImage | null = null;
    try {
      surface.drawGeometry(image, { ...plan, output });
      throwIfAborted(signal);
      const params = colorParamsOf(edit);
      if (hasColorEffect(params)) {
        const pixels = surface.readPixels();
        applyColorPipeline(pixels, params);
        surface.writePixels(pixels);
      }
      rendered = surface.toImage();
      const blob = await (this.deps.toBlob ?? decodedImageToBlob)(rendered);
      throwIfAborted(signal);
      const src = this.deps.blobUrls.create(blob);
      const { blobUrls } = this.deps;
      let released = false;
      return {
        src,
        width: output.width,
        height: output.height,
        release() {
          if (released) return;
          released = true;
          blobUrls.revoke(src);
        },
      };
    } finally {
      // 표면(canvas 메모리)은 blob을 만든 뒤 바로 돌려준다.
      if (!rendered) {
        try {
          surface.toImage().release();
        } catch {
          // 원래 오류를 우선한다.
        }
      } else {
        rendered.release();
      }
    }
  }
}

/** 실제 자동 보정 분석기. 돌려서 자른 영역을 긴 변 longEdge 표본으로 그려 픽셀을 읽고 computeAutoValues를 부른다. 표본이 비면 null(REQ-EDIT-027). jsdom에서 테스트하지 않는다. */
export class CanvasAutoAnalyzer implements AutoAnalyzer {
  constructor(protected readonly deps: { createSurface: PixelSurfaceFactory }) {}

  async analyze(image: DecodedImage, region: AutoAnalysisRegion, longEdge: number, signal: AbortSignal): Promise<AdjustmentValues | null> {
    throwIfAborted(signal);
    const plan = planGeometry(image, { quarterTurns: region.quarterTurns, crop: region.crop });
    const output = analysisSize(plan.output, longEdge);
    const surface = this.deps.createSurface(output);
    try {
      surface.drawGeometry(image, { ...plan, output });
      throwIfAborted(signal);
      const pixels = surface.readPixels();
      return pixels.length === 0 ? null : computeAutoValues(pixels);
    } finally {
      try {
        surface.toImage().release();
      } catch {
        // 놓지 못해도 분석 결과는 그대로 쓴다.
      }
    }
  }
}
