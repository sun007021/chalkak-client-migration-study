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

export function editConstants(): EditConstants {
  throw new Error('not implemented');
}
