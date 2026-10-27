import { FakeClock } from './FakeClock';

describe('FakeClock (테스트 도구 자체 검증)', () => {
  it('advance는 sleep을 도래 순서대로 이행하고 실제로 기다리지 않는다', async () => {
    const clock = new FakeClock(0);
    const order: number[] = [];
    clock.sleep(300).then(() => order.push(300));
    clock.sleep(100).then(() => order.push(100));
    await clock.advance(99);
    expect(order).toEqual([]);
    await clock.advance(1);
    expect(order).toEqual([100]);
    await clock.advance(200);
    expect(order).toEqual([100, 300]);
    expect(clock.monotonicMs()).toBe(300);
    expect(clock.nowMs()).toBe(300);
  });

  it('abort된 sleep은 AbortError로 거절하고 타이머를 남기지 않는다', async () => {
    const clock = new FakeClock(0);
    const ctrl = new AbortController();
    const p = clock.sleep(1_000, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(clock.pendingTimers).toBe(0);
  });

  it('setWallClock은 단조 시계를 바꾸지 않는다', () => {
    const clock = new FakeClock(1_000);
    clock.setWallClock(9_999_999);
    expect(clock.nowMs()).toBe(9_999_999);
    expect(clock.monotonicMs()).toBe(0);
  });
});
