import { act, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { InProcessRefreshLock } from '../core/auth/RefreshLock';
import { SESSION_CHANNEL_NAME } from '../core/auth/SessionChannel';
import type { SignedOutReason } from '../core/auth/SessionEvents';
import { IndexedDbSessionStore } from '../core/auth/IndexedDbSessionStore';
import { createAppContainer } from './container';
import { renderApp } from '../test/appHarness';
import { MOCK_BASE } from '../test/apiEnv';
import { FakeAnalyticsTracker } from '../test/FakeAnalyticsTracker';
import { FakeClock } from '../test/FakeClock';
import { FakeHomePreloader } from '../test/FakeHomePreloader';
import { SessionChannelHub } from '../test/FakeSessionChannel';
import { FakeSocialLoginClient } from '../test/FakeSocialLoginClient';
import { FakeFetch } from '../test/fakeFetch';
import { NOW, OTHER_USER, ME, guestSession, loadFixture, memberSession, tokens } from '../test/fixtures';
import { RecordingLogger } from '../test/RecordingLogger';
import { SequentialIdGenerator } from '../test/sequentialIds';
import { watchAdded } from '../test/domWatch';
import { outsideHome } from '../test/homeRequests';

/** 같은 IndexedDB를 쓰는 "브라우저 탭" 하나. 탭마다 컨테이너·시계·fetch·채널 객체가 따로다. */
function makeTab(idb: IDBFactory, hub: SessionChannelHub) {
  const ff = new FakeFetch();
  const channel = hub.open();
  const container = createAppContainer({
    env: { VITE_API_BASE_URL: MOCK_BASE },
    devSessionEnabled: false,
    fetch: ff.fetch,
    clock: new FakeClock(NOW),
    lock: new InProcessRefreshLock(),
    logger: new RecordingLogger(),
    tracker: new FakeAnalyticsTracker(),
    ids: new SequentialIdGenerator(),
    socialLogin: new FakeSocialLoginClient(),
    preloader: new FakeHomePreloader().resolveImmediately(),
    indexedDB: idb,
    sessionChannel: channel,
  });
  const reasons: SignedOutReason[] = [];
  container.sessionEvents.subscribe((reason) => reasons.push(reason));
  return { container, ff, channel, reasons };
}

function setup() {
  const idb = new IDBFactory();
  const hub = new SessionChannelHub();
  return { idb, hub, tabA: makeTab(idb, hub), tabB: makeTab(idb, hub) };
}

describe('다른 탭의 로그아웃·계정 전환 전파', () => {
  it('REQ-NAV-022 탭 A에서 로그아웃하면 탭 B가 캐시를 비우고 로그인으로 replace 이동하며, 탭 A는 자기 신호를 받지 않는다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(memberSession());
    const { path, router } = renderApp(tabB.container, '/display');
    await screen.findByTestId('display.root');
    const cleared = vi.fn();
    tabB.container.userCaches.register({ clear: cleared });
    tabA.ff.route('POST /auth/logout', () => loadFixture('auth/logout__no-content.json').toResponse());

    await act(async () => tabA.container.accountService.logout());

    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(tabB.reasons).toEqual(['changed']); // 부팅 경로에서 게이트를 다시 판정한 결과가 로그인
    expect(tabA.reasons).toEqual(['logout']); // 탭 A는 자기 로그아웃 한 번뿐(전파 신호로 다시 emit하지 않는다)
    expect(tabB.ff.calls).toHaveLength(0); // 탭 B는 서버를 부르지 않는다
    expect(await tabB.container.store.read()).toMatchObject({ userId: null, tokens: null });
  });

  it('REQ-NAV-022 TC-NAV-041 로그아웃이 전파된 탭 B에서 뒤로 가도 보호 화면이 다시 열리지 않는다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(memberSession());
    const { path, router } = renderApp(tabB.container, '/home');
    await screen.findByTestId('bottom-bar.root');
    await act(async () => void (await tabA.container.store.clear()));
    await screen.findByTestId('login.root');
    const main = watchAdded('bottom-bar.root');
    await act(async () => router.navigate(-1));
    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    expect(main.seen()).toBe(false);
    main.stop();
  });

  it('TC-NAV-050 REQ-NAV-022 탭 A에서 다른 계정으로 바뀌면 탭 B는 캐시를 비우고 로그인으로 간다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(memberSession());
    const { path } = renderApp(tabB.container, '/record');
    await screen.findByTestId('record.root');
    const cleared = vi.fn();
    tabB.container.userCaches.register({ clear: cleared });

    await act(async () => tabA.container.store.write({ userId: OTHER_USER, tokens: tokens({ refreshToken: 'account-b-refresh' }), isGuest: false }));

    // 부팅 게이트가 새 계정(회원)으로 다시 판정해 홈으로 간다. 이전 계정의 기록 화면은 닫힌다.
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
    expect(screen.queryByTestId('record.root')).not.toBeInTheDocument();
    expect(cleared).toHaveBeenCalledTimes(1);
    expect(tabB.reasons).toEqual(['changed']);
  });

  it('탭 A의 재인증 실패로 세션이 지워지면(clearIf) 탭 B도 로그인으로 간다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(memberSession());
    renderApp(tabB.container, '/settings');
    await screen.findByTestId('settings.root');
    await act(async () => void (await tabA.container.store.clearIf('fixture-refresh-token-1')));
    await screen.findByTestId('login.root');
  });

  it('같은 계정의 토큰 갱신(updateIf)은 탭 B를 건드리지 않는다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(memberSession());
    const { path } = renderApp(tabB.container, '/display');
    await screen.findByTestId('display.root');
    await act(async () => void (await tabA.container.store.updateIf('fixture-refresh-token-1', memberSession({ refreshToken: 'rotated', accessToken: 'rotated-access' }))));
    expect(path()).toBe('/display');
    expect(tabB.reasons).toEqual([]);
    expect(screen.getByTestId('display.root')).toBeInTheDocument();
  });

  it('로그인 화면에 있는 탭 B는 탭 A의 새 로그인을 받아 부팅 게이트를 다시 판정하고 회원 홈으로 간다', async () => {
    const { tabA, tabB } = setup();
    const { path } = renderApp(tabB.container, '/login');
    await screen.findByTestId('login.root');
    await act(async () => tabA.container.store.write(memberSession()));
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
    expect(screen.getByTestId('home.root')).toHaveAttribute('data-mode', 'member');
    expect(outsideHome(tabB.ff)).toHaveLength(0);
  });

  it('REQ-NAV-022 게스트로 둘러보던 탭 B: 탭 A가 회원으로 로그인하면 회원 홈으로, 이어서 탭 A가 로그아웃하면 로그인으로 간다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(guestSession);
    const { path } = renderApp(tabB.container, '/display');
    await screen.findByTestId('display.root');
    const cleared = vi.fn();
    tabB.container.userCaches.register({ clear: cleared });

    await act(async () => tabA.container.store.write(memberSession()));
    await screen.findByTestId('home.root');
    expect(path()).toBe('/home');
    expect(screen.getByTestId('home.root')).toHaveAttribute('data-mode', 'member');
    expect(cleared).toHaveBeenCalledTimes(1);

    await act(async () => tabA.container.store.clear());
    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    expect(cleared).toHaveBeenCalledTimes(2);
    expect(tabB.reasons).toEqual(['changed', 'changed']);
  });

  it('이 탭에서 직접 로그인한 계정은 이 탭이 알고 있어, 다른 탭이 같은 계정으로 쓰는 신호에는 반응하지 않는다', async () => {
    const { tabA, tabB } = setup();
    const { path } = renderApp(tabB.container, '/login');
    await screen.findByTestId('login.root');
    await act(async () => tabB.container.store.write(memberSession())); // 이 탭이 로그인(이 탭의 신호는 자기에게 오지 않는다)
    await act(async () => tabA.container.store.write(memberSession({ refreshToken: 'a-refresh' })));
    expect(tabB.reasons).toEqual([]);
    expect(path()).toBe('/login');
  });

  it('REQ-NAV-022 신호를 놓쳐도(채널 없이 저장소만 바뀜) 문서가 다시 보일 때 되찾아 로그인으로 간다', async () => {
    const { idb, tabB } = setup();
    await tabB.container.store.write(memberSession());
    const { path } = renderApp(tabB.container, '/home');
    await screen.findByTestId('bottom-bar.root');
    await new Promise((resolve) => setTimeout(resolve, 0)); // start()의 첫 읽기가 끝나도록
    await new IndexedDbSessionStore({ indexedDB: idb }).clear(); // 채널이 없는 쓰기: 신호가 가지 않는다
    expect(path()).toBe('/home');
    const state = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    await screen.findByTestId('login.root');
    expect(path()).toBe('/login');
    state.mockRestore();
  });

  it('REQ-NAV-022 pageshow(persisted)에서도 되찾는다', async () => {
    const { idb, tabB } = setup();
    await tabB.container.store.write(memberSession());
    renderApp(tabB.container, '/home');
    await screen.findByTestId('bottom-bar.root');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new IndexedDbSessionStore({ indexedDB: idb }).clear();
    await act(async () => void window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })));
    await screen.findByTestId('login.root');
  });

  it('게스트로 둘러보는 탭 B는 탭 A의 로그아웃에 영향받지 않는다(게스트 플래그만 쓰기는 신호 없음)', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(guestSession);
    renderApp(tabB.container, '/display');
    await screen.findByTestId('display.root');
    await act(async () => tabA.container.store.clear());
    expect(tabB.reasons).toEqual([]);
    expect(screen.getByTestId('display.root')).toBeInTheDocument();
  });

  it('화면이 사라지면(언마운트) 탭 B는 더 이상 신호를 구독하지 않는다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(memberSession());
    const view = renderApp(tabB.container, '/home');
    await screen.findByTestId('bottom-bar.root');
    await waitFor(() => expect(tabB.channel.listenerCount).toBeGreaterThan(0));
    view.unmount();
    expect(tabB.channel.listenerCount).toBe(0);
  });

  it('StrictMode에서도 구독은 하나뿐이라 emit이 한 번이다', async () => {
    const { tabA, tabB } = setup();
    await tabA.container.store.write(memberSession());
    renderApp(tabB.container, '/home', { strict: true });
    await screen.findByTestId('bottom-bar.root');
    await act(async () => tabA.container.store.clear());
    await screen.findByTestId('login.root');
    expect(tabB.reasons).toEqual(['changed']);
  });
});

