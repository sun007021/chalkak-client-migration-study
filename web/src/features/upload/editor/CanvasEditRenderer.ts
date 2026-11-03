import { throwIfAborted } from '../../../core/abort';
import type { PhotoEdit } from '../editModel';
import type { DecodedImage, EditRenderer } from '../imagePorts';
import { BrowserDecodedImage } from '../browserImage';
import { applyColorPipeline, colorParamsOf, hasColorEffect } from './colorPipeline';
import { geometryMatrix, planGeometry } from './cropGeometry';
import type { GeometryPlan } from './cropGeometry';
import type { PixelSurface, PixelSurfaceFactory } from './editorPorts';

export interface CanvasEditRendererDeps {
  createSurface: PixelSurfaceFactory;
}

/**
 * 업로드용 편집 적용(PIE: 디코드 → EXIF → 편집 적용 → 인코딩). 순서(REQ-EDIT-008):
 * 1) planGeometry로 출력 크기를 정하고 surface를 만든다  2) surface.drawGeometry(image, plan)  3) 색 연산이 필요하면(hasColorEffect)
 * readPixels → applyColorPipeline(조정 → 필터) → writePixels  4) surface.toImage().
 * 색 연산이 필요 없으면 readPixels/writePixels를 부르지 않는다. 입력 image는 release하지 않는다.
 * signal이 이미 abort되었거나 그리는 도중 abort되면 AbortError로 거절하고 만든 표면은 놓는다. 그리기 실패는 그대로 던진다(호출한 쪽이 준비 실패로 본다).
 */
export class CanvasEditRenderer implements EditRenderer {
  constructor(protected readonly deps: CanvasEditRendererDeps) {}

  async render(image: DecodedImage, edit: PhotoEdit, signal: AbortSignal): Promise<DecodedImage> {
    throwIfAborted(signal);
    const plan = planGeometry(image, edit);
    const surface = this.deps.createSurface(plan.output);
    try {
      surface.drawGeometry(image, plan);
      throwIfAborted(signal);
      const params = colorParamsOf(edit);
      if (hasColorEffect(params)) {
        const pixels = surface.readPixels();
        applyColorPipeline(pixels, params);
        surface.writePixels(pixels);
        throwIfAborted(signal);
      }
      return surface.toImage();
    } catch (error) {
      // 결과를 돌려주지 못했으니 표면은 여기서 놓는다(toImage 전에 실패한 경우뿐 아니라 abort도 같다).
      try {
        surface.toImage().release();
      } catch {
        // 놓지 못해도 원래 오류를 우선한다.
      }
      throw error;
    }
  }
}

/** 실제 canvas 표면(Playwright로 확인). jsdom에서 부르지 않는다. 결과 이미지는 BrowserDecodedImage라 WebP 압축기가 그대로 그린다. */
export function createCanvasPixelSurface(size: { width: number; height: number }): PixelSurface {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  // 픽셀을 읽고 쓰는 일이 잦아서 CPU 쪽 canvas로 둔다. 색 관리는 sRGB 그대로.
  const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
  if (!context) throw new Error('canvas is not available');
  return {
    width: size.width,
    height: size.height,
    drawGeometry(image: DecodedImage, plan: GeometryPlan): void {
      const drawable = (image as { drawable?: CanvasImageSource }).drawable;
      if (!drawable) throw new Error('image is not a browser image');
      const [a, b, c, d, e, f] = geometryMatrix(image, plan);
      context.save();
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.setTransform(a, b, c, d, e, f);
      context.drawImage(drawable, 0, 0, image.width, image.height);
      context.restore();
    },
    readPixels: () => context.getImageData(0, 0, size.width, size.height).data,
    writePixels(pixels: Uint8ClampedArray): void {
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), size.width, size.height), 0, 0);
    },
    toImage: () => new BrowserDecodedImage(canvas, size.width, size.height),
  };
}
