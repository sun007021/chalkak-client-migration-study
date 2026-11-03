import { ADJUSTMENT_KEYS } from '../editModel';
import type { AdjustmentKey, AdjustmentLayers } from '../editModel';
import { linearToSrgb, round2, srgbToLinear } from './colorMath';
import { editConstants } from './editConstants';

/** 항목별 값(-1~1). */
export type AdjustmentValues = Readonly<Record<AdjustmentKey, number>>;

/** 화면 표시 순서(자동 제외). 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함(REQ-EDIT-019). */
export const ADJUSTMENT_ORDER: readonly AdjustmentKey[] = ['exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'saturation', 'warmth'];

/** 직접 조정 값 범위 -1~1. 표시값은 100배한 정수. */
export const ADJUST_RANGE = { min: -1, max: 1 } as const;

/** 표시값(정수 -100~100) ↔ 값(-1~1). 범위를 넘으면 자르고 소수 둘째 자리로 맞춘다. */
export function toDisplayValue(value: number): number {
  const scaled = clampUnit(value) * 100;
  // 0.5는 0에서 먼 쪽으로(양수·음수 대칭, 자바스크립트 Math.round는 -12.5를 -12로 보낸다).
  const d = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return d === 0 ? 0 : d;
}
export function fromDisplayValue(display: number): number {
  return clampUnit(Math.round(display) / 100);
}

/**
 * 슬라이더 키보드 조작(REQ-EDIT-019, 접근성): ←/↓ -1, →/↑ +1, PageDown -10, PageUp +10, Home -100, End +100. 현재 표시값을 받아 새 표시값(-100~100)을 돌려주고 해당 키가 아니면 null.
 */
export function keyboardAdjustDisplay(current: number, key: string): number | null {
  const clamp = (v: number) => Math.min(100, Math.max(-100, v));
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(current - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(current + 1);
    case 'PageDown':
      return clamp(current - 10);
    case 'PageUp':
      return clamp(current + 10);
    case 'Home':
      return -100;
    case 'End':
      return 100;
    default:
      return null;
  }
}

/** 톤 곡선에 쓰는 네 항목. */
export type ToneValues = Pick<AdjustmentValues, 'blackPoint' | 'shadows' | 'highlights' | 'contrast'>;

/**
 * 연속 톤 곡선 한 점: 입력 x(0~1)를 블랙 포인트(inputBlack = max(bp,0)×0.3)로 편 t에 그림자 → 하이라이트 → 대비를 순서대로 적용하고
 * y = outputBlack + (1 − outputBlack) × clamp(t, 0, 1), outputBlack = max(−bp,0)×0.3. 누적 최대값은 취하지 않는다.
 */
export function toneCurveAt(tone: ToneValues, x: number): number {
  const c = editConstants();
  const inputBlack = Math.max(tone.blackPoint, 0) * c.blackPointRange;
  const outputBlack = Math.max(-tone.blackPoint, 0) * c.blackPointRange;
  let t = Math.min(1, Math.max(0, (x - inputBlack) / (1 - inputBlack)));
  t += tone.shadows * c.toneAmount * 4 * t * (1 - t) * (1 - t);
  t += tone.highlights * c.toneAmount * 4 * t * t * (1 - t);
  t -= (tone.contrast * c.contrastAmount * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
  return outputBlack + (1 - outputBlack) * Math.min(1, Math.max(0, t));
}

/** 256칸 표(i번째 입력 i/255). 표가 줄어들지 않도록 누적 최대값을 취한다. 값은 0~1. */
export function buildToneCurve(tone: ToneValues): Float64Array {
  const table = new Float64Array(256);
  let max = 0;
  for (let i = 0; i < 256; i += 1) {
    max = Math.max(max, toneCurveAt(tone, i / 255));
    table[i] = max;
  }
  return table;
}

/**
 * 조정을 RGBA 버퍼(0~255)에 제자리로 적용한다. 순서: 선형 변환(노출 → 따뜻함 → 채도) → 저장 값으로 되돌림 → 톤 곡선 표(칸 사이 직선 보간) → 반올림.
 * 알파는 바꾸지 않는다. 모든 값이 0이면 버퍼를 건드리지 않는다.
 */
export function applyAdjustments(pixels: Uint8ClampedArray, values: AdjustmentValues): void {
  if (isZeroAdjustments(values)) return;
  const c = editConstants();
  const exposureGain = 2 ** (c.exposureEvPerUnit * values.exposure);
  const rGain = exposureGain * (1 + c.warmthGain * values.warmth);
  const bGain = exposureGain * (1 - c.warmthGain * values.warmth);
  const [lr, lg, lb] = c.saturationLuma;
  const satFactor = 1 + values.saturation;
  const curve = buildToneCurve(values);
  const lut = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) lut[i] = srgbToLinear(i / 255);
  const toTone = (stored: number): number => {
    const pos = Math.min(1, Math.max(0, stored)) * 255;
    const lo = Math.floor(pos);
    const hi = Math.min(255, lo + 1);
    const y = curve[lo]! + (curve[hi]! - curve[lo]!) * (pos - lo);
    return Math.min(255, Math.max(0, Math.round(y * 255)));
  };
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    let r = lut[pixels[i]!]! * rGain;
    let g = lut[pixels[i + 1]!]! * exposureGain;
    let b = lut[pixels[i + 2]!]! * bGain;
    const luma = lr * r + lg * g + lb * b;
    r = luma + satFactor * (r - luma);
    g = luma + satFactor * (g - luma);
    b = luma + satFactor * (b - luma);
    pixels[i] = toTone(linearToSrgb(Math.min(1, Math.max(0, r))));
    pixels[i + 1] = toTone(linearToSrgb(Math.min(1, Math.max(0, g))));
    pixels[i + 2] = toTone(linearToSrgb(Math.min(1, Math.max(0, b))));
  }
}

