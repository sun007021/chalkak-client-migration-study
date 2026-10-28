import { LoginViewModel } from './LoginViewModel';
import type { LoginOutcome } from './LoginViewModel';
import { AuthApi } from './AuthApi';
import { SignupDraft } from './SignupDraft';
import { SocialLoginCancelledError, SocialLoginConfigError, SocialLoginFailedError, SocialLoginNoPendingError } from './SocialLoginClient';
import { UserCaches } from '../../core/auth/UserCaches';
import type { StoredSession } from '../../core/auth/SessionStore';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';
import { t } from '../../copy/ko';
import { makeApiEnv } from '../../test/apiEnv';
import { FakeSocialLoginClient, failWith, ok, pending } from '../../test/FakeSocialLoginClient';
import { flushAsync } from '../../test/FakeClock';
import { networkFailure } from '../../test/fakeFetch';
import { NOW, ME, OTHER_USER, guestSession, loadFixture, memberSession, tokens } from '../../test/fixtures';
import { SequentialIdGenerator } from '../../test/sequentialIds';

function setup(session: StoredSession = EMPTY_SESSION) {
  const env = makeApiEnv(session);
  const social = new FakeSocialLoginClient();
  const signupDraft = new SignupDraft();
  const userCaches = new UserCaches();
  const order: string[] = [];
  userCaches.register({ clear: () => void order.push(`caches-cleared(writes=${env.store.writes.length})`) });
  const authApi = new AuthApi({ api: env.client(), clock: env.clock });
  const resume = vi.fn<(url: string, signal?: AbortSignal) => Promise<{ idToken: string; rawNonce: string }>>();
  const vm = new LoginViewModel({ client: social, resume, authApi, store: env.store, signupDraft, userCaches, ids: new SequentialIdGenerator(), logger: env.logger });
  const route = (path: string) => env.ff.route('POST /auth/social-login', () => loadFixture(path).toResponse());
  return { ...env, social, signupDraft, userCaches, order, authApi, resume, vm, route };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const loginCalls = (ff: ReturnType<typeof setup>['ff']) => ff.callsTo('POST /auth/social-login');

describe('LoginViewModel 카카오 로그인 성공 경로', () => {
  it('TC-AUTH-005 TC-AUTH-004 서버에는 SDK 결과의 idToken과 rawNonce 원문을 그대로 보낸다', async () => {
    const { vm, ff, route } = setup();
    route('auth/social-login__login-success.json');
    await vm.loginWithKakao();
    expect(JSON.parse(loginCalls(ff)[0]!.body as string)).toEqual({ provider: 'KAKAO', idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' });
  });

  it('TC-AUTH-007 TC-AUTH-008 LOGIN_SUCCESS면 userId와 토큰·만료 시각(now+초)을 저장하고 홈으로 보낸다', async () => {
    const { vm, store, route } = setup();
    route('auth/social-login__login-success.json');
    const outcome = await vm.loginWithKakao();
    expect(outcome).toEqual({ kind: 'home' });
    expect(await store.read()).toEqual({
      userId: ME,
      tokens: { accessToken: 'fixture-access-token-1', accessTokenExpiresAt: NOW + 900_000, refreshToken: 'fixture-refresh-token-1', refreshTokenExpiresAt: NOW + 2_592_000_000 },
      isGuest: false,
    });
    expect(vm.state.error).toBeNull();
  });

  it('TC-AUTH-034 게스트 상태에서 로그인하면 게스트 플래그가 제거되고 회원 세션이 된다', async () => {
    const { vm, store, route } = setup(guestSession);
    route('auth/social-login__login-success.json');
    await vm.loginWithKakao();
    expect((await store.read()).isGuest).toBe(false);
    expect((await store.read()).userId).toBe(ME);
  });

  it('TC-AUTH-057 정지 회원도 LOGIN_SUCCESS로 안내 없이 홈이 열린다(오류 상태 없음)', async () => {
    const { vm, route } = setup();
    route('auth/social-login__login-success.json');
    expect(await vm.loginWithKakao()).toEqual({ kind: 'home' });
    expect(vm.state).toEqual({ busy: 'none', error: null });
  });

  it('TC-AUTH-058 로그인 성공 시 새 세션을 쓰기 전에 이전 계정의 사용자 캐시를 모두 비운다', async () => {
    const { vm, store, order, route } = setup({ userId: OTHER_USER, tokens: tokens({ refreshToken: 'a-refresh' }), isGuest: false });
    route('auth/social-login__login-success.json');
    await vm.loginWithKakao();
    expect(order).toEqual(['caches-cleared(writes=0)']);
    expect((await store.read()).userId).toBe(ME);
  });

  it('REQ-AUTH-031 로그에 idToken·rawNonce·토큰 값이 남지 않는다', async () => {
    const { vm, logger, route } = setup();
    route('auth/social-login__login-success.json');
    await vm.loginWithKakao();
    for (const secret of ['fake-id-token-1', 'fake-raw-nonce-1', 'fixture-access-token-1', 'fixture-refresh-token-1']) expect(logger.dump()).not.toContain(secret);
  });
});

describe('LoginViewModel SIGN_UP_REQUIRED', () => {
  it('TC-AUTH-010 토큰을 저장하지 않고 약관으로 보내며 idToken·rawNonce를 메모리(SignupDraft)에 유지한다', async () => {
    const { vm, store, signupDraft, route } = setup();
    route('auth/social-login__sign-up-required.json');
    expect(await vm.loginWithKakao()).toEqual({ kind: 'terms' });
    expect(store.writes).toHaveLength(0);
    expect(store.clearCount).toBe(0);
    expect(await store.read()).toEqual(EMPTY_SESSION);
    expect(signupDraft.get()).toEqual({ idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' });
  });

  it('TC-AUTH-010 idToken·rawNonce는 디스크(localStorage, sessionStorage)나 로그에 남지 않는다', async () => {
    localStorage.clear();
    sessionStorage.clear();
    const { vm, logger, route } = setup();
    route('auth/social-login__sign-up-required.json');
    await vm.loginWithKakao();
    expect(JSON.stringify({ ...localStorage })).not.toContain('fake-');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('fake-');
    expect(logger.dump()).not.toContain('fake-id-token-1');
    expect(logger.dump()).not.toContain('fake-raw-nonce-1');
  });
});

describe('LoginViewModel 오류 문구', () => {
  const cases: { tc: string; title: string; setupRoute: (s: ReturnType<typeof setup>) => void; message: string }[] = [
    { tc: 'TC-AUTH-011', title: '알 수 없는 status', setupRoute: (s) => s.route('auth/social-login__unknown-status.json'), message: t('auth.login.error.invalid-response') },
    { tc: 'TC-AUTH-012', title: '토큰 누락', setupRoute: (s) => s.route('auth/social-login__login-success-missing-token.json'), message: t('auth.login.error.invalid-response') },
    { tc: 'TC-AUTH-020', title: '401', setupRoute: (s) => s.route('auth/social-login__unauthorized.json'), message: t('auth.login.error.kakao-account') },
    { tc: 'TC-AUTH-021', title: '403 차단(서버 message 그대로)', setupRoute: (s) => s.route('auth/social-login__forbidden-banned.json'), message: '차단된 소셜 계정입니다.' },
    { tc: 'TC-AUTH-022', title: '403 탈퇴한 차단(서버 message 그대로)', setupRoute: (s) => s.route('auth/social-login__forbidden-withdrawn-banned.json'), message: '탈퇴한 차단 소셜 계정입니다.' },
    { tc: 'TC-AUTH-023', title: '400 BUSINESS_ERROR(클라이언트 버그)', setupRoute: (s) => s.route('auth/social-login__bad-request-authcode.json'), message: t('auth.login.error.generic') },
    { tc: 'TC-AUTH-024', title: '500', setupRoute: (s) => s.route('auth/social-login__internal-error.json'), message: t('auth.login.error.generic') },
    { tc: 'TC-AUTH-025', title: '연결 실패', setupRoute: (s) => s.ff.route('POST /auth/social-login', networkFailure), message: t('auth.login.error.network') },
    { tc: 'TC-AUTH-026', title: '502 HTML', setupRoute: (s) => s.ff.route('POST /auth/social-login', () => loadFixture('common/error__bad-gateway-html.json').toResponse()), message: t('auth.login.error.generic') },
  ];

  it.each(cases)('$tc $title: 문구를 보이고 세션을 저장하지 않으며 요청은 1회뿐이고 버튼이 다시 활성화된다', async (c) => {
    const s = setup();
    c.setupRoute(s);
    const pendingOutcome = s.vm.loginWithKakao();
    await s.clock.advance(60_000); // 재시도 백오프가 있었다면 여기서 드러난다
    expect(await pendingOutcome).toEqual({ kind: 'stay' });
    expect(s.vm.state.error?.message).toBe(c.message);
    expect(s.vm.state.busy).toBe('none');
    expect(s.store.writes).toHaveLength(0);
    expect(loginCalls(s.ff)).toHaveLength(1);
    expect(s.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-AUTH-020 401 뒤 다음 시도는 새 idToken과 새 rawNonce로 처음부터 한다', async () => {
    const { vm, ff, social } = setup();
    ff.route('POST /auth/social-login', () => loadFixture('auth/social-login__unauthorized.json').toResponse(), () => loadFixture('auth/social-login__login-success.json').toResponse());
    await vm.loginWithKakao();
    expect(await vm.loginWithKakao()).toEqual({ kind: 'home' });
    expect(social.calls).toBe(2);
    const bodies = loginCalls(ff).map((c) => JSON.parse(c.body as string) as { idToken: string; rawNonce: string });
    expect(bodies[0]).toMatchObject({ idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' });
    expect(bodies[1]).toMatchObject({ idToken: 'fake-id-token-2', rawNonce: 'fake-raw-nonce-2' });
  });

  it('TC-AUTH-029 같은 오류가 연달아 두 번 나와도 두 번째 오류는 새 id로 다시 표시된다', async () => {
    const { vm, route } = setup();
    route('auth/social-login__internal-error.json');
    await vm.loginWithKakao();
    const first = vm.state.error;
    await vm.loginWithKakao(); // 확인을 누르기 전에 다시 시도해도
    const second = vm.state.error;
    expect(second?.message).toBe(first?.message);
    expect(second?.id).not.toBe(first?.id);
  });

  it('REQ-AUTH-018 오류 확인(dismissError) 뒤에는 오류가 없고 다시 제출할 수 있다', async () => {
    const { vm, route } = setup();
    route('auth/social-login__internal-error.json');
    await vm.loginWithKakao();
    vm.dismissError();
    expect(vm.state).toEqual({ busy: 'none', error: null });
  });
});

describe('LoginViewModel 카카오 SDK 단계', () => {
  it('TC-AUTH-013 사용자 취소는 오류 문구 없이 대기 상태로 돌아가고 서버를 부르지 않는다', async () => {
    const { vm, social, ff } = setup();
    social.script(failWith(new SocialLoginCancelledError('cancelled')));
    expect(await vm.loginWithKakao()).toEqual({ kind: 'stay' });
    expect(vm.state).toEqual({ busy: 'none', error: null });
    expect(ff.calls).toHaveLength(0);
    social.script(ok());
    // 버튼이 다시 눌린다
    ff.route('POST /auth/social-login', () => loadFixture('auth/social-login__login-success.json').toResponse());
    expect(await vm.loginWithKakao()).toEqual({ kind: 'home' });
  });

  it('TC-AUTH-018 idToken 없음·설정 오류면 "카카오 로그인 설정을 확인해 주세요."를 보이고 서버 호출은 0건이다', async () => {
    const { vm, social, ff } = setup();
    social.script(failWith(new SocialLoginConfigError('no id token')));
    await vm.loginWithKakao();
    expect(vm.state.error?.message).toBe(t('auth.login.error.config'));
    expect(ff.calls).toHaveLength(0);
  });

  it('TC-AUTH-019 SDK 일반 실패(알 수 없는 예외 포함)는 "카카오 로그인에 실패했어요. 다시 시도해 주세요."이고 서버 호출은 0건이다', async () => {
    for (const error of [new SocialLoginFailedError('sdk'), new Error('???')]) {
      const { vm, social, ff } = setup();
      social.script(failWith(error));
      await vm.loginWithKakao();
      expect(vm.state.error?.message).toBe(t('auth.login.error.kakao-failed'));
      expect(vm.state.busy).toBe('none');
      expect(ff.calls).toHaveLength(0);
    }
  });
});

describe('LoginViewModel 중복 제출·재진입·늦은 응답', () => {
  it('TC-AUTH-027 카카오 버튼 3회 연타: SDK 호출 1회, social-login 요청 1회, 진행 중에는 busy', async () => {
    const { vm, social, ff, route } = setup();
    social.script(pending);
    route('auth/social-login__login-success.json');
    const outcomes = [vm.loginWithKakao(), vm.loginWithKakao(), vm.loginWithKakao()];
    expect(vm.state.busy).toBe('kakao');
    social.resolvePending();
    const results = await Promise.all(outcomes);
    expect(social.calls).toBe(1);
    expect(loginCalls(ff)).toHaveLength(1);
    expect(results.filter((r: LoginOutcome) => r.kind === 'home')).toHaveLength(1);
    expect(results.filter((r: LoginOutcome) => r.kind === 'stay')).toHaveLength(2);
  });

  it('TC-AUTH-027 서버 로그인 중에는 busy=server이고 카카오·게스트를 다시 눌러도 아무 일도 일어나지 않는다', async () => {
    const { vm, social, ff, store } = setup();
    const gate = deferred<void>();
    ff.route('POST /auth/social-login', () => gate.promise.then(() => loadFixture('auth/social-login__login-success.json').toResponse()));
    const first = vm.loginWithKakao();
    await flushAsync();
    expect(vm.state.busy).toBe('server');
    expect(await vm.loginWithKakao()).toEqual({ kind: 'stay' });
    expect(await vm.browseAsGuest()).toEqual({ kind: 'stay' });
    expect(social.calls).toBe(1);
    gate.resolve();
    expect(await first).toEqual({ kind: 'home' });
    expect((await store.read()).isGuest).toBe(false);
  });

  it('TC-AUTH-028 로그인 성공 뒤 새 화면(새 ViewModel)에서 다시 제출할 수 있다', async () => {
    const s = setup();
    s.route('auth/social-login__login-success.json');
    await s.vm.loginWithKakao();
    const again = new LoginViewModel({ client: s.social, authApi: s.authApi, store: s.store, signupDraft: s.signupDraft, userCaches: s.userCaches, ids: new SequentialIdGenerator() });
    expect(again.state).toEqual({ busy: 'none', error: null });
    expect(await again.loginWithKakao()).toEqual({ kind: 'home' });
    expect(loginCalls(s.ff)).toHaveLength(2);
  });

  it('TC-AUTH-030 요청이 오래 걸린 뒤(백그라운드 복귀) 응답이 도착해도 정상 처리되어 홈으로 간다', async () => {
    const { vm, ff, clock, store } = setup();
    const gate = deferred<void>();
    ff.route('POST /auth/social-login', () => gate.promise.then(() => loadFixture('auth/social-login__login-success.json').toResponse()));
    const outcome = vm.loginWithKakao();
    await clock.advance(5_000);
    gate.resolve();
    expect(await outcome).toEqual({ kind: 'home' });
    expect((await store.read()).userId).toBe(ME);
  });

  it('TC-AUTH-031 서버 응답 전에 화면을 벗어나면(dispose) 요청이 취소되고 세션도 오류도 남기지 않는다', async () => {
    const { vm, ff, store } = setup();
    const gate = deferred<void>();
    ff.route('POST /auth/social-login', () => gate.promise.then(() => loadFixture('auth/social-login__login-success.json').toResponse()));
    const outcome = vm.loginWithKakao();
    await flushAsync();
    vm.dispose();
    expect(ff.calls[0]!.signal?.aborted).toBe(true);
    gate.resolve();
    expect(await outcome).toEqual({ kind: 'cancelled' });
    expect(store.writes).toHaveLength(0);
    expect(vm.state.error).toBeNull();
  });

  it('TC-AUTH-031 카카오 인증 중 화면을 벗어났다가 결과가 늦게 와도 서버를 부르지 않는다', async () => {
    const { vm, social, ff, store } = setup();
    social.script(pending);
    const outcome = vm.loginWithKakao();
    vm.dispose();
    social.resolvePending();
    expect(await outcome).toEqual({ kind: 'cancelled' });
    expect(ff.calls).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
  });
});

describe('LoginViewModel 게스트', () => {
  it('TC-AUTH-032 서버 호출 없이 인증 자격을 지우고 게스트 플래그를 저장한 뒤 홈으로 보낸다', async () => {
    const { vm, store, ff, social } = setup(memberSession());
    expect(await vm.browseAsGuest()).toEqual({ kind: 'home' });
    expect(ff.calls).toHaveLength(0);
    expect(social.calls).toBe(0);
    expect(await store.read()).toEqual({ userId: null, tokens: null, isGuest: true });
  });

  it('REQ-AUTH-020 게스트 플래그 저장이 실패하면 로그인 화면에 머물고 auth.login.error.guest를 보인다', async () => {
    const { vm, store } = setup();
    vi.spyOn(store, 'write').mockRejectedValueOnce(new Error('idb write failed'));
    expect(await vm.browseAsGuest()).toEqual({ kind: 'stay' });
    expect(vm.state.error?.message).toBe(t('auth.login.error.guest'));
    expect(vm.state.busy).toBe('none');
  });
});

describe('LoginViewModel 리다이렉트 복귀', () => {
  it('콜백 URL에서 복원한 credential로 social-login을 이어 가 홈으로 보낸다', async () => {
    const { vm, resume, ff, route } = setup();
    resume.mockResolvedValue({ idToken: 'resumed-id-token', rawNonce: 'resumed-raw-nonce' });
    route('auth/social-login__login-success.json');
    expect(await vm.resumeKakaoRedirect('https://app.test/login/kakao-callback?code=c&state=s')).toEqual({ kind: 'home' });
    expect(resume).toHaveBeenCalledWith('https://app.test/login/kakao-callback?code=c&state=s', expect.any(AbortSignal));
    expect(JSON.parse(loginCalls(ff)[0]!.body as string)).toEqual({ provider: 'KAKAO', idToken: 'resumed-id-token', rawNonce: 'resumed-raw-nonce' });
  });

  it('TC-AUTH-013 복귀 처리에서 취소면 오류 문구 없이 머문다', async () => {
    const { vm, resume, ff } = setup();
    resume.mockRejectedValue(new SocialLoginCancelledError('cancelled'));
    expect(await vm.resumeKakaoRedirect('https://app.test/login/kakao-callback?error=access_denied')).toEqual({ kind: 'stay' });
    expect(vm.state.error).toBeNull();
    expect(ff.calls).toHaveLength(0);
  });

  it('TC-AUTH-019 복귀 처리 실패는 kakao-failed 문구이고 서버를 부르지 않는다', async () => {
    const { vm, resume, ff } = setup();
    resume.mockRejectedValue(new SocialLoginFailedError('state mismatch'));
    await vm.resumeKakaoRedirect('https://app.test/login/kakao-callback?code=c&state=bad');
    expect(vm.state.error?.message).toBe(t('auth.login.error.kakao-failed'));
    expect(ff.calls).toHaveLength(0);
  });
});

describe('LoginViewModel 보강', () => {
  it('reset: 진행 중(카카오 리다이렉트로 페이지를 떠난 상태)이던 상태와 오류를 초기 상태로 되돌린다', async () => {
    const { vm, social } = setup();
    social.script(pending);
    void vm.loginWithKakao();
    expect(vm.state.busy).toBe('kakao');
    vm.reset();
    expect(vm.state).toEqual({ busy: 'none', error: null });
  });

  it('복귀 처리에서 보관된 시도가 없으면 오류 없이 no_pending이고 세션 유무를 알려 준다', async () => {
    const none = setup();
    none.resume.mockRejectedValue(new SocialLoginNoPendingError('none'));
    expect(await none.vm.resumeKakaoRedirect('https://app.test/cb')).toEqual({ kind: 'no_pending', hasSession: false });
    expect(none.vm.state).toEqual({ busy: 'none', error: null });
    expect(none.ff.calls).toHaveLength(0);

    const member = setup(memberSession());
    member.resume.mockRejectedValue(new SocialLoginNoPendingError('none'));
    expect(await member.vm.resumeKakaoRedirect('https://app.test/cb')).toEqual({ kind: 'no_pending', hasSession: true });

    const guest = setup(guestSession);
    guest.resume.mockRejectedValue(new SocialLoginNoPendingError('none'));
    expect(await guest.vm.resumeKakaoRedirect('https://app.test/cb')).toEqual({ kind: 'no_pending', hasSession: true });
  });

  it('REQ-AUTH-004 새 로그인 시도를 시작하면 이전 가입 대기 자격 증명을 지운다', async () => {
    const { vm, signupDraft, social } = setup();
    signupDraft.set({ idToken: 'old-id-token', rawNonce: 'old-raw-nonce' });
    social.script(pending);
    void vm.loginWithKakao();
    expect(signupDraft.get()).toBeNull();
  });

  it('복원 시 signal을 resume에 전달하고 dispose하면 abort된다', async () => {
    const { vm, resume } = setup();
    resume.mockReturnValue(new Promise(() => {}));
    void vm.resumeKakaoRedirect('https://app.test/cb');
    const signal = resume.mock.calls[0]![1]!;
    expect(signal.aborted).toBe(false);
    vm.dispose();
    expect(signal.aborted).toBe(true);
  });
});
