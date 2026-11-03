import { NavigationPushTapBlocker } from './NavigationPushTapBlocker';

function setup(route: string | null, ready = true) {
  const listeners = new Set<() => void>();
  const blocker = new NavigationPushTapBlocker({
    isReady: () => ready,
    getCurrentRoute: () => (route === null ? undefined : { name: route }),
    addListener: (_: string, l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  } as never);
  return { blocker, listeners };
}

describe('NavigationPushTapBlocker', () => {
  it.each(['Upload'])('TC-PUSH-061 %s 화면이 열려 있으면 막는다', (name) => {
    expect(setup(name).blocker.isBlocked()).toBe(true);
  });

  it.each(['Tabs', 'PostDetail', 'Notifications'])('%s 화면에서는 막지 않는다', (name) => {
    expect(setup(name).blocker.isBlocked()).toBe(false);
  });

  it('내비게이션이 준비되기 전에는 막고, 준비되면 구독자에게 알린다(콜드 스타트 탭 유실 방지)', () => {
    const { blocker } = setup('Tabs', false);
    const calls: string[] = [];
    blocker.subscribe(() => calls.push('changed'));
    expect(blocker.isBlocked()).toBe(true);
    blocker.notifyReady();
    expect(calls).toEqual(['changed']);
  });

  it('화면 상태가 바뀌면 구독자에게 알리고 해제할 수 있다', () => {
    const { blocker, listeners } = setup('Tabs');
    const stop = blocker.subscribe(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
    let notified = 0;
    const stop2 = blocker.subscribe(() => (notified += 1));
    stop2();
    blocker.notifyReady();
    expect(notified).toBe(0);
  });
});
