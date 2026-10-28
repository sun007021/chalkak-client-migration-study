import type { AdjustValues, PhotoFilter } from './PhotoEdit';
import type { ColorMatrix } from './PhotoFilters';

/** 0~255 정수 R, G, B, A. */
export type Rgba = readonly [number, number, number, number];

/** shared/photo-edit/filters.json의 `constants`와 같은 값(TC-EDIT-036). */
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
  throw new Error('not implemented');
}

export type ToneParams = Pick<AdjustValues, 'blackPoint' | 'shadows' | 'highlights' | 'contrast'>;

/** 256칸 톤 곡선(입력 i/255 -> 출력 0~1). 블랙 포인트 -> 그림자 -> 하이라이트 -> 대비 순서, 줄어들지 않게 누적 최대값. */
export function buildToneCurve(tone: ToneParams): Float64Array {
  void tone;
  throw new Error('not implemented');
}

/** 곡선 표를 칸 사이 직선 보간으로 읽는다. x는 0~1. */
export function toneCurveValue(table: Float64Array, x: number): number {
  void table;
  void x;
  throw new Error('not implemented');
}

/** 4x5 행렬을 0~255 값에 곱하고 반올림해 0~255로 자른다. */
export function applyColorMatrix(pixel: Rgba, matrix: ColorMatrix): Rgba {
  void pixel;
  void matrix;
  throw new Error('not implemented');
}

/** 조정(선형: 노출·따뜻함·채도 -> 감마 -> 톤 곡선) 뒤 필터 행렬. 알파는 조정이 바꾸지 않는다. */
export function transformPixel(pixel: Rgba, values: AdjustValues, filter: PhotoFilter): Rgba {
  void pixel;
  void values;
  void filter;
  throw new Error('not implemented');
}
