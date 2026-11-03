import type { PhotoEdit } from '../editModel';
import type { DecodedImage, EditRenderer } from '../imagePorts';
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

  render(_image: DecodedImage, _edit: PhotoEdit, _signal: AbortSignal): Promise<DecodedImage> {
    throw new Error('not implemented');
  }
}

/** 실제 canvas 표면(구현 단계, Playwright로 확인). jsdom에서 부르지 않는다. */
export function createCanvasPixelSurface(_size: { width: number; height: number }): PixelSurface {
  throw new Error('not implemented');
}
