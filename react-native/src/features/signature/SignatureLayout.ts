import type { Size, Stroke } from './Stroke';

export type PngSpec = {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly strokeWidth: number;
};

/** 캔버스 좌표 획 -> PNG 좌표 획. 정규화 규칙은 REQ-SIGN-007(박스 최소 0.02, 비율 유지, 패딩 안쪽 중앙 정렬). */
export function fitStrokesToPng(
  _strokes: readonly Stroke[],
  _canvas: Size,
  _spec: PngSpec,
): Stroke[] {
  throw new Error('not implemented');
}
