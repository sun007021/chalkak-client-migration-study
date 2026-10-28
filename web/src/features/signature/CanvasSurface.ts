import type { DrawSurface } from './SignatureRasterizer';

/** 실제 구현: 정확히 width×height 픽셀 canvas 요소의 2D 컨텍스트를 DrawSurface로 감싼다. toPng는 canvas.toBlob('image/png'). 브라우저 E2E에서 검증한다. */
export function createCanvasSurface(_width: number, _height: number): DrawSurface {
  throw new Error('not implemented');
}
