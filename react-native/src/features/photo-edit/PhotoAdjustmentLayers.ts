import type { AdjustItem, AdjustValues, AdjustmentLayers } from './PhotoEdit';

/** 항목에 적용되는 값: 사용자가 만졌으면 그 값, 아니면 자동 보정값 x 강도(REQ-EDIT-022). */
export function effectiveAdjustValue(layers: AdjustmentLayers, item: AdjustItem): number {
  void layers;
  void item;
  throw new Error('not implemented');
}

export function effectiveAdjustValues(layers: AdjustmentLayers): AdjustValues {
  void layers;
  throw new Error('not implemented');
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
  void layers;
  void item;
  void value;
  throw new Error('not implemented');
}

/** 강도만 바꾼다. 직접 만진 항목은 그대로 남는다. */
export function withAutoStrength(layers: AdjustmentLayers, strength: number): AdjustmentLayers {
  void layers;
  void strength;
  throw new Error('not implemented');
}

/** 분석한 자동 보정값을 바꾼다(강도·직접 값은 유지). */
export function withAutoValues(layers: AdjustmentLayers, auto: AdjustValues): AdjustmentLayers {
  void layers;
  void auto;
  throw new Error('not implemented');
}

/** 조정 "초기화": 강도 0, 직접 값 모두 삭제, 분석해 둔 자동 보정값은 유지(REQ-EDIT-024). */
export function clearedLayers(layers: AdjustmentLayers): AdjustmentLayers {
  void layers;
  throw new Error('not implemented');
}
