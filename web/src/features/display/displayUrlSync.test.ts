import { planUrlWrite, takeWrittenSearch } from './displayUrlSync';

const today = '2026-10-27';

describe('planUrlWrite (코드리뷰 4)', () => {
  it('기본값(오늘·최신순)은 파라미터가 없는 URL과 같아 쓰지 않는다', () => {
    expect(planUrlWrite('', { date: today, sort: 'recent', today })).toBeNull();
    expect(planUrlWrite('?date=2026-10-27&sort=recent', { date: today, sort: 'recent', today })).toBeNull();
  });

  it('다르면 date·sort를 덮어쓰고 다른 파라미터는 유지한다', () => {
    expect(planUrlWrite('', { date: '2026-10-26', sort: 'popular', today })).toBe('?date=2026-10-26&sort=popular');
    expect(planUrlWrite('?foo=1&date=2026-10-25', { date: '2026-10-26', sort: 'popular', today })).toBe('?foo=1&date=2026-10-26&sort=popular');
  });

  it('날짜만 같고 정렬이 다르면 쓴다', () => {
    expect(planUrlWrite('?date=2026-10-27&sort=recent', { date: today, sort: 'random', today })).toBe('?date=2026-10-27&sort=random');
  });
});

describe('takeWrittenSearch (코드리뷰 4)', () => {
  it('쓴 적 있는 search가 돌아오면 그 항목까지 비우고 ours다', () => {
    expect(takeWrittenSearch(['?B', '?C'], '?B')).toEqual({ ours: true, pending: ['?C'] });
    expect(takeWrittenSearch(['?B', '?C'], '?C')).toEqual({ ours: true, pending: [] });
  });

  it('쓴 적 없는 search는 바깥 이동이라 목록을 비우고 반영하게 한다', () => {
    expect(takeWrittenSearch(['?B'], '?X')).toEqual({ ours: false, pending: [] });
    expect(takeWrittenSearch([], '')).toEqual({ ours: false, pending: [] });
  });
});
