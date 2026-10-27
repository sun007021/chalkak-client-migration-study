import type { FakeClock } from '../FakeClock';

/**
 * FakeClock과 Jest 가짜 타이머를 같은 만큼 전진시킨다.
 * `jest.useFakeTimers()`가 켜져 있어야 하며, setTimeout 기반 코드와 Clock 기반 코드가 같은 시각을 본다.
 */
export function advanceTime(clock: FakeClock, ms: number): void {
  clock.advance(ms);
  jest.advanceTimersByTime(ms);
}
