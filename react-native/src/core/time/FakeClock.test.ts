import { FakeClock } from './FakeClock';

describe('FakeClock', () => {
  it('초기 시각을 돌려주고 반환값을 바꿔도 내부 시각은 변하지 않는다', () => {
    const clock = new FakeClock('2026-10-27T00:00:00Z');
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-10-27T00:00:00.000Z');
  });

  it('set은 시각을 바꾸고 advance는 밀리초만큼 전진한다', () => {
    const clock = new FakeClock(new Date('2026-10-27T00:00:00Z'));
    clock.advance(1_500);
    expect(clock.now().toISOString()).toBe('2026-10-27T00:00:01.500Z');
    clock.set('2026-12-31T23:59:59Z');
    expect(clock.now().toISOString()).toBe('2026-12-31T23:59:59.000Z');
  });

  it('잘못된 시각 문자열은 RangeError', () => {
    expect(() => new FakeClock('nope')).toThrow(RangeError);
  });
});
