import type { Stroke } from './Stroke';

export type RasterRequest = {
  readonly width: number;
  readonly height: number;
  readonly strokeWidth: number;
  /** 이미 PNG 좌표로 맞춰진 획들. 점 하나짜리 획은 지름 strokeWidth의 원으로 그린다. */
  readonly strokes: readonly Stroke[];
};

/**
 * 플랫폼 부분: 획 -> 투명 배경 + 흰 획 PNG 바이트. 이차 곡선 이음, 둥근 끝·이음(REQ-SIGN-006).
 * 실제 구현은 구현 단계에서 정한다(Skia 등). 계약 테스트는 __testing__/rasterizerContract.ts.
 */
export interface SignatureRasterizer {
  rasterize(request: RasterRequest): Promise<Uint8Array>;
}
