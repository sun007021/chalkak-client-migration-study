import filtersFile from './filters.json';
import type { AdjustValues, PhotoFilter } from './PhotoEdit';
import { filterMatrix, type ColorMatrix } from './PhotoFilters';

/** 0~255 정수 R, G, B, A. */
export type Rgba = readonly [number, number, number, number];

/** `filters.json`의 `constants`와 같은 값(TC-EDIT-036). */
export type PhotoEditConstants = {
  exposureEvPerUnit: number;
  warmthGain: number;
  blackPointRange: number;
  shadowsAmount: number;
  highlightsAmount: number;
  contrastAmount: number;
  autoSampleLongEdge: number;
  autoExposureMinEv: number;
  autoExposureMaxEv: number;
  autoWhiteTarget: number;
  minCropFraction: number;
};

export function photoEditConstants(): PhotoEditConstants {
  return { ...filtersFile.constants };
}

const C = filtersFile.constants;
const TABLE_SIZE = 256;

export const srgbToLinear = (x: number): number =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
export const linearToSrgb = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export type ToneParams = Pick<AdjustValues, 'blackPoint' | 'shadows' | 'highlights' | 'contrast'>;

/** 256칸 톤 곡선(입력 i/255 -> 출력 0~1). 블랙 포인트 -> 그림자 -> 하이라이트 -> 대비 순서, 줄어들지 않게 누적 최대값. */
export function buildToneCurve(tone: ToneParams): Float64Array {
  const inputBlack = Math.max(tone.blackPoint, 0) * C.blackPointRange;
  const outputBlack = Math.max(-tone.blackPoint, 0) * C.blackPointRange;
  const table = new Float64Array(TABLE_SIZE);
  let running = 0;
  for (let i = 0; i < TABLE_SIZE; i += 1) {
    const x = i / (TABLE_SIZE - 1);
    let t = clamp((x - inputBlack) / (1 - inputBlack), 0, 1);
    t += tone.shadows * C.shadowsAmount * 4 * t * (1 - t) ** 2;
    t += tone.highlights * C.highlightsAmount * 4 * t * t * (1 - t);
    t -= (tone.contrast * C.contrastAmount * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
    const y = outputBlack + (1 - outputBlack) * clamp(t, 0, 1);
    running = Math.max(running, y);
    table[i] = running;
  }
  return table;
}

/** 곡선 표를 칸 사이 직선 보간으로 읽는다. x는 0~1. */
export function toneCurveValue(table: Float64Array, x: number): number {
  const position = clamp(x, 0, 1) * (TABLE_SIZE - 1);
  const lower = Math.min(Math.floor(position), TABLE_SIZE - 2);
  return table[lower] + (table[lower + 1] - table[lower]) * (position - lower);
}

/** 4x5 행렬을 0~255 값에 곱하고 반올림해 0~255로 자른다. */
export function applyColorMatrix(pixel: Rgba, matrix: ColorMatrix): Rgba {
  const out = [0, 0, 0, 0];
  for (let row = 0; row < 4; row += 1) {
    const m = row * 5;
    const sum =
      matrix[m] * pixel[0] +
      matrix[m + 1] * pixel[1] +
      matrix[m + 2] * pixel[2] +
      matrix[m + 3] * pixel[3] +
      matrix[m + 4];
    out[row] = clamp(Math.floor(sum + 0.5), 0, 255);
  }
  return [out[0], out[1], out[2], out[3]];
}

function isNeutral(v: AdjustValues): boolean {
  return (
    Math.abs(v.exposure) < 1e-12 &&
    Math.abs(v.contrast) < 1e-12 &&
    Math.abs(v.highlights) < 1e-12 &&
    Math.abs(v.shadows) < 1e-12 &&
    Math.abs(v.blackPoint) < 1e-12 &&
    Math.abs(v.saturation) < 1e-12 &&
    Math.abs(v.warmth) < 1e-12
  );
}

/** 조정 단계를 여러 픽셀에 쓰기 위해 톤 곡선을 한 번만 만든 변환기를 돌려준다. */
export function createPixelTransform(
  values: AdjustValues,
  filter: PhotoFilter,
): (pixel: Rgba) => Rgba {
  const neutral = isNeutral(values);
  const table = neutral ? null : buildToneCurve(values);
  const matrix = filterMatrix(filter);
  const gain = 2 ** (C.exposureEvPerUnit * values.exposure);
  const rGain = gain * (1 + C.warmthGain * values.warmth);
  const bGain = gain * (1 - C.warmthGain * values.warmth);
  return (pixel) => {
    let adjusted: Rgba = pixel;
    if (table) {
      const r = srgbToLinear(pixel[0] / 255) * rGain;
      const g = srgbToLinear(pixel[1] / 255) * gain;
      const b = srgbToLinear(pixel[2] / 255) * bGain;
      const luma = 0.2125 * r + 0.7154 * g + 0.0721 * b;
      const channel = (c: number) => {
        const stored = linearToSrgb(clamp(luma + (1 + values.saturation) * (c - luma), 0, 1));
        return clamp(Math.floor(toneCurveValue(table, stored) * 255 + 0.5), 0, 255);
      };
      adjusted = [channel(r), channel(g), channel(b), pixel[3]];
    }
    return matrix ? applyColorMatrix(adjusted, matrix) : adjusted;
  };
}

/** 조정(선형: 노출·따뜻함·채도 -> 감마 -> 톤 곡선) 뒤 필터 행렬. 알파는 조정이 바꾸지 않는다. */
export function transformPixel(pixel: Rgba, values: AdjustValues, filter: PhotoFilter): Rgba {
  return createPixelTransform(values, filter)(pixel);
}
