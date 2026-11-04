import { RULER_DETENT_RANGE, RULER_MAJOR_TICK_EVERY, RULER_TICKS_PER_VALUE, RULER_UNITS_PER_VALUE, isMajorTick, offsetToValue, snapToDetent, tickIndex, valueToOffset } from './rulerScale';

describe('눈금자 스케일 (TC-EDIT-038)', () => {
  it('TC-EDIT-038 단위당 400, 눈금 50개, 10마다 굵은 눈금이다', () => {
    expect(RULER_UNITS_PER_VALUE).toBe(400);
    expect(RULER_TICKS_PER_VALUE).toBe(50);
    expect(RULER_MAJOR_TICK_EVERY).toBe(10);
  });

  it('TC-EDIT-038 값 ↔ 위치 변환은 왕복 오차가 없다(-1~1, 0.01 단위)', () => {
    expect(valueToOffset(0.5)).toBe(200);
    expect(valueToOffset(-1)).toBe(-400);
    expect(offsetToValue(100)).toBe(0.25);
    for (let d = -100; d <= 100; d += 1) {
      const value = d / 100;
      expect(offsetToValue(valueToOffset(value))).toBeCloseTo(value, 12);
    }
  });

  it('TC-EDIT-038 가장 가까운 눈금 번호는 round(value × 50)이고 10의 배수가 굵은 눈금이다', () => {
    expect(tickIndex(0.3)).toBe(15);
    expect(tickIndex(-0.02)).toBe(-1);
    expect(tickIndex(0)).toBe(0);
    expect(tickIndex(1)).toBe(50);
    expect(isMajorTick(0)).toBe(true);
    expect(isMajorTick(10)).toBe(true);
    expect(isMajorTick(-10)).toBe(true);
    expect(isMajorTick(15)).toBe(false);
    expect(isMajorTick(-3)).toBe(false);
  });

  it('TC-EDIT-038 0과 자동 보정 몫 위치 근처에서는 그 위치로 멈칫(스냅)하고 멀면 그대로다', () => {
    const anchors = [0, 0.4];
    expect(snapToDetent(0.02, anchors)).toBe(0);
    expect(snapToDetent(-0.025, anchors)).toBe(0);
    expect(snapToDetent(0.41, anchors)).toBe(0.4);
    expect(snapToDetent(0.375, anchors)).toBe(0.4);
    expect(snapToDetent(0.2, anchors)).toBe(0.2);
    expect(snapToDetent(0.2, [])).toBe(0.2);
    // 범위는 인수로도 줄 수 있다
    expect(snapToDetent(0.05, anchors, 0.1)).toBe(0);
    expect(snapToDetent(0.05, anchors)).toBe(0.05);
    expect(RULER_DETENT_RANGE).toBeGreaterThan(0);
  });

  it('TC-EDIT-038 앵커가 둘 다 범위 안이면 더 가까운 쪽으로 붙는다', () => {
    expect(snapToDetent(0.03, [0, 0.04], 0.05)).toBe(0.04);
    expect(snapToDetent(0.01, [0, 0.04], 0.05)).toBe(0);
  });
});
