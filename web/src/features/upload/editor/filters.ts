import type { PhotoFilter } from '../editModel';

/** 한 행: 입력 R, G, B, A 계수와 더하는 값(0~255 단위). */
export type ColorMatrixRow = readonly [number, number, number, number, number];
/** 행: 결과 R, G, B, A. */
export type ColorMatrix = readonly [ColorMatrixRow, ColorMatrixRow, ColorMatrixRow, ColorMatrixRow];

/** 필터의 4×5 행렬(부록 '필터 4×5 행렬'). 원본은 적용하지 않으므로 null. */
export function filterMatrix(_filter: PhotoFilter): ColorMatrix | null {
  throw new Error('not implemented');
}

/**
 * 필터를 RGBA 버퍼(0~255)에 제자리로 적용한다: 결과 = 입력 R·m0 + G·m1 + B·m2 + A·m3 + m4를 반올림하고 0~255로 자른다.
 * 'original'이면 버퍼를 건드리지 않는다. 버퍼 길이는 4의 배수.
 */
export function applyFilter(_pixels: Uint8ClampedArray, _filter: PhotoFilter): void {
  throw new Error('not implemented');
}
