import {
  ADJUST_ITEMS,
  type AdjustItem,
  type AdjustValues,
  type AdjustmentLayers,
} from './PhotoEdit';

const SAME_VALUE = 1e-9;
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** 자동 보정 몫(자동값 x 강도). -0은 0으로 돌린다. */
function autoShare(layers: AdjustmentLayers, item: AdjustItem): number {
  return layers.auto[item] * layers.autoStrength + 0;
}

/** 항목에 적용되는 값: 사용자가 만졌으면 그 값, 아니면 자동 보정값 x 강도(REQ-EDIT-022). */
export function effectiveAdjustValue(layers: AdjustmentLayers, item: AdjustItem): number {
  return layers.user[item] ?? autoShare(layers, item);
}

export function effectiveAdjustValues(layers: AdjustmentLayers): AdjustValues {
  const values = {} as AdjustValues;
  for (const item of ADJUST_ITEMS) values[item] = effectiveAdjustValue(layers, item);
  return values;
}

/**
 * 사용자가 항목을 직접 정한다. 자동 보정 몫(자동값 x 강도, 꺼져 있으면 0)과 같은 값이면
 * 직접 만진 표시를 지워 그 항목이 다시 자동 보정을 따르게 한다(REQ-EDIT-023).
 */
export function withUserValue(
  layers: AdjustmentLayers,
  item: AdjustItem,
  value: number,
): AdjustmentLayers {
  const clamped = clamp(value, -1, 1);
  const user = { ...layers.user };
  if (Math.abs(clamped - autoShare(layers, item)) < SAME_VALUE) delete user[item];
  else user[item] = clamped;
  return { ...layers, user };
}

/** 강도만 바꾼다. 직접 만진 항목은 그대로 남는다. */
export function withAutoStrength(layers: AdjustmentLayers, strength: number): AdjustmentLayers {
  return { ...layers, user: { ...layers.user }, autoStrength: clamp(strength, 0, 1) };
}

/** 분석한 자동 보정값을 바꾼다(강도·직접 값은 유지). */
export function withAutoValues(layers: AdjustmentLayers, auto: AdjustValues): AdjustmentLayers {
  return { ...layers, auto: { ...auto }, user: { ...layers.user } };
}

/** 조정 "초기화": 강도 0, 직접 값 모두 삭제, 분석해 둔 자동 보정값은 유지(REQ-EDIT-024). */
export function clearedLayers(layers: AdjustmentLayers): AdjustmentLayers {
  return { auto: { ...layers.auto }, autoStrength: 0, user: {} };
}
