import type { Size } from './ImageTypes';

/** 시계 방향 90도 회전 횟수. */
export type QuarterTurns = 0 | 1 | 2 | 3;

/**
 * 자르기 영역(플랫폼 공통 편집값 모델, upload-edit.md 부록).
 * `centerX`/`centerY`는 **회전 전 원본**의 가로·세로에 대한 0~1 비율, `width`/`height`는 **90도씩 돌린** 원본의 가로·세로에 대한 0~1 비율이다.
 * 전체 자르기는 (0.5, 0.5, 1, 1).
 */
export type CropWindow = { centerX: number; centerY: number; width: number; height: number };

export type PhotoFilter = 'original' | 'mono' | 'warm' | 'cool' | 'vintage' | 'vivid';

/** 조정 항목(자동 제외). 화면 순서는 ADJUST_ITEMS. */
export type AdjustItem =
  'exposure' | 'contrast' | 'highlights' | 'shadows' | 'blackPoint' | 'saturation' | 'warmth';

export const ADJUST_ITEMS: readonly AdjustItem[] = [
  'exposure',
  'contrast',
  'highlights',
  'shadows',
  'blackPoint',
  'saturation',
  'warmth',
];

/** 항목별 값, 범위 -1~1(화면에는 100배한 정수). */
export type AdjustValues = Record<AdjustItem, number>;

/**
 * 조정 값의 두 층(REQ-EDIT-022). 항목에 적용되는 값은 사용자가 만졌으면 `user`, 아니면 `auto * autoStrength`.
 * `autoStrength`는 0~1이고 0이면 자동 보정이 꺼진 것이다. `auto`는 분석해 둔 값이다.
 */
export type AdjustmentLayers = {
  auto: AdjustValues;
  autoStrength: number;
  user: Partial<AdjustValues>;
};

export type PhotoEdit = {
  quarterTurns: QuarterTurns;
  crop: CropWindow;
  /** 수평 보정 각도. UI가 없어 항상 0(REQ-EDIT-017). */
  straightenDegrees: 0;
  filter: PhotoFilter;
  adjustments: AdjustmentLayers;
};

export const ZERO_ADJUST_VALUES: AdjustValues = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  blackPoint: 0,
  saturation: 0,
  warmth: 0,
};

export const FULL_CROP: CropWindow = { centerX: 0.5, centerY: 0.5, width: 1, height: 1 };

/** 아무것도 바뀌지 않은 편집값. 호출마다 새 객체를 돌려준다. */
export function identityEdit(): PhotoEdit {
  return {
    quarterTurns: 0,
    crop: { ...FULL_CROP },
    straightenDegrees: 0,
    filter: 'original',
    adjustments: { auto: { ...ZERO_ADJUST_VALUES }, autoStrength: 0, user: {} },
  };
}

/** 자르기가 전체와 1e-3 이내로 같으면 true(REQ-EDIT-004). */
export function isFullCrop(crop: CropWindow, tolerance = 1e-3): boolean {
  return (
    Math.abs(crop.centerX - FULL_CROP.centerX) <= tolerance &&
    Math.abs(crop.centerY - FULL_CROP.centerY) <= tolerance &&
    Math.abs(crop.width - FULL_CROP.width) <= tolerance &&
    Math.abs(crop.height - FULL_CROP.height) <= tolerance
  );
}

/** 회전 0, 전체 자르기(1e-3 이내), 원본 필터, 적용되는 조정 값이 모두 0이면 true(REQ-EDIT-005). */
export function isIdentityEdit(edit: PhotoEdit): boolean {
  if (edit.quarterTurns !== 0 || edit.filter !== 'original' || !isFullCrop(edit.crop)) return false;
  const { auto, autoStrength, user } = edit.adjustments;
  return ADJUST_ITEMS.every((item) => {
    const value = user[item] ?? auto[item] * autoStrength;
    return Math.abs(value) < 1e-9;
  });
}

/** 두 편집값이 같은지(같은 편집값으로 확정하면 다시 준비하지 않는다, REQ-UPL-035). 깊은 비교. */
export function editsEqual(a: PhotoEdit, b: PhotoEdit): boolean {
  if (a.quarterTurns !== b.quarterTurns || a.filter !== b.filter) return false;
  if (
    a.crop.centerX !== b.crop.centerX ||
    a.crop.centerY !== b.crop.centerY ||
    a.crop.width !== b.crop.width ||
    a.crop.height !== b.crop.height
  ) {
    return false;
  }
  if (a.adjustments.autoStrength !== b.adjustments.autoStrength) return false;
  return ADJUST_ITEMS.every(
    (item) =>
      a.adjustments.auto[item] === b.adjustments.auto[item] &&
      a.adjustments.user[item] === b.adjustments.user[item],
  );
}

export type { Size };
