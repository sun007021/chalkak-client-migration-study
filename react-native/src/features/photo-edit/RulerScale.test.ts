import {
  RULER_DP_PER_UNIT,
  RULER_MAJOR_TICK_EVERY,
  RULER_TICKS_PER_UNIT,
  applyDetent,
  isMajorTick,
  offsetDpToValue,
  tickValue,
  valueToOffsetDp,
} from './RulerScale';

describe('조정 눈금자', () => {
  it('TC-EDIT-038 단위당 400dp, 50틱, 10마다 굵은 눈금이다', () => {
    expect(RULER_DP_PER_UNIT).toBe(400);
    expect(RULER_TICKS_PER_UNIT).toBe(50);
    expect(RULER_MAJOR_TICK_EVERY).toBe(10);
  });

  it('TC-EDIT-038 값 <-> 위치 변환', () => {
    expect(valueToOffsetDp(0)).toBe(0);
    expect(valueToOffsetDp(0.5)).toBe(200);
    expect(valueToOffsetDp(-1)).toBe(-400);
    expect(offsetDpToValue(200)).toBe(0.5);
    expect(offsetDpToValue(-400)).toBe(-1);
  });

  it('TC-EDIT-038 눈금 -50..50 모두 값 -> 위치 -> 값 왕복 오차가 없다', () => {
    for (let i = -50; i <= 50; i += 1) {
      const value = tickValue(i);
      expect(value).toBeCloseTo(i / 50, 12);
      expect(Math.abs(offsetDpToValue(valueToOffsetDp(value)) - value)).toBeLessThan(1e-12);
    }
    expect(tickValue(10)).toBeCloseTo(0.2);
    expect(tickValue(50)).toBe(1);
    expect(tickValue(-50)).toBe(-1);
  });

  it('TC-EDIT-038 위치는 -1~1 범위로 자른다 [가정: 범위 밖 끌기는 끝에서 멈춘다]', () => {
    expect(offsetDpToValue(900)).toBe(1);
    expect(offsetDpToValue(-900)).toBe(-1);
  });

  it('TC-EDIT-038 10번째마다 굵은 눈금이다(0과 음수 방향 포함)', () => {
    expect(isMajorTick(0)).toBe(true);
    expect(isMajorTick(10)).toBe(true);
    expect(isMajorTick(-20)).toBe(true);
    expect(isMajorTick(5)).toBe(false);
    expect(isMajorTick(-13)).toBe(false);
  });

  it('TC-EDIT-038 0과 자동 보정 몫 위치 근처에서 멈칫한다(범위 안이면 그 값, 밖이면 그대로)', () => {
    const anchors = [0, 0.4];
    expect(applyDetent(0.012, anchors, 0.02)).toBe(0);
    expect(applyDetent(-0.015, anchors, 0.02)).toBe(0);
    expect(applyDetent(0.39, anchors, 0.02)).toBe(0.4);
    expect(applyDetent(0.2, anchors, 0.02)).toBe(0.2);
    expect(applyDetent(0.03, anchors, 0.02)).toBe(0.03);
  });

  it('TC-EDIT-038 기준값이 둘 다 범위 안이면 더 가까운 쪽으로 멈춘다', () => {
    expect(applyDetent(0.011, [0, 0.02], 0.02)).toBe(0.02);
    expect(applyDetent(0.009, [0, 0.02], 0.02)).toBe(0);
  });
});
