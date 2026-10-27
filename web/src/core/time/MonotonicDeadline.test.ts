import { MonotonicDeadline } from './MonotonicDeadline';
import { FakeClock } from '../../test/FakeClock';
import { UPLOAD_URL_SAFETY_MARGIN_MS } from '../../constants';

describe('MonotonicDeadline', () => {
  const TTL = 300_000;

  it('TC-TIME-027 만료 5초 전 직전은 유효, 정각부터는 만료로 본다', async () => {
    const clock = new FakeClock();
    const deadline = new MonotonicDeadline(clock, TTL);
    expect(deadline.isExpired()).toBe(false);
    await clock.advance(TTL - UPLOAD_URL_SAFETY_MARGIN_MS - 1);
    expect(deadline.isExpired()).toBe(false);
    await clock.advance(1);
    expect(deadline.isExpired()).toBe(true);
  });

  it('TC-TIME-027 기기 시계를 앞으로 조정해도 만료로 바뀌지 않는다', () => {
    const clock = new FakeClock();
    const deadline = new MonotonicDeadline(clock, TTL);
    clock.setWallClock(clock.nowMs() + 24 * 3_600_000);
    expect(deadline.isExpired()).toBe(false);
  });

  it('TC-TIME-027 기기 시계를 뒤로 조정해도 만료가 취소되지 않는다', async () => {
    const clock = new FakeClock();
    const deadline = new MonotonicDeadline(clock, TTL);
    await clock.advance(TTL);
    clock.setWallClock(clock.nowMs() - 24 * 3_600_000);
    expect(deadline.isExpired()).toBe(true);
  });

  it('안전 마진은 인자로 바꿀 수 있다(0이면 정각 경계)', async () => {
    const clock = new FakeClock();
    const deadline = new MonotonicDeadline(clock, 1_000);
    await clock.advance(999);
    expect(deadline.isExpired(0)).toBe(false);
    await clock.advance(1);
    expect(deadline.isExpired(0)).toBe(true);
  });
});
