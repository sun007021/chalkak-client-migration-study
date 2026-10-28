import { createNetHarness, refreshOk } from '../http/__testing__/createNetHarness';
import { networkFailure } from '../http/__testing__/FakeTransport';
import { fixtureResponse, loadFixture } from '../http/__testing__/loadFixture';
import { FixtureRouter, type RouteValue } from '../../data/__testing__/FixtureRouter';
import { FakeAppVisibility } from '../lifecycle/__testing__/FakeAppVisibility';
import { DevicePushRegistrar } from './DevicePushRegistrar';
import { FakePushTokenProvider } from './__testing__/FakePushTokenProvider';

const PUT = 'PUT /push-devices/current';
const REFRESH = 'POST /auth/refresh';
const WITH_SESSION = loadFixture<{ token: string }>('push/jwt__with-session-id').token;
const WITHOUT_SESSION = loadFixture<{ token: string }>('push/jwt__without-session-id').token;
const NO_CONTENT = 'push/push-devices-current__no-content';

async function setup(
  options: {
    routes?: Record<string, RouteValue>;
    token?: string | null;
    accessToken?: string;
    signedIn?: boolean;
    userId?: string;
  } = {},
) {
  const net = createNetHarness();
  if (options.signedIn !== false) {
    await net.signIn({
      accessToken: options.accessToken ?? WITH_SESSION,
      userId: options.userId ?? 'user-a',
    });
  }
  const router = new FixtureRouter({
    [PUT]: NO_CONTENT,
    [REFRESH]: () => refreshOk(),
    ...options.routes,
  }).install(net.transport);
  const tokens = new FakePushTokenProvider(options.token === undefined ? 'fcm-1' : options.token);
  const visibility = new FakeAppVisibility();
  const registrar = new DevicePushRegistrar({
    api: net.api,
    sessionStore: net.sessionStore,
    tokenRefresher: net.tokenRefresher,
    tokens,
    visibility,
  });
  return { ...net, router, tokens, visibility, registrar };
}
type Harness = Awaited<ReturnType<typeof setup>>;
const puts = (h: Harness) => h.router.calls(PUT);
const bodyOf = (request: { body?: string | Uint8Array }) => JSON.parse(String(request.body));

describe('DevicePushRegistrar 요청', () => {
  it('TC-PUSH-012 PUT /push-devices/current 바디는 {fcmToken}뿐이고 Bearer가 붙는다(204 성공)', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(1);
    expect(bodyOf(puts(h)[0])).toEqual({ fcmToken: 'fcm-1' });
    expect(puts(h)[0].headers.authorization).toBe(`Bearer ${WITH_SESSION}`);
  });

  it('TC-PUSH-018 FCM 토큰이 아직 없으면 요청 0건이고, 토큰이 준비되면(start 구독) 등록한다', async () => {
    const h = await setup({ token: null });
    const stop = h.registrar.start();
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(0);
    h.tokens.emit('fcm-late');
    await h.registrar.settled();
    expect(bodyOf(puts(h)[0])).toEqual({ fcmToken: 'fcm-late' });
    stop();
  });

  it('TC-PUSH-019 전달받은 토큰이 없어도 SDK의 현재 토큰을 조회해 등록한다', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    expect(h.tokens.getTokenCalls).toBeGreaterThanOrEqual(1);
  });

  it('TC-PUSH-031 빈 토큰 문자열은 요청을 보내지 않는다', async () => {
    const h = await setup({ token: '' });
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(0);
  });

  it('REQ-PUSH-018 토큰 원문은 로그에 남기지 않는다', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    expect(h.logger.dump()).not.toContain('fcm-1');
  });
});

