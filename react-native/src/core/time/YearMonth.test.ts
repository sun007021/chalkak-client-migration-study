import { KstDate } from './KstDate';
import { YearMonth } from './YearMonth';

describe('YearMonth', () => {
  it.each([
    [0, 1],
    [10000, 1],
    [2026, 0],
    [2026, 13],
    [2026.5, 1],
    [2026, 1.5],
    [NaN, 1],
  ])('of(%p, %p)는 RangeError', (year, month) => {
    expect(() => YearMonth.of(year, month)).toThrow(RangeError);
  });

  it('toString/toJSON은 yyyy-MM', () => {
    expect(YearMonth.of(2026, 1).toString()).toBe('2026-01');
    expect(YearMonth.of(2027, 12).toJSON()).toBe('2027-12');
  });

  it('from(KstDate)와 비교', () => {
    const ym = YearMonth.from(KstDate.of(2026, 10, 27));
    expect(ym.equals(YearMonth.of(2026, 10))).toBe(true);
    expect(ym.compare(YearMonth.of(2026, 11))).toBeLessThan(0);
    expect(ym.compare(YearMonth.of(2025, 12))).toBeGreaterThan(0);
  });

  it.each([
    [2026, 1, 31],
    [2026, 4, 30],
    [2026, 2, 28],
    [2028, 2, 29],
    [2100, 2, 28],
    [2000, 2, 29],
  ])('daysInMonth(%i-%i) = %i', (year, month, expected) => {
    expect(YearMonth.of(year, month).daysInMonth()).toBe(expected);
  });

  it('불변이다(freeze)', () => {
    expect(Object.isFrozen(YearMonth.of(2026, 10))).toBe(true);
  });
});
