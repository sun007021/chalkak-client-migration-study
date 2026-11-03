import { linearToSrgb, round2, srgbToLinear } from './colorMath';

describe('sRGB 변환·반올림 (부록 sRGB 변환과 처리 순서)', () => {
  it('TC-EDIT-029 저장 → 선형: x ≤ 0.04045 이면 x/12.92, 아니면 ((x+0.055)/1.055)^2.4', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
    // 경계: 0.04045 / 12.92 = 0.0031308... (두 식이 이어진다)
    expect(srgbToLinear(0.04045)).toBeCloseTo(0.04045 / 12.92, 12);
    // 회색 128/255 = 0.50196 → ((0.50196 + 0.055) / 1.055)^2.4 = 0.21586 (참조 계산)
    expect(srgbToLinear(128 / 255)).toBeCloseTo(0.21586, 4);
    expect(srgbToLinear(0.02)).toBeCloseTo(0.02 / 12.92, 12);
  });

  it('TC-EDIT-029 선형 → 저장: x ≤ 0.0031308 이면 12.92x, 아니면 1.055·x^(1/2.4) − 0.055', () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 12);
    expect(linearToSrgb(0.002)).toBeCloseTo(12.92 * 0.002, 12);
    expect(linearToSrgb(0.21586)).toBeCloseTo(128 / 255, 4);
  });

  it('TC-EDIT-029 두 변환은 서로 역이다(0~1 전체)', () => {
    for (let i = 0; i <= 255; i += 1) {
      const x = i / 255;
      expect(linearToSrgb(srgbToLinear(x))).toBeCloseTo(x, 10);
    }
  });

  it('REQ-EDIT-026 round2는 소수 둘째 자리 반올림이고 0.5는 0에서 먼 쪽이다(음수 대칭)', () => {
    // 0.125 · 100 = 12.5 (이진수로 정확) → 13
    expect(round2(0.125)).toBeCloseTo(0.13, 12);
    expect(round2(-0.125)).toBeCloseTo(-0.13, 12);
    expect(round2(0.124)).toBeCloseTo(0.12, 12);
    expect(round2(0.004)).toBe(0);
    expect(round2(0)).toBe(0);
    expect(round2(0.4)).toBeCloseTo(0.4, 12);
    expect(round2(-0.4)).toBeCloseTo(-0.4, 12);
  });
});
