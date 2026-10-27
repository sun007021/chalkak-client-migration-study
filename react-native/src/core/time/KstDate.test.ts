import { KstDate } from './KstDate';

describe('KstDate', () => {
  it('toString은 0 패딩된 yyyy-MM-dd', () => {
    expect(KstDate.of(2026, 1, 5).toString()).toBe('2026-01-05');
    expect(KstDate.of(2026, 12, 31).toString()).toBe('2026-12-31');
  });

  it.each([
    [2026, 13, 1],
    [2026, 0, 1],
    [2026, 4, 31],
    [2027, 2, 29],
    [2026, 1, 0],
  ])('존재하지 않는 날짜 of(%i, %i, %i)는 RangeError', (y, m, d) => {
    expect(() => KstDate.of(y, m, d)).toThrow(RangeError);
  });

  it('윤년 2028-02-29는 만들 수 있다', () => {
    expect(KstDate.of(2028, 2, 29).toString()).toBe('2028-02-29');
  });

  it.each(['2026-10-27', '2026-01-05', '2028-02-29'])(
    'parse(%s)는 같은 문자열로 되돌아온다',
    (text) => {
      expect(KstDate.parse(text)?.toString()).toBe(text);
    },
  );

  it.each([
    '',
    ' 2026-10-27',
    '2026-10-27 ',
    '2026-1-5',
    '2026/10/27',
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '٢٠٢٦-١٠-٢٧',
    '2026-10-27T00:00:00Z',
  ])('parse(%j)는 null', (text) => {
    expect(KstDate.parse(text)).toBeNull();
  });

  it.each([
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2027-02-28', 1, '2027-03-01'],
    ['2026-10-27', 0, '2026-10-27'],
    ['2026-10-27', 7, '2026-11-03'],
    ['2026-10-27', -40, '2026-09-17'],
  ])('%s.plusDays(%i) = %s', (from, days, expected) => {
    expect(KstDate.parse(from)?.plusDays(days).toString()).toBe(expected);
  });

  it('compare/equals', () => {
    const a = KstDate.of(2026, 10, 27);
    expect(a.compare(KstDate.of(2026, 10, 28))).toBeLessThan(0);
    expect(a.compare(KstDate.of(2026, 10, 26))).toBeGreaterThan(0);
    expect(a.compare(KstDate.of(2026, 10, 27))).toBe(0);
    expect(a.compare(KstDate.of(2025, 12, 31))).toBeGreaterThan(0);
    expect(a.equals(KstDate.of(2026, 10, 27))).toBe(true);
    expect(a.equals(KstDate.of(2026, 10, 28))).toBe(false);
  });

  it('dayOfWeek는 0=일요일', () => {
    expect(KstDate.of(2026, 10, 25).dayOfWeek()).toBe(0);
    expect(KstDate.of(2026, 10, 27).dayOfWeek()).toBe(2);
    expect(KstDate.of(2026, 10, 31).dayOfWeek()).toBe(6);
  });
});