describe('DevicePushRegistrar 트리거와 중복 제거', () => {
  it('TC-PUSH-014 TC-PUSH-020 같은 (userId, token)은 한 프로세스에서 한 번만 보낸다', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    await h.registrar.registerDevice();
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(1);
  });

  it('TC-PUSH-021 동시에 호출해도 요청은 1회로 직렬화된다', async () => {
    const h = await setup();
    await Promise.all([
      h.registrar.registerDevice(),
      h.registrar.registerDevice(),
      h.registrar.registerDevice(),
    ]);
    expect(puts(h)).toHaveLength(1);
  });

  it('TC-PUSH-015 토큰이 갱신되면 새 토큰으로 마지막 값 기준 1회 등록한다', async () => {
    const h = await setup();
    const stop = h.registrar.start();
    await h.registrar.registerDevice();
    h.tokens.emit('fcm-2');
    h.tokens.emit('fcm-3');
    await h.registrar.settled();
    expect(puts(h).map((r) => bodyOf(r).fcmToken)).toEqual(['fcm-1', 'fcm-3']);
    stop();
    expect(h.tokens.listenerCount).toBe(0);
  });

  it('REQ-PUSH-008 앱이 포그라운드로 올 때 등록을 시도한다(이미 성공한 쌍이면 요청 없음, 실패했으면 다시)', async () => {
    const h = await setup({ routes: { [PUT]: [networkFailure(), NO_CONTENT] } });
    const stop = h.registrar.start();
    await h.registrar.registerDevice();
    const failed = puts(h).length;
    expect(failed).toBeGreaterThanOrEqual(1);
    h.visibility.emit('background');
    h.visibility.emit('foreground');
    await h.registrar.settled();
    expect(puts(h).length).toBeGreaterThan(failed);
    const afterOk = puts(h).length;
    h.visibility.emit('background');
    h.visibility.emit('foreground');
    await h.registrar.settled();
    expect(puts(h)).toHaveLength(afterOk);
    stop();
    expect(h.visibility.listenerCount).toBe(0);
  });

  it('TC-PUSH-016 TC-PUSH-017 로그아웃·게스트 상태에서는 토큰이 와도 등록하지 않는다', async () => {
    const h = await setup({ signedIn: false });
    const stop = h.registrar.start();
    h.tokens.emit('fcm-early');
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(0);
    await h.sessionStore.enterGuest();
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(0);
    // 로그인 성공 뒤에는 등록한다.
    await h.signIn({ accessToken: WITH_SESSION });
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(1);
    stop();
  });

  it('TC-PUSH-032 TC-PUSH-035 로그아웃 때 캐시를 비우면(resetRegistrationCache) 같은 토큰도 다음 로그인에서 다시 등록하고, 해제 API는 부르지 않는다', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    h.registrar.resetRegistrationCache();
    await h.sessionStore.clear();
    await h.signIn({ accessToken: WITH_SESSION, userId: 'user-b' });
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(2);
    expect(h.transport.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);
  });

  it('TC-PUSH-032 캐시를 비우지 않아도 userId가 바뀌면 새 계정으로 다시 등록한다', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    await h.sessionStore.clear();
    await h.signIn({ accessToken: WITH_SESSION, userId: 'user-b' });
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(2);
  });

  it('등록 중 세션이 바뀌면(generation 변화) 성공을 기록하지 않아 같은 사용자의 다음 시도가 다시 보낸다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const h = await setup({
      routes: {
        [PUT]: async () => {
          await gate;
          return fixtureResponse(NO_CONTENT);
        },
      },
    });
    const first = h.registrar.registerDevice();
    await new Promise((resolve) => setImmediate(resolve));
    await h.sessionStore.clear();
    release();
    await first;
    await h.signIn({ accessToken: WITH_SESSION });
    h.router.set(PUT, NO_CONTENT);
    await h.registrar.registerDevice();
    expect(h.router.calls(PUT)).toHaveLength(1);
  });

  it('TC-PUSH-013 TC-PUSH-033 가입 직후 호출도 로그인과 같게 1회 등록하고 정지 회원도 등록한다(204)', async () => {
    const h = await setup();
    await expect(h.registrar.registerDevice()).resolves.toBeUndefined();
    expect(puts(h)).toHaveLength(1);
  });
});

