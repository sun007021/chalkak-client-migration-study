import { SocialLoginError } from '../../core/auth/SocialLoginClient';
import { networkFailure, deferred } from '../../core/http/__testing__/FakeTransport';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import { t } from '../../shared/copy';
import { createLoginHarness } from './__testing__/createLoginHarness';

const LOGIN_OK = { 'POST /auth/social-login': 'auth/social-login__login-success' };
const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe('LoginViewModel 화면 표시', () => {
  it('TC-AUTH-001 초기 상태는 버튼이 활성이고 오류가 없다', () => {
    const h = createLoginHarness();
    expect(h.viewModel.getSnapshot()).toEqual({ busy: false, error: null });
  });

  it('REQ-BOOT-021 화면이 보이면 screen_view login을 한 번 보낸다', () => {
    const h = createLoginHarness();
    h.viewModel.onScreenShown();
    expect(h.analytics.events).toEqual([{ name: 'screen_view', params: { screen_name: 'login' } }]);
  });
});

describe('LoginViewModel 카카오 로그인', () => {
  it('TC-AUTH-004 SDK에는 해시 nonce를, 서버 요청에는 rawNonce 원문을 쓰며 둘이 섞이지 않는다', async () => {
    const h = createLoginHarness();
    h.routes(LOGIN_OK);
    await h.viewModel.onKakaoPress();

    expect(h.client.nonceHashes).toEqual(['hash-1']);
    const [request] = h.transport.requestsTo('POST', '/auth/social-login');
    const body = JSON.parse(request.body as string);
    expect(body.rawNonce).toBe('raw-1');
    expect(JSON.stringify(body)).not.toContain('hash-1');
    expect(body.idToken).toBe('fake-id-token');
  });

  it('TC-AUTH-008 TC-AUTH-057 LOGIN_SUCCESS면 푸시 등록을 시작하고 안내 없이 메인(회원)으로 간다', async () => {
    const h = createLoginHarness();
    h.routes(LOGIN_OK);
    await h.viewModel.onKakaoPress();

    expect(h.push.registerCalls).toBe(1);
    expect(h.navigator.calls).toEqual(['main:member']);
    expect(h.viewModel.getSnapshot().error).toBeNull();
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });

  it('TC-AUTH-008 푸시 등록이 실패해도 메인으로 간다', async () => {
    const h = createLoginHarness();
    h.routes(LOGIN_OK);
    h.push.failRegister = true;
    await h.viewModel.onKakaoPress();
    expect(h.navigator.calls).toEqual(['main:member']);
    expect(h.viewModel.getSnapshot().error).toBeNull();
  });

  it('TC-AUTH-010 SIGN_UP_REQUIRED면 토큰을 저장하지 않고 약관 단계로 idToken·rawNonce를 넘긴다', async () => {
    const h = createLoginHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__sign-up-required' });
    await h.viewModel.onKakaoPress();

    expect(h.navigator.calls).toEqual(['sign-up']);
    expect(h.navigator.lastPending).toEqual({ idToken: 'fake-id-token', rawNonce: 'raw-1' });
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.push.registerCalls).toBe(0);
  });

  it('TC-AUTH-013 사용자 취소는 오류 문구 없이 버튼이 다시 활성화되고 서버를 부르지 않는다', async () => {
    const h = createLoginHarness();
    h.client.outcome = { kind: 'cancelled' };
    await h.viewModel.onKakaoPress();

    expect(h.viewModel.getSnapshot()).toEqual({ busy: false, error: null });
    expect(h.transport.requests).toHaveLength(0);
    expect(h.navigator.calls).toEqual([]);
  });

  it('TC-AUTH-018 SDK config 오류는 설정 확인 문구를 보이고 서버를 부르지 않는다', async () => {
    const h = createLoginHarness();
    h.client.outcome = new SocialLoginError('config');
    await h.viewModel.onKakaoPress();
    expect(h.viewModel.getSnapshot().error?.message).toBe(t('auth.login.error.config'));
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-AUTH-019 SDK 일반 실패는 카카오 로그인 실패 문구를 보이고 서버를 부르지 않는다', async () => {
    const h = createLoginHarness();
    h.client.outcome = new SocialLoginError('failed');
    await h.viewModel.onKakaoPress();
    expect(h.viewModel.getSnapshot().error?.message).toBe(t('auth.login.error.kakao-failed'));
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-AUTH-020 401 뒤 다음 시도는 새 rawNonce·새 idToken으로 처음부터 하고 갱신은 시도하지 않는다', async () => {
    const h = createLoginHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__unauthorized' });
    await h.viewModel.onKakaoPress();
    expect(h.viewModel.getSnapshot().error?.message).toBe(t('auth.login.error.kakao-account'));

    h.client.outcome = { kind: 'success', idToken: 'fresh-id-token' };
    h.routes(LOGIN_OK);
    await h.viewModel.onKakaoPress();

    const requests = h.transport.requestsTo('POST', '/auth/social-login');
    const bodies = requests.map((r) => JSON.parse(r.body as string));
    expect(bodies.map((b) => b.rawNonce)).toEqual(['raw-1', 'raw-2']);
    expect(bodies[1].idToken).toBe('fresh-id-token');
    expect(h.client.nonceHashes).toEqual(['hash-1', 'hash-2']);
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    expect(h.navigator.calls).toEqual(['main:member']);
  });

  it('TC-AUTH-021 403은 서버 message를 보이고 자동 재시도하지 않는다', async () => {
    const h = createLoginHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__forbidden-banned' });
    await h.viewModel.onKakaoPress();
    expect(h.viewModel.getSnapshot().error?.message).toBe('차단된 소셜 계정입니다.');
    expect(h.transport.requests).toHaveLength(1);
  });

  it.each([
    ['TC-AUTH-023', 'auth/social-login__bad-request-authcode', t('auth.login.error.generic')],
    ['TC-AUTH-024', 'auth/social-login__internal-error', t('auth.login.error.generic')],
    ['TC-AUTH-011', 'auth/social-login__unknown-status', t('auth.login.error.invalid-response')],
    [
      'TC-AUTH-012',
      'auth/social-login__login-success-missing-token',
      t('auth.login.error.invalid-response'),
    ],
  ])(
    '%s 서버 응답 %s는 문구 "%s"로 보이고 세션을 저장하지 않는다',
    async (_id, fixture, message) => {
      const h = createLoginHarness();
      h.routes({ 'POST /auth/social-login': fixture });
      await h.viewModel.onKakaoPress();
      expect(h.viewModel.getSnapshot().error?.message).toBe(message);
      expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
      expect(h.navigator.calls).toEqual([]);
    },
  );

  it('TC-AUTH-025 연결 실패는 네트워크 문구이고 요청은 1회뿐이다', async () => {
    const h = createLoginHarness();
    h.transport.script(networkFailure());
    await h.viewModel.onKakaoPress();
    expect(h.viewModel.getSnapshot().error?.message).toBe(t('auth.login.error.network'));
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-AUTH-026 502 HTML 응답은 일반 문구이고 크래시하지 않는다', async () => {
    const h = createLoginHarness();
    h.transport.script(fixtureResponse('common/error__bad-gateway-html'));
    await h.viewModel.onKakaoPress();
    expect(h.viewModel.getSnapshot().error?.message).toBe(t('auth.login.error.generic'));
  });
});

