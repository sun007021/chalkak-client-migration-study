import { d } from '../../core/time/__testing__/helpers';
import {
  availableDays,
  availableMonths,
  availableYears,
  clampToRange,
  collapseProgress,
  resolvePickedDate,
} from './displayDateRange';

const RANGE = { min: d('2026-09-17'), max: d('2026-10-27') };
const LONG = { min: d('2026-09-17'), max: d('2028-03-05') };

describe('날짜 피커 범위', () => {
  it('TC-DISP-036 첫 해는 9월부터, 마지막 해는 오늘의 월까지만 고를 수 있다', () => {
    expect(availableYears(LONG)).toEqual([2026, 2027, 2028]);
    expect(availableMonths(LONG, 2026)).toEqual([9, 10, 11, 12]);
    expect(availableMonths(LONG, 2027)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(availableMonths(LONG, 2028)).toEqual([1, 2, 3]);
    expect(availableMonths(RANGE, 2026)).toEqual([9, 10]);
  });

  it('TC-DISP-036 첫 달은 17일부터, 마지막 달은 오늘까지, 사이 달은 말일까지 고를 수 있다', () => {
    expect(availableDays(RANGE, 2026, 9)).toEqual(Array.from({ length: 14 }, (_, i) => 17 + i));
    expect(availableDays(RANGE, 2026, 10)).toEqual(Array.from({ length: 27 }, (_, i) => 1 + i));
    expect(availableDays(LONG, 2026, 11)).toHaveLength(30);
    expect(availableDays(LONG, 2027, 2)).toHaveLength(28);
    expect(availableDays(LONG, 2028, 2)).toHaveLength(29);
    expect(availableDays(LONG, 2028, 3)).toEqual([1, 2, 3, 4, 5]);
  });

  it('TC-DISP-034 범위 밖 날짜(2026-09-01, 내일)는 [2026-09-17, 오늘]의 끝으로 맞춘다', () => {
    expect(clampToRange(d('2026-09-01'), RANGE).toString()).toBe('2026-09-17');
    expect(clampToRange(d('2026-10-28'), RANGE).toString()).toBe('2026-10-27');
    expect(clampToRange(d('2026-10-01'), RANGE).toString()).toBe('2026-10-01');
  });

  it('TC-DISP-034 휠에서 고른 값이 범위 밖이어도 끝으로 맞춘다', () => {
    expect(resolvePickedDate(RANGE, 2026, 9, 1).toString()).toBe('2026-09-17');
    expect(resolvePickedDate(RANGE, 2026, 10, 28).toString()).toBe('2026-10-27');
  });

  it('TC-DISP-037 31일에서 30일뿐인 달로 바꾸면 말일로, 2027-02-29는 28일로, 윤년 2028-02-29는 그대로 맞춘다(가짜 시계 2028-03-05)', () => {
    expect(resolvePickedDate(LONG, 2026, 11, 31).toString()).toBe('2026-11-30');
    expect(resolvePickedDate(LONG, 2027, 2, 29).toString()).toBe('2027-02-28');
    expect(resolvePickedDate(LONG, 2028, 2, 29).toString()).toBe('2028-02-29');
  });
});

describe('collapseProgress', () => {
  it('TC-DISP-058 접힘 진행도는 0~1로 clamp되고 위로 스크롤하면 줄어든다', () => {
    expect(collapseProgress(-20, 100)).toBe(0);
    expect(collapseProgress(50, 100)).toBe(0.5);
    expect(collapseProgress(400, 100)).toBe(1);
    expect(collapseProgress(20, 100)).toBeLessThan(collapseProgress(80, 100));
  });
});
