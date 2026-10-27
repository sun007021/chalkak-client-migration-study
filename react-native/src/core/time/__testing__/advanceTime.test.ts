import { FakeClock } from '../FakeClock';
import { advanceTime } from './advanceTime';

describe('advanceTime', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('FakeClock과 가짜 타이머를 함께 전진시킨다', () => {
    const clock = new FakeClock('2026-10-27T00:00:00Z');
    const fired = jest.fn();
    setTimeout(fired, 3_000);

    advanceTime(clock, 2_999);
    expect(fired).not.toHaveBeenCalled();
    advanceTime(clock, 1);

    expect(fired).toHaveBeenCalledTimes(1);
    expect(clock.now().toISOString()).toBe('2026-10-27T00:00:03.000Z');
  });
});
