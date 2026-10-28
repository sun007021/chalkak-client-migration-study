import type { PhotoFilter } from './PhotoEdit';

/** 화면에 보이는 순서(REQ-EDIT-028). */
export const PHOTO_FILTERS: readonly PhotoFilter[] = [
  'original',
  'mono',
  'warm',
  'cool',
  'vintage',
  'vivid',
];

/** 행 우선 4x5 행렬(20개 값). 원본은 null(적용 안 함). 값의 단일 출처는 `shared/photo-edit/filters.json`. */
export type ColorMatrix = readonly number[];

export function filterMatrix(filter: PhotoFilter): ColorMatrix | null {
  void filter;
  throw new Error('not implemented');
}