describe('컨테이너의 기본 채널', () => {
  class RecordingBroadcastChannel {
    static instances: RecordingBroadcastChannel[] = [];
    readonly sent: unknown[] = [];
    constructor(readonly name: string) {
      RecordingBroadcastChannel.instances.push(this);
    }
    postMessage(data: unknown): void {
      this.sent.push(data);
    }
    addEventListener(): void {}
    removeEventListener(): void {}
    close(): void {}
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    RecordingBroadcastChannel.instances = [];
  });

  it('REQ-NAV-022 sessionChannel을 주지 않으면 BroadcastChannel("chalkak-session") 하나를 만들어 기본 IndexedDbSessionStore가 쓴다', async () => {
    vi.stubGlobal('BroadcastChannel', RecordingBroadcastChannel);
    const container = createAppContainer({
      env: { VITE_API_BASE_URL: MOCK_BASE },
      fetch: new FakeFetch().fetch,
      clock: new FakeClock(NOW),
      lock: new InProcessRefreshLock(),
      logger: new RecordingLogger(),
      ids: new SequentialIdGenerator(),
      socialLogin: new FakeSocialLoginClient(),
      indexedDB: new IDBFactory(),
    });
    await container.store.write(memberSession());
    await container.store.clear();
    expect(RecordingBroadcastChannel.instances.map((c) => c.name)).toEqual([SESSION_CHANNEL_NAME]);
    const origin = expect.any(String) as string;
    expect(RecordingBroadcastChannel.instances[0]!.sent).toEqual([
      { origin, previousUserId: null, userId: ME },
      { origin, previousUserId: ME, userId: null },
    ]);
  });

  it('BroadcastChannel이 없는 환경에서도 컨테이너가 만들어지고 저장소가 동작한다', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const container = createAppContainer({
      env: { VITE_API_BASE_URL: MOCK_BASE },
      fetch: new FakeFetch().fetch,
      clock: new FakeClock(NOW),
      lock: new InProcessRefreshLock(),
      logger: new RecordingLogger(),
      ids: new SequentialIdGenerator(),
      socialLogin: new FakeSocialLoginClient(),
      indexedDB: new IDBFactory(),
    });
    await container.store.write(memberSession());
    expect((await container.store.read()).userId).toBe(ME);
  });
});
