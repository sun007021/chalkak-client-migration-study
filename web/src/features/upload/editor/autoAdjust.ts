import { NO_AUTO_VALUES } from '../editModel';
import { fitLongEdge } from '../imageSizing';
import type { Size } from '../imageSizing';
import { linearToSrgb, round2, srgbToLinear } from './colorMath';
import { editConstants } from './editConstants';
import type { AdjustmentValues } from './adjustments';

/** 자동 보정 분석 표본의 긴 변(REQ-EDIT-025). */
export const AUTO_ANALYSIS_LONG_EDGE = 256;

export interface AutoStats {
  /** 256칸 밝기 히스토그램(칸 번호 = min(255, round(L × 255)), L = 0.2126R + 0.7152G + 0.0722B, 저장 값 기준). 합은 분석한 픽셀 수. */
  histogram: ArrayLike<number>;
  /** 채도(가장 큰 채널 − 가장 작은 채널, 0~1)의 하위 90% 지점. */
  saturationP90: number;
  /** 피부색 픽셀 비율 0~1. */
  skinRatio: number;
}

/** 분석 표본 크기: 긴 변을 256으로 줄이고(확대 안 함) 각 변 최소 1. */
export function analysisSize(size: Size, longEdge: number = AUTO_ANALYSIS_LONG_EDGE): Size {
  return fitLongEdge(size, longEdge);
}

/** 밝기 히스토그램만. */
export function luminanceHistogram(pixels: Uint8ClampedArray): Uint32Array {
  const [lr, lg, lb] = editConstants().autoLuma;
  const histogram = new Uint32Array(256);
  for (let i = 0; i + 3 < pixels.length; i += 4) histogram[lumaBin(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!, lr, lg, lb)]! += 1;
  return histogram;
}

/** 피부색 판정(부록): R ≥ G ≥ B, R ≥ 0.2, (R−B)/R가 0.1~0.6, 색상 0~50°. 입력은 0~255. */
export function isSkinColor(r: number, g: number, b: number): boolean {
  if (!(r >= g && g >= b) || r / 255 < 0.2) return false;
  const chroma = (r - b) / r;
  if (chroma < 0.1 || chroma > 0.6) return false;
  const hue = 60 * ((g - b) / (r - b));
  return hue >= 0 && hue <= 50;
}

/** RGBA 버퍼에서 통계를 모은다. 알파 0인 픽셀도 센다(분석 표본은 불투명). */
export function analyzePixels(pixels: Uint8ClampedArray): AutoStats {
  const [lr, lg, lb] = editConstants().autoLuma;
  const histogram = new Uint32Array(256);
  const saturationBins = new Uint32Array(256);
  let skin = 0;
  let count = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    histogram[lumaBin(r, g, b, lr, lg, lb)]! += 1;
    saturationBins[Math.max(r, g, b) - Math.min(r, g, b)]! += 1;
    if (isSkinColor(r, g, b)) skin += 1;
    count += 1;
  }
  if (count === 0) return { histogram, saturationP90: 0, skinRatio: 0 };
  const target = editConstants().auto.saturationPercentile;
  let cumulative = 0;
  let saturationBin = 255;
  for (let v = 0; v < 256; v += 1) {
    cumulative += saturationBins[v]!;
    if (cumulative / count >= target) {
      saturationBin = v;
      break;
    }
  }
  return { histogram, saturationP90: saturationBin / 255, skinRatio: skin / count };
}

/** 통계에서 자동 보정값을 정한다(부록 '자동 보정 식'). 노출 → 블랙 포인트 → 그림자·하이라이트·대비 → 채도. 따뜻함은 0. 각 값은 round2. 픽셀이 없으면 모두 0. */
export function autoAdjustFromStats(stats: AutoStats): AdjustmentValues {
  const { histogram } = stats;
  let total = 0;
  for (let bin = 0; bin < histogram.length; bin += 1) total += histogram[bin]!;
  if (total === 0) return { ...NO_AUTO_VALUES };
  const a = editConstants().auto;
  const perUnit = editConstants().exposureEvPerUnit;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  // P(f): 누적 비율이 처음 f 이상이 되는 칸 번호 / 255(없으면 1.0)
  const percentile = (f: number): number => {
    let cumulative = 0;
    for (let bin = 0; bin < 256; bin += 1) {
      cumulative += histogram[bin]!;
      if (cumulative / total >= f) return bin / 255;
    }
    return 1;
  };
  // 노출
  const white = percentile(a.whitePercentile);
  const median = percentile(0.5);
  let ev = 0;
  if (white < a.whiteTarget) ev = Math.log2(srgbToLinear(a.whiteTarget) / srgbToLinear(Math.max(white, a.whiteMin))) * a.exposureTempering;
  else if (median > a.brightMedian) ev = -(median - a.brightMedian) * a.brightSlope;
  ev = clamp(ev, a.exposureMinEv, a.exposureMaxEv);
  const exposure = round2(ev / perUnit);
  const expose = (l: number): number => linearToSrgb(Math.min(1, srgbToLinear(l) * 2 ** (perUnit * exposure)));
  // 블랙 포인트
  const black = expose(percentile(a.blackPercentile));
  const inputBlackAuto = Math.min(Math.max(black - a.blackMargin, 0) * a.blackTempering, a.blackMax);
  const blackPoint = round2(inputBlackAuto / editConstants().blackPointRange);
  const inputBlack = Math.max(blackPoint, 0) * editConstants().blackPointRange;
  const afterBlack = (l: number): number => clamp((expose(l) - inputBlack) / (1 - inputBlack), 0, 1);
  // 그림자·하이라이트
  let dark = 0;
  let bright = 0;
  for (let bin = 0; bin < 256; bin += 1) {
    const n = histogram[bin]!;
    if (n === 0) continue;
    const l = afterBlack(bin / 255);
    if (l < a.shadowDark) dark += n / total;
    if (l > a.highlightBright) bright += n / total;
  }
  const shadows = round2(a.shadowMax * clamp(dark / a.shadowFull, 0, 1) ** a.toneResponseExponent);
  const highlights = round2(a.highlightMax * clamp(bright / a.highlightFull, 0, 1) ** a.toneResponseExponent);
  // 대비
  const spread = afterBlack(percentile(a.contrastHighQuantile)) - afterBlack(percentile(a.contrastLowQuantile));
  const contrast = round2(clamp((a.contrastTargetSpread - spread) * a.contrastSlope, 0, a.contrastMax));
  // 채도
  const s = stats.saturationP90;
  const saturation = s <= a.saturationMonoLimit ? 0 : round2(clamp((a.saturationTarget - s) * a.saturationSlope, 0, a.saturationMax) * (1 - stats.skinRatio));
  return { exposure, contrast, highlights, shadows, blackPoint, saturation, warmth: 0 };
}

/** analyzePixels + autoAdjustFromStats. */
export function computeAutoValues(pixels: Uint8ClampedArray): AdjustmentValues {
  return autoAdjustFromStats(analyzePixels(pixels));
}

function lumaBin(r: number, g: number, b: number, lr: number, lg: number, lb: number): number {
  return Math.min(255, Math.round(((lr * r + lg * g + lb * b) / 255) * 255));
}
