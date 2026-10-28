import { BootViewModel } from './BootViewModel';
import { SPLASH_PRELOAD_MAX_MS } from '../../constants';
import type { StoredSession } from '../../core/auth/SessionStore';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';
import { FakeClock, flushAsync } from '../../test/FakeClock';
import { FakeHomePreloader } from '../../test/FakeHomePreloader';
import { FakeSessionStore } from '../../test/FakeSessionStore';
import { NOW, guestSession, memberSession } from '../../test/fixtures';
import { track } from '../../test/track';
import { loadStorageFixture } from '../../test/sessionFixtures';

function setup(session: StoredSession = memberSession()) {
  const clock = new FakeClock(NOW);
  const store = new FakeSessionStore(session);
  const preloader = new FakeHomePreloader();
  const vm = new BootViewModel({ store, clock, preloader });
  return { clock, store, preloader, vm };
}

const HOME_MEMBER = { phase: 'ready', decision: { destination: 'home', mode: 'member' }, preloadFailed: false } as const;

describe('BootViewModel 스플래시', () => {
  it('TC-BOOT-001 세션이 없으면 스플래시 뒤 로그인으로 판정하고 홈 프리로드는 부르지 않는다', async () => {
    const { vm, preloader } = setup(loadStorageFixture('session__empty').session);
    await vm.start();
    expect(vm.state).toEqual({ phase: 'ready', decision: { destination: 'login' }, preloadFailed: false });
    expect(preloader.calls).toEqual([]);
  });

  it('TC-BOOT-014 로그인이 목적지면 프리로드를 기다리지 않고 시계를 전진시키지 않아도 바로 해제된다', async () => {
    const { vm, clock, preloader } = setup(EMPTY_SESSION);
    await vm.start();
    expect(vm.state.phase).toBe('ready');
    expect(clock.monotonicMs()).toBe(0);
    expect(clock.pendingTimers).toBe(0);
    expect(preloader.calls).toHaveLength(0);
  });

  it('TC-BOOT-015 세션을 읽는 동안에는 스플래시를 유지하고 판정도 프리로드도 시작하지 않는다', async () => {
    const { vm, store, preloader } = setup();
    vi.spyOn(store, 'read').mockReturnValue(new Promise(() => {}));
    void vm.start();
    await flushAsync();
    expect(vm.state).toEqual({ phase: 'splash' });
    expect(preloader.calls).toEqual([]);
  });

  it('TC-BOOT-010 프리로드가 100ms에 끝나면 그 시점에 해제되고 700ms를 기다리지 않는다', async () => {
    const { vm, clock, preloader } = setup();
    const started = track(vm.start());
    await flushAsync();
    expect(preloader.calls).toEqual(['member']);
    await clock.advance(99);
    expect(vm.state).toEqual({ phase: 'splash' });
    await clock.advance(1);
    preloader.finish();
    await flushAsync();
    expect(vm.state).toEqual(HOME_MEMBER);
    expect(started.state).toBe('fulfilled');
    expect(clock.monotonicMs()).toBe(100);
    expect(clock.pendingTimers).toBe(0); // 700ms 타이머를 정리했다
  });

  it('TC-BOOT-011 프리로드가 끝나지 않으면 699ms까지 유지하고 700ms에 해제한다(701ms에도 그대로)', async () => {
    const { vm, clock, preloader } = setup();
    expect(SPLASH_PRELOAD_MAX_MS).toBe(700);
    void vm.start();
    await flushAsync();
    await clock.advance(SPLASH_PRELOAD_MAX_MS - 1);
    expect(vm.state).toEqual({ phase: 'splash' });
    await clock.advance(1);
    expect(vm.state).toEqual(HOME_MEMBER);
    const releasedState = vm.state;
    await clock.advance(1);
    expect(vm.state).toBe(releasedState);
    // 상한 뒤에 프리로드가 끝나거나 실패해도 이미 열린 홈의 상태를 바꾸지 않는다
    preloader.fail();
    await flushAsync();
    expect(vm.state).toBe(releasedState);
  });

  it('TC-BOOT-012 프리로드가 오류로 끝나면 700ms를 기다리지 않고 즉시 해제하며 홈이 오류 상태로 열리게 알린다', async () => {
    const { vm, clock, preloader } = setup();
    void vm.start();
    await flushAsync();
    preloader.fail();
    await flushAsync();
    expect(vm.state).toEqual({ phase: 'ready', decision: { destination: 'home', mode: 'member' }, preloadFailed: true });
    expect(clock.monotonicMs()).toBe(0);
    expect(clock.pendingTimers).toBe(0);
  });

  it('TC-BOOT-013 게스트는 게스트 모드로 프리로드를 요청한다(공개 데이터 범위는 홈 PR이 구현) 상한 700ms는 같다', async () => {
    const { vm, clock, preloader } = setup(guestSession);
    void vm.start();
    await flushAsync();
    expect(preloader.calls).toEqual(['guest']);
    await clock.advance(699);
    expect(vm.state.phase).toBe('splash');
    await clock.advance(1);
    expect(vm.state).toEqual({ phase: 'ready', decision: { destination: 'home', mode: 'guest' }, preloadFailed: false });
  });

  it('TC-BOOT-004 TC-BOOT-006 만료·불완전 세션은 정리되고 로그인으로 해제된다', async () => {
    for (const name of ['session__expired-refresh', 'session__partial']) {
      const { vm, store, preloader } = setup(loadStorageFixture(name).session);
      await vm.start();
      expect(vm.state).toEqual({ phase: 'ready', decision: { destination: 'login' }, preloadFailed: false });
      expect(store.clearCount).toBe(1);
      expect(preloader.calls).toEqual([]);
    }
  });

  it('start()를 두 번 불러도(StrictMode) 세션 읽기와 프리로드는 한 번이다', async () => {
    const { vm, store, preloader } = setup();
    const read = vi.spyOn(store, 'read');
    void vm.start();
    void vm.start();
    await flushAsync();
    expect(read).toHaveBeenCalledTimes(1);
    expect(preloader.calls).toEqual(['member']);
  });

  it('dispose 뒤에 프리로드나 타이머가 끝나도 상태를 바꾸지 않고 던지지 않는다', async () => {
    const { vm, clock, preloader } = setup();
    void vm.start();
    await flushAsync();
    vm.dispose();
    preloader.finish();
    await clock.advance(1000);
    expect(vm.state).toEqual({ phase: 'splash' });
  });
});