/** 모든 항목이 0인가. */
export function isZeroAdjustments(values: AdjustmentValues): boolean {
  return ADJUSTMENT_KEYS.every((key) => values[key] === 0);
}

/** 항목에 적용되는 값: 직접 만졌으면 그 값, 아니면 autoValues × autoStrength(REQ-EDIT-022). */
export function effectiveValue(layers: AdjustmentLayers, key: AdjustmentKey): number {
  return layers.manual[key] ?? layers.autoValues[key] * layers.autoStrength;
}
export function effectiveValues(layers: AdjustmentLayers): AdjustmentValues {
  const out = {} as Record<AdjustmentKey, number>;
  for (const key of ADJUSTMENT_KEYS) out[key] = effectiveValue(layers, key);
  return out;
}

/**
 * 항목 값을 직접 정한다. 새 값이 자동 보정 몫(autoValues × autoStrength, 꺼져 있으면 0)과 같으면(소수 둘째 자리 기준) 직접 만진 표시를 지운다(REQ-EDIT-023).
 * 값은 -1~1로 자르고 소수 둘째 자리로 맞춘다.
 */
export function withManualValue(layers: AdjustmentLayers, key: AdjustmentKey, value: number): AdjustmentLayers {
  const next = round2(clampUnit(value));
  const share = round2(layers.autoValues[key] * layers.autoStrength);
  const manual = { ...layers.manual };
  if (next === share) delete manual[key];
  else manual[key] = next;
  return { ...layers, manual };
}

/** 자동 강도(0~1로 자름)만 바꾼다. 직접 만진 항목은 그대로(REQ-EDIT-022). */
export function withAutoStrength(layers: AdjustmentLayers, strength: number): AdjustmentLayers {
  return { ...layers, manual: { ...layers.manual }, autoStrength: Math.min(1, Math.max(0, strength)) };
}

/** 새 분석값으로 바꾼다(강도·직접 값은 유지). */
export function withAutoValues(layers: AdjustmentLayers, autoValues: AdjustmentValues): AdjustmentLayers {
  return { ...layers, manual: { ...layers.manual }, autoValues: { ...autoValues } };
}

/** 조정 탭 "초기화": 강도 0, 직접 값 모두 삭제, 분석해 둔 autoValues는 유지(REQ-EDIT-024). */
export function clearedLayers(layers: AdjustmentLayers): AdjustmentLayers {
  return { autoValues: layers.autoValues, autoStrength: 0, manual: {} };
}

function clampUnit(v: number): number {
  return Math.min(ADJUST_RANGE.max, Math.max(ADJUST_RANGE.min, v));
}
