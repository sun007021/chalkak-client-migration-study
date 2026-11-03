/**
 * 편집 연산 상수(upload-edit.md 부록). shared/photo-edit/filters.json이 아직 없어서 이 객체가 웹의 단일 근거다.
 * 구현 단계에서 shared 파일이 생기면 그 값과 대조하는 테스트를 더한다(TC-EDIT-036, 039).
 */
export interface EditConstants {
  exposureEvPerUnit: number;
  warmthGain: number;
  blackPointRange: number;
  toneAmount: number;
  contrastAmount: number;
  saturationLuma: readonly [number, number, number];
  autoLuma: readonly [number, number, number];
  auto: {
    analysisLongEdge: number;
    exposureMinEv: number;
    exposureMaxEv: number;
    whitePercentile: number;
    whiteTarget: number;
    whiteMin: number;
    exposureTempering: number;
    brightMedian: number;
    brightSlope: number;
    blackPercentile: number;
    blackMargin: number;
    blackTempering: number;
    blackMax: number;
    shadowDark: number;
    shadowFull: number;
    shadowMax: number;
    highlightBright: number;
    highlightFull: number;
    highlightMax: number;
    toneResponseExponent: number;
    contrastLowQuantile: number;
    contrastHighQuantile: number;
    contrastTargetSpread: number;
    contrastSlope: number;
    contrastMax: number;
    saturationMonoLimit: number;
    saturationTarget: number;
    saturationSlope: number;
    saturationMax: number;
    saturationPercentile: number;
    /** 자동 보정을 정하는 순서. */
    order: readonly string[];
  };
}

const CONSTANTS: EditConstants = {
  exposureEvPerUnit: 1.5,
  warmthGain: 0.25,
  blackPointRange: 0.3,
  toneAmount: 0.25,
  contrastAmount: 0.6,
  saturationLuma: [0.2125, 0.7154, 0.0721],
  autoLuma: [0.2126, 0.7152, 0.0722],
  auto: {
    analysisLongEdge: 256,
    exposureMinEv: -0.5,
    exposureMaxEv: 1.0,
    whitePercentile: 0.995,
    whiteTarget: 0.96,
    whiteMin: 0.05,
    exposureTempering: 0.6,
    brightMedian: 0.62,
    brightSlope: 1.2,
    blackPercentile: 0.005,
    blackMargin: 0.01,
    blackTempering: 0.8,
    blackMax: 0.25,
    shadowDark: 0.25,
    shadowFull: 0.8,
    shadowMax: 0.45,
    highlightBright: 0.85,
    highlightFull: 0.3,
    highlightMax: -0.5,
    toneResponseExponent: 0.7,
    contrastLowQuantile: 0.25,
    contrastHighQuantile: 0.75,
    contrastTargetSpread: 0.42,
    contrastSlope: 2.0,
    contrastMax: 0.4,
    saturationMonoLimit: 0.05,
    saturationTarget: 0.7,
    saturationSlope: 0.6,
    saturationMax: 0.25,
    saturationPercentile: 0.9,
    order: ['exposure', 'blackPoint', 'shadows-highlights-contrast', 'saturation'],
  },
};

export function editConstants(): EditConstants {
  return CONSTANTS;
}
