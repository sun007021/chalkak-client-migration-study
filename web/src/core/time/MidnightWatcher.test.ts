import { MidnightWatcher } from './MidnightWatcher';
import { FakeClock } from './FakeClock';

const utc = (iso: string) => Date.parse(iso);

function setup(startIso: string) {
  const clock = new FakeClock(utc(startIso));
  const changes: string[] = [];
  const watcher = new MidnightWatcher({ clock, onDateChanged: (d) => changes.push(d) });
  return { clock, changes, watcher };
}

describe('MidnightWatcher', () => {
  it('TC-TIME-014 포그라운드에서 KST 23:59:59 → 00:00:00을 넘기면 새 날짜로 정확히 1번 알린다', async () => {
    const { clock, changes, watcher } = setup('2026-10-27T14:59:59Z'); // 23:59:59 KST
    watcher.start();
    await clock.advance(999);
    expect(changes).toEqual([]);
    await clock.advance(1);
    expect(changes).toEqual(['2026-10-28']);
  });

  it('TC-TIME-014 다음 날 자정에도 이어서 알린다(하루 뒤 2026-10-29)', async () => {
    const { clock, changes, watcher } = setup('2026-10-27T14:59:59Z');
    watcher.start();
    await clock.advance(1_000);
    await clock.advance(24 * 3_600_000);
    expect(changes).toEqual(['2026-10-28', '2026-10-29']);
  });

  it('TC-TIME-015 백그라운드에서 자정을 넘기고 복귀하면 checkNow가 새 날짜를 한 번만 알린다', async () => {
    const { clock, changes, watcher } = setup('2026-10-27T10:00:00Z');
    watcher.start();
    watcher.stop(); // 백그라운드: 타이머가 멈춘 상황
    clock.setWallClock(utc('2026-10-27T16:00:00Z')); // 복귀 시점은 KST 10-28 01:00
    watcher.checkNow();
    watcher.checkNow();
    expect(changes).toEqual(['2026-10-28']);
  });

  it('TC-TIME-015 날짜가 바뀌지 않았으면 checkNow는 알리지 않는다', () => {
    const { changes, watcher } = setup('2026-10-27T03:00:00Z');
    watcher.start();
    watcher.checkNow();
    expect(changes).toEqual([]);
  });

  it('stop하면 타이머를 정리하고 더 알리지 않는다', async () => {
    const { clock, changes, watcher } = setup('2026-10-27T14:59:59Z');
    watcher.start();
    watcher.stop();
    expect(clock.pendingTimers).toBe(0);
    await clock.advance(48 * 3_600_000);
    expect(changes).toEqual([]);
  });

  it('TC-TIME-016 월 경계(10/31 23:59:59 → 11/1 00:00 KST)도 새 날짜로 알린다', async () => {
    const { clock, changes, watcher } = setup('2026-10-31T14:59:59Z');
    watcher.start();
    await clock.advance(1_000);
    expect(changes).toEqual(['2026-11-01']);
  });
});
