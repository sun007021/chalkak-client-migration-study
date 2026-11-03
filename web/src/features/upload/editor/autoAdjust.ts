import type { Size } from '../imageSizing';
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
export function analysisSize(_size: Size, _longEdge: number = AUTO_ANALYSIS_LONG_EDGE): Size {
  throw new Error('not implemented');
}

/** 밝기 히스토그램만. */
export function luminanceHistogram(_pixels: Uint8ClampedArray): Uint32Array {
  throw new Error('not implemented');
}

/** 피부색 판정(부록): R ≥ G ≥ B, R ≥ 0.2, (R−B)/R가 0.1~0.6, 색상 0~50°. 입력은 0~255. */
export function isSkinColor(_r: number, _g: number, _b: number): boolean {
  throw new Error('not implemented');
}

/** RGBA 버퍼에서 통계를 모은다. 알파 0인 픽셀도 센다(분석 표본은 불투명). */
export function analyzePixels(_pixels: Uint8ClampedArray): AutoStats {
  throw new Error('not implemented');
}

/** 통계에서 자동 보정값을 정한다(부록 '자동 보정 식'). 노출 → 블랙 포인트 → 그림자·하이라이트·대비 → 채도. 따뜻함은 0. 각 값은 round2. 픽셀이 없으면 모두 0. */
export function autoAdjustFromStats(_stats: AutoStats): AdjustmentValues {
  throw new Error('not implemented');
}

/** analyzePixels + autoAdjustFromStats. */
export function computeAutoValues(_pixels: Uint8ClampedArray): AdjustmentValues {
  throw new Error('not implemented');
}
