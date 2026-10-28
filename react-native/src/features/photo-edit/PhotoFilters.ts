import type { PhotoFilter } from './PhotoEdit';
import filtersFile from './filters.json';

/** 화면에 보이는 순서(REQ-EDIT-028). */
export const PHOTO_FILTERS: readonly PhotoFilter[] = [
  'original',
  'mono',
  'warm',
  'cool',
  'vintage',
  'vivid',
];

/** 행 우선 4x5 행렬(20개 값). 원본은 null(적용 안 함). 값의 단일 출처는 `./filters.json`(spec 부록과 Android FilterMatrices와 대조함). */
export type ColorMatrix = readonly number[];

const MATRICES = new Map<string, ColorMatrix | null>(
  filtersFile.filters.map((f) => [f.id, f.matrix]),
);

export function filterMatrix(filter: PhotoFilter): ColorMatrix | null {
  return MATRICES.get(filter) ?? null;
}
