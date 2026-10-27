import { IDBFactory } from 'fake-indexeddb';
import { createAppContainer } from './container';
import { IndexedDbSessionStore } from '../core/auth/IndexedDbSessionStore';
import { InProcessRefreshLock } from '../core/auth/RefreshLock';
import { d } from '../core/net/decode';
import { ConfigError } from '../core/net/errors';
import { FakeAnalyticsTracker } from '../test/FakeAnalyticsTracker';
import { makeHarness } from '../test/appHarness';
import { MOCK_BASE } from '../test/apiEnv';
import { FakeClock } from '../test/FakeClock';
import { FakeSessionStore } from '../test/FakeSessionStore';
import { FakeFetch } from '../test/fakeFetch';
import { loadFixture } from '../test/fixtures';
import { loadStorageFixture } from '../test/sessionFixtures';
import { SequentialIdGenerator } from '../test/sequentialIds';

const decodeId = d.object({ id: d.string() });

describe('앱 조립 (container)', () => {
  it('REQ-NET-002 잘못된 VITE_API_BASE_URL(비 loopback http)이면 ConfigError를 던지고 개발 서버 주소로 대체하지 않는다', () => {
    expect(() => createAppContainer({ env: { VITE_API_BASE_URL: 'http://chalkak.example' } })).toThrow(ConfigError);
    expect(() => createAppContainer({ env: { VITE_API_BASE_URL: 'https://x.test/api/v1' } })).toThrow(ConfigError);
  });

  it('REQ-NET-003 비어 있거나 same-origin이면 현재 페이지 출처를 쓰고 /api/v1을 붙여 요청한다', async () => {
    const ff = new FakeFetch();
    const container = createAppContainer({
      env: {},
      pageOrigin: 'https://app.test',
      fetch: ff.fetch,
      clock: new FakeClock(),
      store: new FakeSessionStore(),
      lock: new InProcessRefreshLock(),
      ids: new SequentialIdGenerator(),
    });
    ff.route('GET /ping', () => Response.json({ id: 'ok' }));
    await container.api.request({ method: 'GET', path: '/ping' }, decodeId);
    expect(ff.calls[0]!.url).toBe('https://app.test/api/v1/ping');
  });

  it('SessionStore를 덮어쓰지 않으면 IndexedDB 구현(IndexedDbSessionStore)을 쓴다', () => {
    const container = createAppContainer({ env: { VITE_API_BASE_URL: MOCK_BASE }, indexedDB: new IDBFactory() });
    expect(container.store).toBeInstanceOf(IndexedDbSessionStore);
  });

  it('분석 reporter는 주입한 tracker로 보낸다', () => {
    const tracker = new FakeAnalyticsTracker();
    const container = createAppContainer({ env: { VITE_API_BASE_URL: MOCK_BASE }, indexedDB: new IDBFactory(), tracker });
    container.analytics.screenView('login');
    expect(tracker.events).toEqual([{ name: 'screen_view', params: { screen_name: 'login' } }]);
  });

  it('TC-BOOT-009 access token만 만료된 세션: 첫 인증 API는 Authorization 없이 나가 401을 받고 refresh 후 새 토큰으로 1회 재전송된다', async () => {
    const h = makeHarness({ session: loadStorageFixture('session__access-expired').session });
    const seen: (string | undefined)[] = [];
    h.ff.route('GET /notifications', (req) => {
      seen.push(req.headers['authorization']);
      return req.headers['authorization'] ? Response.json({ id: 'ok' }) : loadFixture('common/error__unauthorized-token-invalid.json').toResponse();
    });
    h.ff.route('POST /auth/refresh', () => loadFixture('auth/refresh__success.json').toResponse());
    await expect(h.container.api.request({ method: 'GET', path: '/notifications' }, decodeId)).resolves.toEqual({ id: 'ok' });
    expect(seen).toEqual([undefined, 'Bearer fixture-access-token-2']);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect((await h.store.read()).tokens?.refreshToken).toBe('fixture-refresh-token-2');
  });

  it('TC-AUTH-056 일반 API가 401 REAUTHENTICATION_REQUIRED를 받으면 세션을 지우고 sessionEvents에 expired를 한 번 낸다(refresh는 부르지 않는다)', async () => {
    const h = makeHarness({ session: loadStorageFixture('session__authenticated').session });
    const reasons: string[] = [];
    h.container.sessionEvents.subscribe((r) => reasons.push(r));
    h.ff.route('GET /notifications', () => loadFixture('auth/refresh__reauthentication-required.json').toResponse());
    await expect(h.container.api.request({ method: 'GET', path: '/notifications' }, decodeId)).rejects.toMatchObject({ status: 401, errorCode: 'REAUTHENTICATION_REQUIRED' });
    expect(reasons).toEqual(['expired']);
    expect(h.store.clearCount).toBe(1);
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-AUTH-059 개발 플래그가 꺼져 있으면 devSession 서비스를 만들지 않는다', () => {
    const off = makeHarness({ devSession: false }).container;
    expect(off.devSessionEnabled).toBe(false);
    expect(off.devSessionDeps).toBeNull();
    const on = makeHarness({ devSession: true }).container;
    expect(on.devSessionEnabled).toBe(true);
    expect(on.devSessionDeps).not.toBeNull();
  });

  it('REQ-AUTH-004 로그아웃·만료·탈퇴 이벤트가 나면 가입 대기 중이던 idToken·rawNonce를 지운다', () => {
    const { container } = makeHarness();
    for (const reason of ['logout', 'expired', 'withdrawn'] as const) {
      container.signupDraft.set({ idToken: 'i', rawNonce: 'n' });
      container.sessionEvents.emit(reason);
      expect(container.signupDraft.get()).toBeNull();
    }
  });

  it('페이지 출처를 알 수 없으면 ConfigError를 던진다', () => {
    vi.stubGlobal('location', undefined);
    try {
      expect(() => createAppContainer({ env: { VITE_API_BASE_URL: MOCK_BASE }, indexedDB: new IDBFactory() })).toThrow(ConfigError);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('화면용 ViewModel 팩토리는 현재 컨테이너 값(덮어쓴 preloader 포함)을 쓴다', () => {
    const { container } = makeHarness();
    expect(container.createLoginViewModel().state).toEqual({ busy: 'none', error: null });
    expect(container.createBootViewModel().state).toEqual({ phase: 'splash' });
  });
});