describe('DevicePushRegistrar session_id 확인', () => {
  it('TC-PUSH-022 session_id가 있으면 refresh 없이 바로 등록한다', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    expect(h.router.calls(REFRESH)).toHaveLength(0);
  });

  it('TC-PUSH-023 session_id가 없으면 먼저 /auth/refresh로 갱신하고 새 토큰으로 등록한다', async () => {
    const h = await setup({
      accessToken: WITHOUT_SESSION,
      routes: { [REFRESH]: () => refreshOk() },
    });
    // 갱신된 토큰(access-2)이 session_id를 가진 JWT가 되도록 한다.
    h.router.set(REFRESH, () => {
      const response = refreshOk();
      return { ...response, bodyText: response.bodyText.replace('access-2', WITH_SESSION) };
    });
    await h.registrar.registerDevice();
    expect(h.router.calls(REFRESH)).toHaveLength(1);
    expect(puts(h)).toHaveLength(1);
    expect(puts(h)[0].headers.authorization).toBe(`Bearer ${WITH_SESSION}`);
  });

  it('TC-PUSH-024 갱신한 JWT에도 session_id가 없으면 등록 0건이고 로그인은 유지된다', async () => {
    const h = await setup({ accessToken: WITHOUT_SESSION });
    await h.registrar.registerDevice();
    expect(h.router.calls(REFRESH)).toHaveLength(1);
    expect(puts(h)).toHaveLength(0);
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });

  it('TC-PUSH-025 session_id 확인용 refresh가 REAUTHENTICATION_REQUIRED면 세션이 지워지고 로그인 이벤트가 나간다', async () => {
    const h = await setup({
      accessToken: WITHOUT_SESSION,
      routes: { [REFRESH]: 'auth/refresh__reauthentication-required' },
    });
    await h.registrar.registerDevice();
    expect(h.emitted).toEqual([{ type: 'session-expired' }]);
    expect((await h.sessionStore.load()).kind).toBe('none');
    expect(puts(h)).toHaveLength(0);
  });
});

describe('DevicePushRegistrar 실패 처리', () => {
  it('TC-PUSH-027 401 UNAUTHORIZED는 refresh 후 1회 재등록한다', async () => {
    const h = await setup({
      routes: { [PUT]: ['push/push-devices-current__unauthorized', NO_CONTENT] },
    });
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(2);
    expect(h.router.calls(REFRESH)).toHaveLength(1);
  });

  it('TC-PUSH-028 TC-PUSH-034 401 REAUTHENTICATION_REQUIRED는 세션을 지우고 로그인 이벤트를 낸다(재등록 없음)', async () => {
    const h = await setup({
      routes: { [PUT]: 'push/push-devices-current__reauthentication-required' },
    });
    await expect(h.registrar.registerDevice()).resolves.toBeUndefined();
    expect(puts(h)).toHaveLength(1);
    expect(h.emitted).toEqual([{ type: 'session-expired' }]);
  });

  it('TC-PUSH-029 등록이 계속 거절돼도 reject하지 않고 로그인을 해제하지 않는다(400)', async () => {
    const h = await setup({
      routes: { [PUT]: 'push/push-devices-current__bad-request-empty-token' },
    });
    await expect(h.registrar.registerDevice()).resolves.toBeUndefined();
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
    expect(h.emitted).toEqual([]);
  });

  it('TC-PUSH-030 REQ-PUSH-012 5xx·네트워크 오류는 D-21 재시도 뒤에도 로그인 유지, 다음 트리거에 다시 시도한다', async () => {
    const h = await setup({ routes: { [PUT]: 'push/push-devices-current__internal-error' } });
    await expect(h.registrar.registerDevice()).resolves.toBeUndefined();
    expect(puts(h)).toHaveLength(3);
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
    h.router.set(PUT, NO_CONTENT);
    await h.registrar.registerDevice();
    expect(h.router.calls(PUT)).toHaveLength(1);
  });

  it('REQ-PUSH-014 TC-PUSH-014 OS 권한과 무관하게 등록한다(레지스트라는 권한 게이트웨이를 쓰지 않는다)', async () => {
    const h = await setup();
    await h.registrar.registerDevice();
    expect(puts(h)).toHaveLength(1);
  });
});
