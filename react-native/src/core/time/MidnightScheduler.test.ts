import { VirtualTimeSleeper } from '../../features/ai-review/__testing__/VirtualTimeSleeper';
import { FakeClock } from './FakeClock';
import { MidnightScheduler, msUntilNextKstMidnight } from './MidnightScheduler';

const HOUR = 60 * 60 * 1000;

function setup(now: string) {
  const clock = new FakeClock(now);
  const sleeper = new VirtualTimeSleeper(clock);
  const scheduler = new MidnightScheduler({ clock, sleeper });
  const fired: string[] = [];
  const watch = () => scheduler.watch(() => fired.push(clock.now().toISOString()));
  return { clock, sleeper, watch, fired };
}

describe('msUntilNextKstMidnight', () => {
  it('TC-TIME-014 KST 23:59:59면 1초, 정각 자정이면 하루(다음 자정)다', () => {
    expect(msUntilNextKstMidnight(new FakeClock('2026-10-27T14:59:59Z'))).toBe(1000);
    expect(msUntilNextKstMidnight(new FakeClock('2026-10-27T15:00:00Z'))).toBe(24 * HOUR);
  });

  it('기기 시간대와 무관하게 UTC 15:00이 KST 자정이다(UTC 자정은 KST 09:00)', () => {
    expect(msUntilNextKstMidnight(new FakeClock('2026-10-27T00:00:00Z'))).toBe(15 * HOUR);
  });
});

describe('MidnightScheduler', () => {
  it('TC-TIME-014 KST 자정을 넘길 때마다 한 번씩 알린다', async () => {
    const { sleeper, watch, fired } = setup('2026-10-27T14:59:59Z');
    watch();
    await sleeper.advance(999);
    expect(fired).toEqual([]);
    await sleeper.advance(1);
    expect(fired).toEqual(['2026-10-27T15:00:00.000Z']);
    await sleeper.advance(24 * HOUR);
    expect(fired).toEqual(['2026-10-27T15:00:00.000Z', '2026-10-28T15:00:00.000Z']);
  });

  it('취소하면 더 알리지 않고 대기도 남지 않는다', async () => {
    const { sleeper, watch, fired } = setup('2026-10-27T14:59:59Z');
    const stop = watch();
    stop();
    await sleeper.advance(2000);
    expect(fired).toEqual([]);
    expect(sleeper.waiting).toBe(0);
  });

  it('날짜가 안 바뀐 채 깨어나는 일(즉시 resolve)이 반복돼도 무한히 돌지 않는다', async () => {
    const clock = new FakeClock('2026-10-27T03:00:00Z');
    let sleeps = 0;
    const scheduler = new MidnightScheduler({
      clock,
      sleeper: { sleep: () => (sleeps++, Promise.resolve()) },
    });
    const fired: number[] = [];
    scheduler.watch(() => fired.push(1));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(fired).toEqual([]);
    expect(sleeps).toBeLessThanOrEqual(5);
  });
});
