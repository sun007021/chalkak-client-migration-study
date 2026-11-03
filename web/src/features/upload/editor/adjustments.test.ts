import { IDENTITY_EDIT, NO_AUTO_VALUES } from '../editModel';
import type { AdjustmentKey, AdjustmentLayers } from '../editModel';
import {
  ADJUSTMENT_ORDER,
  ADJUST_RANGE,
  applyAdjustments,
  buildToneCurve,
  clearedLayers,
  effectiveValue,
  effectiveValues,
  fromDisplayValue,
  isZeroAdjustments,
  toDisplayValue,
  toneCurveAt,
  withAutoStrength,
  withAutoValues,
  withManualValue,
} from './adjustments';
import { ZERO_ADJUSTMENTS_FOR_TEST as ZERO } from '../../../test/adjustmentValues';
import { expectRgbNear, grayRamp, pixelAt, pixelsOf, solid } from '../../../test/pixels';

const TONE0 = { blackPoint: 0, shadows: 0, highlights: 0, contrast: 0 };
const layers = (patch: Partial<AdjustmentLayers> = {}): AdjustmentLayers => ({ ...IDENTITY_EDIT.adjustmentLayers, ...patch });
const gray = (v: number) => solid(1, 1, [v, v, v, 255]);

describe('조정 항목과 범위 (REQ-EDIT-019)', () => {
  it('TC-EDIT-023 항목은 노출, 대비, 하이라이트, 그림자, 블랙 포인트, 채도, 따뜻함 순서이고(자동은 따로 강도 0~1) 값 범위는 -1~1이다', () => {
    expect([...ADJUSTMENT_ORDER]).toEqual(['exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'saturation', 'warmth']);
    expect(ADJUST_RANGE).toEqual({ min: -1, max: 1 });
  });

  it('TC-EDIT-023 표시값은 값의 100배 정수(-100~100)이고 범위를 넘으면 자른다', () => {
    expect(toDisplayValue(0.3)).toBe(30);
    expect(toDisplayValue(-1)).toBe(-100);
    expect(toDisplayValue(1)).toBe(100);
    expect(toDisplayValue(0.456)).toBe(46);
    expect(toDisplayValue(1.5)).toBe(100);
    expect(toDisplayValue(-3)).toBe(-100);
    expect(fromDisplayValue(30)).toBeCloseTo(0.3, 12);
    expect(fromDisplayValue(-100)).toBe(-1);
    expect(fromDisplayValue(250)).toBe(1);
    expect(fromDisplayValue(-250)).toBe(-1);
  });

  it('TC-EDIT-023 표시값을 다시 값으로 바꾸면 처음 표시값으로 돌아온다(-100~100 전체)', () => {
    for (let d = -100; d <= 100; d += 1) expect(toDisplayValue(fromDisplayValue(d))).toBe(d);
  });
});

describe('조정 연산 골든 (부록 조정 항목 상수, sRGB 변환과 처리 순서)', () => {
  // 기대값은 부록 식을 손으로 계산한 값이다(참조 계산: 선형 변환 → 저장 값 → 톤 곡선 표 → 반올림, 허용 오차 ±2).

  it('TC-EDIT-024 회색 128에서 노출 +1, +0.5, -1은 선형 값에 2^(1.5v)를 곱해 약 205, 162, 78이고 0이면 그대로다', () => {
    // 선형(128/255)=0.21586. ×2^1.5(2.828)=0.6105 → 저장 0.8031 → 204.8 ≈ 205. ×2^0.75(1.682)=0.3631 → 0.6362 → 162.2. ×2^-1.5(0.3536)=0.07633 → 0.3071 → 78.3
    for (const [exposure, expected] of [
      [1, 205],
      [0.5, 162],
      [-1, 78],
    ] as const) {
      const buffer = gray(128);
      applyAdjustments(buffer, { ...ZERO, exposure });
      expectRgbNear(pixelAt(buffer, 0), [expected, expected, expected], 2);
    }
    const unchanged = gray(128);
    applyAdjustments(unchanged, ZERO);
    expect(pixelAt(unchanged, 0)).toEqual([128, 128, 128, 255]);
  });

  it('TC-EDIT-025 회색 128에서 따뜻함 +1은 R≈142, G=128, B≈112이고 -1이면 R≈112, B≈142다', () => {
    // 선형 R × (1 + 0.25w), B × (1 − 0.25w), G 불변 → 저장 값: 142, 128, 112
    const warm = gray(128);
    applyAdjustments(warm, { ...ZERO, warmth: 1 });
    expectRgbNear(pixelAt(warm, 0), [142, 128, 112], 2);
    const cold = gray(128);
    applyAdjustments(cold, { ...ZERO, warmth: -1 });
    expectRgbNear(pixelAt(cold, 0), [112, 128, 142], 2);
  });

  it('TC-EDIT-026 색 픽셀 (200,50,50)에서 채도 -1은 R=G=B≈107, +1은 (255,0,0)으로 clamp, 0은 변화 없다', () => {
    // 선형 L = 0.2125R + 0.7154G + 0.0721B (선형 값 기준) → 채널을 L로 모으면 저장 값 ≈ 107
    const desat = solid(1, 1, [200, 50, 50, 255]);
    applyAdjustments(desat, { ...ZERO, saturation: -1 });
    expectRgbNear(pixelAt(desat, 0), [107, 107, 107], 2);
    const sat = solid(1, 1, [200, 50, 50, 255]);
    applyAdjustments(sat, { ...ZERO, saturation: 1 });
    expectRgbNear(pixelAt(sat, 0), [255, 0, 0], 2);
    const same = solid(1, 1, [200, 50, 50, 255]);
    applyAdjustments(same, ZERO);
    expect(pixelAt(same, 0)).toEqual([200, 50, 50, 255]);
  });

  it('TC-EDIT-027 대비 +1: 톤 t=0.25 → 0.1545, 0.5 → 0.5, 0.75 → 0.8455 (t − 0.6·sin(2πt)/(2π))', () => {
    expect(toneCurveAt({ ...TONE0, contrast: 1 }, 0.25)).toBeCloseTo(0.1545, 2);
    expect(toneCurveAt({ ...TONE0, contrast: 1 }, 0.5)).toBeCloseTo(0.5, 2);
    expect(toneCurveAt({ ...TONE0, contrast: 1 }, 0.75)).toBeCloseTo(0.8455, 2);
  });

  it('TC-EDIT-027 그림자 +1에서 t=1/3 → 0.4815, 하이라이트 +1에서 t=2/3 → 0.8148이다', () => {
    // 그림자: t + 0.25·4·t·(1−t)² = 1/3 + 1/3·(4/9) = 0.4815. 하이라이트: t + 0.25·4·t²·(1−t) = 2/3 + (4/9)(1/3)·... = 0.8148
    expect(toneCurveAt({ ...TONE0, shadows: 1 }, 1 / 3)).toBeCloseTo(0.4815, 2);
    expect(toneCurveAt({ ...TONE0, highlights: 1 }, 2 / 3)).toBeCloseTo(0.8148, 2);
  });

  it('TC-EDIT-027 블랙 포인트 -1에서 검정은 0.3까지 뜨고, +1에서는 밝기 0.3 아래가 0이며 0.5는 (0.5−0.3)/0.7 = 0.2857이다', () => {
    expect(toneCurveAt({ ...TONE0, blackPoint: -1 }, 0)).toBeCloseTo(0.3, 2);
    expect(toneCurveAt({ ...TONE0, blackPoint: 1 }, 0.3)).toBeCloseTo(0, 2);
    expect(toneCurveAt({ ...TONE0, blackPoint: 1 }, 0.2)).toBeCloseTo(0, 2);
    expect(toneCurveAt({ ...TONE0, blackPoint: 1 }, 0.5)).toBeCloseTo(0.2857, 2);
  });

  it('TC-EDIT-027 톤 항목이 모두 0이면 곡선은 항등이다', () => {
    for (let i = 0; i <= 10; i += 1) expect(toneCurveAt(TONE0, i / 10)).toBeCloseTo(i / 10, 12);
  });

  it('TC-EDIT-027 톤 곡선이 픽셀에 적용된다: 회색 64에 대비 +1이면 40, 회색 85에 그림자 +1이면 123, 회색 170에 하이라이트 +1이면 208 (±2)', () => {
    // 참조 계산: 입력 저장 값 x = v/255 → 곡선 → ×255 (선형 단계는 값이 0이라 거치지 않는 것과 같다)
    const cases: [Partial<typeof ZERO>, number, number][] = [
      [{ contrast: 1 }, 64, 40],
      [{ shadows: 1 }, 85, 123],
      [{ highlights: 1 }, 170, 208],
      [{ blackPoint: -1 }, 0, 77],
      [{ blackPoint: 1 }, 70, 0],
      [{ blackPoint: 1 }, 200, 176],
    ];
    for (const [patch, input, expected] of cases) {
      const buffer = gray(input);
      applyAdjustments(buffer, { ...ZERO, ...patch });
      expectRgbNear(pixelAt(buffer, 0), [expected, expected, expected], 2);
    }
  });

  it('TC-EDIT-028 그림자·하이라이트·대비·블랙 포인트의 (-1,0,1)^4 조합 81가지에서 톤 곡선은 256칸이고 끝이 1이며 줄어들지 않는다', () => {
    const levels = [-1, 0, 1] as const;
    let combos = 0;
    for (const blackPoint of levels)
      for (const shadows of levels)
        for (const highlights of levels)
          for (const contrast of levels) {
            combos += 1;
            const curve = buildToneCurve({ blackPoint, shadows, highlights, contrast });
            const label = JSON.stringify({ blackPoint, shadows, highlights, contrast });
            expect(curve.length, label).toBe(256);
            // 명세 보정: 블랙 포인트 -1은 출력 최소값을 0.3 × (−v)로 띄우므로(TC-EDIT-027) 시작값은 0이 아니라 outputBlack이다.
            expect(curve[0]!, label).toBeCloseTo(Math.max(-blackPoint, 0) * 0.3, 9);
            expect(curve[255]!, label).toBeCloseTo(1, 9);
            for (let i = 1; i < 256; i += 1) expect(curve[i]!, `${label} @${i}`).toBeGreaterThanOrEqual(curve[i - 1]!);
          }
    expect(combos).toBe(81);
  });

  it('TC-EDIT-029 모든 조정이 0이면 0~255 모든 회색과 색 픽셀이 변하지 않는다', () => {
    const ramp = grayRamp();
    const before = Uint8ClampedArray.from(ramp);
    applyAdjustments(ramp, ZERO);
    expect([...ramp]).toEqual([...before]);
    const colors = pixelsOf([
      [200, 50, 50, 255],
      [10, 240, 120, 255],
      [90, 140, 200, 77],
    ]);
    const colorsBefore = Uint8ClampedArray.from(colors);
    applyAdjustments(colors, ZERO);
    expect([...colors]).toEqual([...colorsBefore]);
    expect(isZeroAdjustments(ZERO)).toBe(true);
    expect(isZeroAdjustments({ ...ZERO, warmth: 0.01 })).toBe(false);
  });

  it('TC-EDIT-029 처리 순서는 선형(노출·따뜻함·채도) → 감마 → 톤 곡선(블랙 포인트 → 그림자·하이라이트 → 대비)이다', () => {
    // (90,140,200)에 노출 .3, 따뜻함 .2, 채도 .1, 그림자 .2, 대비 .4를 한 번에 적용한 참조 결과 (103, 174, 236) ±2.
    //
    const buffer = solid(1, 1, [90, 140, 200, 255]);
    applyAdjustments(buffer, { ...ZERO, exposure: 0.3, warmth: 0.2, saturation: 0.1, shadows: 0.2, contrast: 0.4 });
    expectRgbNear(pixelAt(buffer, 0), [103, 174, 236], 2);
  });

  it('TC-EDIT-029 조정 단계는 알파를 바꾸지 않는다', () => {
    const buffer = solid(2, 2, [90, 140, 200, 77]);
    applyAdjustments(buffer, { ...ZERO, exposure: 0.5, saturation: 0.5, contrast: 1 });
    for (let i = 0; i < 4; i += 1) expect(pixelAt(buffer, i)[3]).toBe(77);
  });
});

describe('조정 값 결정 (REQ-EDIT-022~024)', () => {
  const auto = { ...NO_AUTO_VALUES, exposure: 0.4, contrast: 0.2 };

  it('TC-EDIT-030 사용자가 만졌으면 사용자 값, 아니면 자동값 × 강도다: 자동 노출 0.4·대비 0.2, 강도 1, 사용자 노출 0.3 → (0.3, 0.2)', () => {
    const l = layers({ autoValues: auto, autoStrength: 1, manual: { exposure: 0.3 } });
    expect(effectiveValue(l, 'exposure')).toBeCloseTo(0.3, 12);
    expect(effectiveValue(l, 'contrast')).toBeCloseTo(0.2, 12);
    expect(effectiveValues(l)).toMatchObject({ exposure: 0.3, contrast: 0.2, shadows: 0 });
  });

  it('TC-EDIT-030 강도 0.5 → (0.3, 0.1), 자동 끔(강도 0) → (0.3, 0)', () => {
    const half = layers({ autoValues: auto, autoStrength: 0.5, manual: { exposure: 0.3 } });
    expect(effectiveValue(half, 'exposure')).toBeCloseTo(0.3, 12);
    expect(effectiveValue(half, 'contrast')).toBeCloseTo(0.1, 12);
    const off = layers({ autoValues: auto, autoStrength: 0, manual: { exposure: 0.3 } });
    expect(effectiveValue(off, 'exposure')).toBeCloseTo(0.3, 12);
    expect(effectiveValue(off, 'contrast')).toBe(0);
  });

  it('TC-EDIT-030 직접 값 0도 "만진 값"이라 자동값을 덮는다', () => {
    const l = layers({ autoValues: auto, autoStrength: 1, manual: { exposure: 0 } });
    expect(effectiveValue(l, 'exposure')).toBe(0);
  });

  it('TC-EDIT-031 자동 보정 몫 위치로 되돌리면 직접 만진 표시가 지워져 다시 자동 보정을 따른다', () => {
    const touched = withManualValue(layers({ autoValues: auto, autoStrength: 1 }), 'exposure', 0.1);
    expect(touched.manual.exposure).toBeCloseTo(0.1, 12);
    const back = withManualValue(touched, 'exposure', 0.4);
    expect('exposure' in back.manual).toBe(false);
    // 다시 따르는지: 강도를 바꾸면 값이 따라간다
    expect(effectiveValue(withAutoStrength(back, 0.5), 'exposure')).toBeCloseTo(0.2, 12);
  });

  it('TC-EDIT-031 자동 보정이 꺼져 있으면 몫이 0이라 0으로 되돌리면 표시가 지워진다', () => {
    const touched = withManualValue(layers({ autoValues: auto, autoStrength: 0 }), 'exposure', 0.3);
    expect(touched.manual.exposure).toBeCloseTo(0.3, 12);
    expect('exposure' in withManualValue(touched, 'exposure', 0).manual).toBe(false);
  });

  it('TC-EDIT-031 자동 보정을 켜기 전에 만진 항목은 켜도 사용자 값이 유지된다', () => {
    const touched = withManualValue(layers({ autoValues: auto, autoStrength: 0 }), 'exposure', 0.3);
    const on = withAutoStrength(touched, 1);
    expect(effectiveValue(on, 'exposure')).toBeCloseTo(0.3, 12);
    expect(effectiveValue(on, 'contrast')).toBeCloseTo(0.2, 12);
  });

  it('REQ-EDIT-019 직접 값은 -1~1로 자르고 소수 둘째 자리로 맞춘다', () => {
    const l = layers();
    expect(withManualValue(l, 'saturation', 5).manual.saturation).toBe(1);
    expect(withManualValue(l, 'saturation', -5).manual.saturation).toBe(-1);
    expect(withManualValue(l, 'saturation', 0.456).manual.saturation).toBeCloseTo(0.46, 12);
  });

  it('REQ-EDIT-020 자동 강도는 0~1로 자른다', () => {
    expect(withAutoStrength(layers(), 3).autoStrength).toBe(1);
    expect(withAutoStrength(layers(), -2).autoStrength).toBe(0);
    expect(withAutoStrength(layers(), 0.5).autoStrength).toBe(0.5);
  });

  it('TC-EDIT-032 새 분석값을 넣어도 강도와 직접 값은 그대로다', () => {
    const l = layers({ autoStrength: 1, manual: { exposure: 0.3 } });
    const next = withAutoValues(l, auto);
    expect(next.autoValues).toEqual(auto);
    expect(next.autoStrength).toBe(1);
    expect(next.manual).toEqual({ exposure: 0.3 });
  });

  it('TC-EDIT-012 조정 초기화는 강도 0, 직접 값 모두 삭제, 분석해 둔 자동 보정값은 유지한다(REQ-EDIT-024)', () => {
    const l = layers({ autoValues: auto, autoStrength: 1, manual: { exposure: 0.3, warmth: -0.2 } });
    const cleared = clearedLayers(l);
    expect(cleared.autoStrength).toBe(0);
    expect(cleared.manual).toEqual({});
    expect(cleared.autoValues).toEqual(auto);
    expect(effectiveValues(cleared)).toEqual(ZERO);
  });

  it('입력 레이어를 바꾸지 않는다(불변)', () => {
    const l = layers({ autoValues: auto, autoStrength: 1, manual: { exposure: 0.3 } });
    const snapshot = JSON.stringify(l);
    withManualValue(l, 'contrast', 0.5);
    withAutoStrength(l, 0);
    clearedLayers(l);
    withAutoValues(l, NO_AUTO_VALUES);
    expect(JSON.stringify(l)).toBe(snapshot);
  });

  it('effectiveValues는 일곱 항목 모두를 돌려준다', () => {
    const keys: AdjustmentKey[] = ['exposure', 'contrast', 'highlights', 'shadows', 'blackPoint', 'saturation', 'warmth'];
    expect(Object.keys(effectiveValues(layers())).sort()).toEqual([...keys].sort());
  });
});
