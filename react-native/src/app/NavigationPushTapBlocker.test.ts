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
  it.each(['Upload', 'Feedback'])('TC-PUSH-061 %s 화면이 열려 있으면 막는다', (name) => {
    expect(setup(name).blocker.isBlocked()).toBe(true);
  });

  it.each(['Tabs', 'PostDetail', 'Notifications'])('%s 화면에서는 막지 않는다', (name) => {
    expect(setup(name).blocker.isBlocked()).toBe(false);
  });

  it('내비게이션이 준비되기 전에는 막지 않는다', () => {
    expect(setup('Upload', false).blocker.isBlocked()).toBe(false);
  });

  it('화면 상태가 바뀌면 구독자에게 알리고 해제할 수 있다', () => {
    const { blocker, listeners } = setup('Tabs');
    const stop = blocker.subscribe(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});
