/**
 * 편집값 모델(upload-edit.md 부록 '편집값 모델과 좌표'). W7a에서는 타입과 "편집하지 않음" 판정만 정한다.
 * 편집기 화면·색 연산·좌표 변환은 W7b. 업로드 준비(PhotoPreparer)는 이 값을 EditRenderer에 그대로 넘긴다.
 */

export const PHOTO_FILTERS = ['original', 'mono', 'warm', 'cool', 'vintage', 'vivid'] as const;
/** 원본/흑백/따뜻하게/차갑게/빈티지/선명하게(REQ-EDIT-028). */
export type PhotoFilter = (typeof PHOTO_FILTERS)[number];

export const ADJUSTMENT_KEYS = ['exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'saturation', 'warmth'] as const;
export type AdjustmentKey = (typeof ADJUSTMENT_KEYS)[number];

/** 자르기 영역. centerX/Y는 회전 전 원본의 가로·세로에 대한 0~1 비율(중심), width/height는 90도씩 돌린 원본에 대한 0~1 비율. 전체는 (0.5, 0.5, 1, 1). */
export interface CropRegion {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface AdjustmentLayers {
  /** 분석해 둔 자동 보정값(항목별 -1~1). 분석 전이거나 분석할 수 없으면 모두 0. */
  autoValues: Readonly<Record<AdjustmentKey, number>>;
  /** 자동 보정 강도 0~1(꺼짐 0). */
  autoStrength: number;
  /** 사용자가 직접 만진 항목만(-1~1). 있으면 자동값×강도보다 우선한다. */
  manual: Readonly<Partial<Record<AdjustmentKey, number>>>;
}

export interface PhotoEdit {
  /** 시계 방향 90도 회전 횟수 0~3. */
  quarterTurns: 0 | 1 | 2 | 3;
  crop: CropRegion;
  filter: PhotoFilter;
  adjustmentLayers: AdjustmentLayers;
}

export const FULL_CROP: CropRegion = { centerX: 0.5, centerY: 0.5, width: 1, height: 1 };

export const NO_AUTO_VALUES: Readonly<Record<AdjustmentKey, number>> = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  blackPoint: 0,
  saturation: 0,
  warmth: 0,
};

/** 아무것도 바꾸지 않은 편집값. */
export const IDENTITY_EDIT: PhotoEdit = {
  quarterTurns: 0,
  crop: FULL_CROP,
  filter: 'original',
  adjustmentLayers: { autoValues: NO_AUTO_VALUES, autoStrength: 0, manual: {} },
};

/** 자르기 영역이 전체와 같다고 보는 허용 오차(REQ-EDIT-004). */
export const CROP_EPSILON = 1e-3;

/**
 * 편집하지 않은 사진인가(REQ-EDIT-005, PhotoEdit.isIdentity): 회전 0, 자르기가 전체와 CROP_EPSILON 이내, 필터 원본, 모든 조정의 유효값이 0.
 * 조정 항목의 유효값 = 직접 만진 값이 있으면 그 값, 없으면 autoValues[항목] × autoStrength.
 */
export function isIdentityEdit(_edit: PhotoEdit): boolean {
  throw new Error('not implemented');
}

/** 두 편집값이 같은가(값 비교, 참조 아님). 같은 편집값으로 다시 확정하면 사진을 다시 준비하지 않는다(REQ-UPL-035). */
export function sameEdit(_a: PhotoEdit, _b: PhotoEdit): boolean {
  throw new Error('not implemented');
}
