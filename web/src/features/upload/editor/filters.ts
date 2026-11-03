import type { PhotoFilter } from '../editModel';

/** 한 행: 입력 R, G, B, A 계수와 더하는 값(0~255 단위). */
export type ColorMatrixRow = readonly [number, number, number, number, number];
/** 행: 결과 R, G, B, A. */
export type ColorMatrix = readonly [ColorMatrixRow, ColorMatrixRow, ColorMatrixRow, ColorMatrixRow];

/** 필터의 4×5 행렬(부록 '필터 4×5 행렬'). 원본은 적용하지 않으므로 null. */
const ALPHA_ROW: ColorMatrixRow = [0, 0, 0, 1, 0];
const MATRICES: Readonly<Record<Exclude<PhotoFilter, 'original'>, ColorMatrix>> = {
  mono: [[0.299, 0.587, 0.114, 0, 0], [0.299, 0.587, 0.114, 0, 0], [0.299, 0.587, 0.114, 0, 0], ALPHA_ROW],
  warm: [[1.08, 0, 0, 0, 8], [0, 1.02, 0, 0, 4], [0, 0, 0.88, 0, 0], ALPHA_ROW],
  cool: [[0.9, 0, 0, 0, 0], [0, 1, 0, 0, 2], [0, 0, 1.1, 0, 10], ALPHA_ROW],
  vintage: [[0.63, 0.35, 0.09, 0, 18], [0.16, 0.76, 0.08, 0, 14], [0.12, 0.24, 0.51, 0, 10], ALPHA_ROW],
  vivid: [[1.2754, -0.2503, -0.0252, 0, 0], [-0.0746, 1.0997, -0.0252, 0, 0], [-0.0746, -0.2503, 1.3248, 0, 0], ALPHA_ROW],
};

export function filterMatrix(filter: PhotoFilter): ColorMatrix | null {
  return filter === 'original' ? null : MATRICES[filter];
}

/**
 * 필터를 RGBA 버퍼(0~255)에 제자리로 적용한다: 결과 = 입력 R·m0 + G·m1 + B·m2 + A·m3 + m4를 반올림하고 0~255로 자른다.
 * 'original'이면 버퍼를 건드리지 않는다. 버퍼 길이는 4의 배수.
 */
export function applyFilter(pixels: Uint8ClampedArray, filter: PhotoFilter): void {
  const m = filterMatrix(filter);
  if (!m) return;
  const [r, g, b, a] = m;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const pr = pixels[i]!;
    const pg = pixels[i + 1]!;
    const pb = pixels[i + 2]!;
    const pa = pixels[i + 3]!;
    pixels[i] = Math.round(pr * r[0] + pg * r[1] + pb * r[2] + pa * r[3] + r[4]);
    pixels[i + 1] = Math.round(pr * g[0] + pg * g[1] + pb * g[2] + pa * g[3] + g[4]);
    pixels[i + 2] = Math.round(pr * b[0] + pg * b[1] + pb * b[2] + pa * b[3] + b[4]);
    pixels[i + 3] = Math.round(pr * a[0] + pg * a[1] + pb * a[2] + pa * a[3] + a[4]);
  }
}
