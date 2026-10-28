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

const SRGB_TO_LINEAR = Float64Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

/** 한 픽셀을 src[s..s+3]에서 읽어 dst[d..d+3]에 쓴다. 배열을 만들지 않는다. */
export type PixelRunner = (
  src: Uint8ClampedArray,
  s: number,
  dst: Uint8ClampedArray,
  d: number,
) => void;

/**
 * `createPixelTransform`과 같은 결과를 내는 대량 처리용 변환기(배열을 만들지 않고 룩업 표를 쓴다).
 * 채도가 0이면 채널이 서로 영향을 주지 않아 채널별 256칸 표 하나로 조정 단계가 끝난다.
 * 채도가 0이 아니면 sRGB->선형만 표로 읽고 나머지는 같은 식을 쓴다.
 */
export function createPixelRunner(values: AdjustValues, filter: PhotoFilter): PixelRunner {
  const neutral = isNeutral(values);
  const table = neutral ? null : buildToneCurve(values);
  const m = filterMatrix(filter);
  const gain = 2 ** (C.exposureEvPerUnit * values.exposure);
  const gains = [
    gain * (1 + C.warmthGain * values.warmth),
    gain,
    gain * (1 - C.warmthGain * values.warmth),
  ];
  const storedOf = (linear: number): number => {
    const stored = linearToSrgb(clamp(linear, 0, 1));
    return clamp(Math.floor(toneCurveValue(table as Float64Array, stored) * 255 + 0.5), 0, 255);
  };

  // 조정 단계: 채널별 표(채도 0) 또는 직접 계산.
  let channelTables: Uint8Array[] | null = null;
  if (table && values.saturation === 0) {
    channelTables = gains.map((g) =>
      Uint8Array.from({ length: 256 }, (_, v) => storedOf(SRGB_TO_LINEAR[v] * g)),
    );
  }
  const saturation = 1 + values.saturation;
  const [gr, gg, gb] = gains;

  return (src, s, dst, d) => {
    let r = src[s];
    let g = src[s + 1];
    let b = src[s + 2];
    const a = src[s + 3];
    if (channelTables) {
      r = channelTables[0][r];
      g = channelTables[1][g];
      b = channelTables[2][b];
    } else if (table) {
      const lr = SRGB_TO_LINEAR[r] * gr;
      const lg = SRGB_TO_LINEAR[g] * gg;
      const lb = SRGB_TO_LINEAR[b] * gb;
      const luma = 0.2125 * lr + 0.7154 * lg + 0.0721 * lb;
      r = storedOf(luma + saturation * (lr - luma));
      g = storedOf(luma + saturation * (lg - luma));
      b = storedOf(luma + saturation * (lb - luma));
    }
    if (m) {
      dst[d] = Math.floor(m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4] + 0.5);
      dst[d + 1] = Math.floor(m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9] + 0.5);
      dst[d + 2] = Math.floor(m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14] + 0.5);
      dst[d + 3] = Math.floor(m[15] * r + m[16] * g + m[17] * b + m[18] * a + m[19] + 0.5);
    } else {
      dst[d] = r;
      dst[d + 1] = g;
      dst[d + 2] = b;
      dst[d + 3] = a;
    }
  };
}
