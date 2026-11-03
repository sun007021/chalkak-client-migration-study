import type { AdjustmentKey, AdjustmentLayers } from '../editModel';

/** 항목별 값(-1~1). */
export type AdjustmentValues = Readonly<Record<AdjustmentKey, number>>;

/** 화면 표시 순서(자동 제외). 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함(REQ-EDIT-019). */
export const ADJUSTMENT_ORDER: readonly AdjustmentKey[] = ['exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'saturation', 'warmth'];

/** 직접 조정 값 범위 -1~1. 표시값은 100배한 정수. */
export const ADJUST_RANGE = { min: -1, max: 1 } as const;

/** 표시값(정수 -100~100) ↔ 값(-1~1). 범위를 넘으면 자르고 소수 둘째 자리로 맞춘다. */
export function toDisplayValue(_value: number): number {
  throw new Error('not implemented');
}
export function fromDisplayValue(_display: number): number {
  throw new Error('not implemented');
}

/** 톤 곡선에 쓰는 네 항목. */
export type ToneValues = Pick<AdjustmentValues, 'blackPoint' | 'shadows' | 'highlights' | 'contrast'>;

/**
 * 연속 톤 곡선 한 점: 입력 x(0~1)를 블랙 포인트(inputBlack = max(bp,0)×0.3)로 편 t에 그림자 → 하이라이트 → 대비를 순서대로 적용하고
 * y = outputBlack + (1 − outputBlack) × clamp(t, 0, 1), outputBlack = max(−bp,0)×0.3. 누적 최대값은 취하지 않는다.
 */
export function toneCurveAt(_tone: ToneValues, _x: number): number {
  throw new Error('not implemented');
}

/** 256칸 표(i번째 입력 i/255). 표가 줄어들지 않도록 누적 최대값을 취한다. 값은 0~1. */
export function buildToneCurve(_tone: ToneValues): Float64Array {
  throw new Error('not implemented');
}

/**
 * 조정을 RGBA 버퍼(0~255)에 제자리로 적용한다. 순서: 선형 변환(노출 → 따뜻함 → 채도) → 저장 값으로 되돌림 → 톤 곡선 표(칸 사이 직선 보간) → 반올림.
 * 알파는 바꾸지 않는다. 모든 값이 0이면 버퍼를 건드리지 않는다.
 */
export function applyAdjustments(_pixels: Uint8ClampedArray, _values: AdjustmentValues): void {
  throw new Error('not implemented');
}

/** 모든 항목이 0인가. */
export function isZeroAdjustments(_values: AdjustmentValues): boolean {
  throw new Error('not implemented');
}

/** 항목에 적용되는 값: 직접 만졌으면 그 값, 아니면 autoValues × autoStrength(REQ-EDIT-022). */
export function effectiveValue(_layers: AdjustmentLayers, _key: AdjustmentKey): number {
  throw new Error('not implemented');
}
export function effectiveValues(_layers: AdjustmentLayers): AdjustmentValues {
  throw new Error('not implemented');
}

/**
 * 항목 값을 직접 정한다. 새 값이 자동 보정 몫(autoValues × autoStrength, 꺼져 있으면 0)과 같으면(소수 둘째 자리 기준) 직접 만진 표시를 지운다(REQ-EDIT-023).
 * 값은 -1~1로 자르고 소수 둘째 자리로 맞춘다.
 */
export function withManualValue(_layers: AdjustmentLayers, _key: AdjustmentKey, _value: number): AdjustmentLayers {
  throw new Error('not implemented');
}

/** 자동 강도(0~1로 자름)만 바꾼다. 직접 만진 항목은 그대로(REQ-EDIT-022). */
export function withAutoStrength(_layers: AdjustmentLayers, _strength: number): AdjustmentLayers {
  throw new Error('not implemented');
}

/** 새 분석값으로 바꾼다(강도·직접 값은 유지). */
export function withAutoValues(_layers: AdjustmentLayers, _autoValues: AdjustmentValues): AdjustmentLayers {
  throw new Error('not implemented');
}

/** 조정 탭 "초기화": 강도 0, 직접 값 모두 삭제, 분석해 둔 autoValues는 유지(REQ-EDIT-024). */
export function clearedLayers(_layers: AdjustmentLayers): AdjustmentLayers {
  throw new Error('not implemented');
}
