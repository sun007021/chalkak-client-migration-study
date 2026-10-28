import filtersFile from './filters.json';
import type { RgbaImage } from './ImageTypes';
import { ZERO_ADJUST_VALUES, type AdjustValues } from './PhotoEdit';
import { linearToSrgb, srgbToLinear } from './PhotoColorTransform';

const C = filtersFile.constants;
const BINS = 256;

// upload-edit.md 부록 "자동 보정 상수 / 식" (Android PhotoAutoAdjuster와 같다).
const WHITE_PERCENTILE = 0.995;
const MIN_WHITE = 0.05;
const EXPOSURE_TEMPERING = 0.6;
const BRIGHT_MEDIAN = 0.62;
const BRIGHT_SLOPE = 1.2;
const BLACK_PERCENTILE = 0.005;
const BLACK_MARGIN = 0.01;
const BLACK_TEMPERING = 0.8;
const BLACK_MAX = 0.25;
const DARK_LEVEL = 0.25;
const DARK_FULL = 0.8;
const SHADOWS_MAX = 0.45;
const BRIGHT_LEVEL = 0.85;
const BRIGHT_FULL = 0.3;
const HIGHLIGHTS_MAX = -0.5;
const RESPONSE_EXPONENT = 0.7;
const TARGET_SPREAD = 0.42;
const CONTRAST_SLOPE = 2.0;
const CONTRAST_MAX = 0.4;
const GRAY_LEVEL = 0.05;
const SATURATION_TARGET = 0.7;
const SATURATION_SLOPE = 0.6;
const SATURATION_MAX = 0.25;
const SATURATION_PERCENTILE = 0.9;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** 소수 둘째 자리, 0.5는 0에서 먼 쪽. -0은 0으로. */
const round2 = (v: number) => ((v < 0 ? -1 : 1) * Math.floor(Math.abs(v) * 100 + 0.5)) / 100 + 0;

type Stats = {
  histogram: number[];
  total: number;
  spreads: Float64Array;
  skinShare: number;
};

function isSkin(r: number, g: number, b: number): boolean {
  if (r < g || g < b || r < 0.2) return false;
  const ratio = (r - b) / r;
  if (ratio < 0.1 || ratio > 0.6) return false;
  return (60 * (g - b)) / (r - b) <= 50;
}

function gather(sample: RgbaImage, count: number): Stats {
  const histogram = new Array<number>(BINS).fill(0);
  const spreads = new Float64Array(count);
  let skin = 0;
  for (let i = 0; i < count; i += 1) {
    const r = sample.data[i * 4] / 255;
    const g = sample.data[i * 4 + 1] / 255;
    const b = sample.data[i * 4 + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    histogram[Math.min(BINS - 1, Math.floor(luma * 255 + 0.5))] += 1;
    spreads[i] = Math.max(r, g, b) - Math.min(r, g, b);
    if (isSkin(r, g, b)) skin += 1;
  }
  spreads.sort();
  return { histogram, total: count, spreads, skinShare: skin / count };
}

/** P(f): 누적 비율이 처음 f 이상이 되는 칸 번호 / 255(없으면 1). */
function percentile(stats: Stats, fraction: number): number {
  let cumulative = 0;
  for (let bin = 0; bin < BINS; bin += 1) {
    cumulative += stats.histogram[bin];
    if (cumulative / stats.total >= fraction) return bin / 255;
  }
  return 1;
}

function share(stats: Stats, test: (level: number) => boolean): number {
  let sum = 0;
  for (let bin = 0; bin < BINS; bin += 1) if (test(bin / 255)) sum += stats.histogram[bin];
  return sum / stats.total;
}

function expose(level: number, exposure: number): number {
  return linearToSrgb(Math.min(1, srgbToLinear(level) * 2 ** (C.exposureEvPerUnit * exposure)));
}

/**
 * 자동 보정값 분석(REQ-EDIT-026). 노출 -> 블랙 포인트 -> 그림자·하이라이트·대비 -> 채도 순서로 정하고
 * 따뜻함은 정하지 않는다(0). 각 값은 소수 둘째 자리로 반올림(0.5는 0에서 먼 쪽).
 * 비어 있는 표본은 아무것도 바꾸지 않는다(REQ-EDIT-027).
 */
export function analyzeAutoAdjust(sample: RgbaImage): AdjustValues {
  const count = sample.width * sample.height;
  if (count <= 0 || sample.data.length < count * 4) return { ...ZERO_ADJUST_VALUES };
  const stats = gather(sample, count);

  const white = percentile(stats, WHITE_PERCENTILE);
  const median = percentile(stats, 0.5);
  let ev = 0;
  if (white < C.autoWhiteTarget) {
    ev =
      Math.log2(srgbToLinear(C.autoWhiteTarget) / srgbToLinear(Math.max(white, MIN_WHITE))) *
      EXPOSURE_TEMPERING;
  } else if (median > BRIGHT_MEDIAN) {
    ev = -(median - BRIGHT_MEDIAN) * BRIGHT_SLOPE;
  }
  const exposure = round2(
    clamp(ev, C.autoExposureMinEv, C.autoExposureMaxEv) / C.exposureEvPerUnit,
  );

  const black = expose(percentile(stats, BLACK_PERCENTILE), exposure);
  const inputBlackRaw = Math.min(Math.max(black - BLACK_MARGIN, 0) * BLACK_TEMPERING, BLACK_MAX);
  const blackPoint = round2(inputBlackRaw / C.blackPointRange);

  const inputBlack = Math.max(blackPoint, 0) * C.blackPointRange;
  const afterBlack = (level: number) =>
    clamp((expose(level, exposure) - inputBlack) / (1 - inputBlack), 0, 1);

  const dark = share(stats, (l) => afterBlack(l) < DARK_LEVEL);
  const shadows = round2(SHADOWS_MAX * clamp(dark / DARK_FULL, 0, 1) ** RESPONSE_EXPONENT);
  const bright = share(stats, (l) => afterBlack(l) > BRIGHT_LEVEL);
  const highlights = round2(
    HIGHLIGHTS_MAX * clamp(bright / BRIGHT_FULL, 0, 1) ** RESPONSE_EXPONENT,
  );
  const spread = afterBlack(percentile(stats, 0.75)) - afterBlack(percentile(stats, 0.25));
  const contrast = round2(clamp((TARGET_SPREAD - spread) * CONTRAST_SLOPE, 0, CONTRAST_MAX));

  const s =
    stats.spreads[
      clamp(
        Math.ceil(SATURATION_PERCENTILE * stats.spreads.length) - 1,
        0,
        stats.spreads.length - 1,
      )
    ];
  const saturation =
    s <= GRAY_LEVEL
      ? 0
      : round2(
          clamp((SATURATION_TARGET - s) * SATURATION_SLOPE, 0, SATURATION_MAX) *
            (1 - stats.skinShare),
        );

  return { exposure, contrast, highlights, shadows, blackPoint, saturation, warmth: 0 };
}