describe('LoginViewModel 진행 상태', () => {
  it('TC-AUTH-027 연타해도 SDK 호출 1회, 서버 요청 1회이며 진행 중에는 busy다', async () => {
    const h = createLoginHarness();
    h.routes(LOGIN_OK);
    const gate = deferred<void>();
    h.client.gate = gate.promise;

    const first = h.viewModel.onKakaoPress();
    void h.viewModel.onKakaoPress();
    void h.viewModel.onKakaoPress();
    await flush();
    expect(h.viewModel.getSnapshot().busy).toBe(true);

    gate.resolve();
    await first;
    await flush();

    expect(h.client.nonceHashes).toHaveLength(1);
    expect(h.transport.requestsTo('POST', '/auth/social-login')).toHaveLength(1);
  });

  it('TC-AUTH-027 서버 로그인 중에도 busy이고 게스트 버튼도 무시한다', async () => {
    const h = createLoginHarness();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/social-login__login-success');
    });

    const login = h.viewModel.onKakaoPress();
    await flush();
    expect(h.viewModel.getSnapshot().busy).toBe(true);
    await h.viewModel.onGuestPress();
    expect(h.navigator.calls).toEqual([]);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });

    gate.resolve();
    await login;
    expect(h.viewModel.getSnapshot().busy).toBe(false);
  });

  it('TC-AUTH-018 오류가 표시된 뒤에는 버튼이 다시 활성화되어 재시도할 수 있다', async () => {
    const h = createLoginHarness();
    h.transport.script(networkFailure());
    await h.viewModel.onKakaoPress();
    expect(h.viewModel.getSnapshot().busy).toBe(false);
    expect(h.viewModel.getSnapshot().error).not.toBeNull();

    h.routes(LOGIN_OK);
    await h.viewModel.onKakaoPress();
    expect(h.navigator.calls).toEqual(['main:member']);
    expect(h.viewModel.getSnapshot().error).toBeNull();
  });

  it('TC-AUTH-029 같은 오류가 연달아 두 번 나도 매번 새 오류(id 증가)로 표시된다', async () => {
    const h = createLoginHarness();
    h.transport.script(networkFailure());
    await h.viewModel.onKakaoPress();
    const first = h.viewModel.getSnapshot().error;
    await h.viewModel.onKakaoPress();
    const second = h.viewModel.getSnapshot().error;

    expect(second?.message).toBe(first?.message);
    expect(second?.id).toBeGreaterThan(first?.id ?? Number.POSITIVE_INFINITY);
  });

  it('dismissError는 오류를 지운다', async () => {
    const h = createLoginHarness();
    h.transport.script(networkFailure());
    await h.viewModel.onKakaoPress();
    h.viewModel.dismissError();
    expect(h.viewModel.getSnapshot().error).toBeNull();
  });

  it('TC-AUTH-031 응답이 오기 전에 화면이 사라지면 늦게 온 LOGIN_SUCCESS를 저장·이동·오류 표시하지 않는다', async () => {
    const h = createLoginHarness();
    const gate = deferred<void>();
    h.transport.respond(async () => {
      await gate.promise;
      return fixtureResponse('auth/social-login__login-success');
    });

    const login = h.viewModel.onKakaoPress();
    await flush();
    h.viewModel.dispose();
    gate.resolve();
    await login;

    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.navigator.calls).toEqual([]);
    expect(h.push.registerCalls).toBe(0);
    expect(h.viewModel.getSnapshot().error).toBeNull();
  });

  it('TC-AUTH-028 로그인 성공 뒤 새 ViewModel(화면 재진입)은 깨끗한 상태에서 다시 제출할 수 있다', async () => {
    const h = createLoginHarness();
    h.routes(LOGIN_OK);
    await h.viewModel.onKakaoPress();
    h.viewModel.dispose();

    const second = createLoginHarness();
    expect(second.viewModel.getSnapshot()).toEqual({ busy: false, error: null });
    second.routes(LOGIN_OK);
    await second.viewModel.onKakaoPress();
    expect(second.navigator.calls).toEqual(['main:member']);
  });

  it('REQ-AUTH-031 실패해도 idToken·rawNonce를 콘솔과 분석 이벤트에 남기지 않는다', async () => {
    const h = createLoginHarness();
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => undefined),
    );
    h.routes({ 'POST /auth/social-login': 'auth/social-login__unauthorized' });
    h.viewModel.onScreenShown();
    await h.viewModel.onKakaoPress();

    const printed = JSON.stringify([...spies.flatMap((s) => s.mock.calls), h.analytics.events]);
    expect(printed).not.toContain('fake-id-token');
    expect(printed).not.toContain('raw-1');
    spies.forEach((s) => s.mockRestore());
  });
});

describe('LoginViewModel 게스트', () => {
  it('TC-AUTH-032 게스트 버튼은 서버 호출 없이 게스트 플래그를 저장하고 메인(게스트)으로 간다', async () => {
    const h = createLoginHarness();
    await h.viewModel.onGuestPress();

    expect(h.transport.requests).toHaveLength(0);
    expect(await h.sessionStore.load()).toEqual({ kind: 'guest' });
    expect(h.navigator.calls).toEqual(['main:guest']);
    expect(h.push.registerCalls).toBe(0);
  });

  it('REQ-AUTH-020 게스트 플래그 저장이 실패하면 로그인 화면에 머물고 guest 오류 문구를 보인다', async () => {
    const h = createLoginHarness();
    h.storage.failNextWrite = true;
    await h.viewModel.onGuestPress();

    expect(h.navigator.calls).toEqual([]);
    expect(h.viewModel.getSnapshot().error?.message).toBe(t('auth.login.error.guest'));
    expect(h.viewModel.getSnapshot().busy).toBe(false);
  });
});
