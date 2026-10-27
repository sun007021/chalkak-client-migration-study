import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { SocialLoginCancelledError, SocialLoginConfigError, SocialLoginFailedError } from './SocialLoginClient';
import { t } from '../../copy/ko';
import { makeHarness, renderApp } from '../../test/appHarness';
import type { Harness } from '../../test/appHarness';
import { failWith, pending } from '../../test/FakeSocialLoginClient';
import { networkFailure } from '../../test/fakeFetch';
import { ME, loadFixture } from '../../test/fixtures';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';

async function openLogin(options: Parameters<typeof makeHarness>[0] = {}) {
  const h = makeHarness(options);
  const view = renderApp(h.container, '/login');
  await screen.findByTestId('login.root');
  return { h, ...view };
}

const route = (h: Pick<Harness, 'ff'>, fixture: string) => h.ff.route('POST /auth/social-login', () => loadFixture(fixture).toResponse());
const kakao = () => screen.getByTestId('login.kakao-button');
const guest = () => screen.getByTestId('login.guest-button');

describe('로그인 화면 구성', () => {
  it('TC-AUTH-001 태그라인, "카카오로 계속하기", "로그인 없이 사진 둘러보기"가 보이고 Apple/Google 버튼은 없다', async () => {
    await openLogin();
    expect(screen.getByTestId('login.tagline')).toHaveTextContent(/매일 하나의 주제,\s*각자의 한 장/);
    expect(kakao()).toHaveTextContent(t('auth.login.kakao'));
    expect(kakao()).toHaveTextContent('카카오로 계속하기');
    expect(guest()).toHaveTextContent(t('auth.login.guest'));
    expect(guest()).toHaveTextContent('로그인 없이 사진 둘러보기');
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText(/apple|google/i)).not.toBeInTheDocument();
  });

  it('대기 상태에서는 진행 표시·오류 알림이 DOM에 없고 두 버튼이 활성이다', async () => {
    await openLogin();
    expect(screen.queryByTestId('login.loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login.error-dialog')).not.toBeInTheDocument();
    expect(kakao()).toBeEnabled();
    expect(guest()).toBeEnabled();
  });

  it('TC-AUTH-059 개발 플래그가 꺼져 있으면 로그인 우회 버튼이 없다', async () => {
    await openLogin({ env: { DEV: false } });
    expect(screen.queryByTestId('login.dev-bypass-button')).not.toBeInTheDocument();
  });

  it('TC-AUTH-059 개발 플래그가 켜져 있으면 로그인 우회 버튼이 있고 누르면 /dev/session으로 간다', async () => {
    const { path } = await openLogin({ env: { DEV: true } });
    fireEvent.click(screen.getByTestId('login.dev-bypass-button'));
    await waitFor(() => expect(path()).toBe('/dev/session'));
  });
});

describe('카카오 로그인 흐름', () => {
  it('TC-AUTH-005 TC-AUTH-007 TC-AUTH-008 LOGIN_SUCCESS면 세션을 저장하고 홈(회원)으로 replace 이동해 뒤로 가도 로그인으로 돌아오지 않는다', async () => {
    const { h, path, router } = await openLogin();
    route(h, 'auth/social-login__login-success.json');
    fireEvent.click(kakao());
    expect(await screen.findByTestId('home.root')).toHaveAttribute('data-mode', 'member');
    expect(path()).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
    expect((await h.store.read()).userId).toBe(ME);
    expect((await h.store.read()).isGuest).toBe(false);
  });

  it('TC-AUTH-010 TC-AUTH-009 SIGN_UP_REQUIRED면 토큰을 저장하지 않고 약관 경로(/signup/terms)로 이동하며 idToken·rawNonce를 메모리에 보관한다', async () => {
    const { h, path } = await openLogin();
    route(h, 'auth/social-login__sign-up-required.json');
    fireEvent.click(kakao());
    await waitFor(() => expect(path()).toBe('/signup/terms'));
    expect(await h.store.read()).toEqual(EMPTY_SESSION);
    expect(h.container.signupDraft.get()).toEqual({ idToken: 'fake-id-token-1', rawNonce: 'fake-raw-nonce-1' });
  });

  it('TC-AUTH-027 카카오 버튼을 3회 연타해도 SDK 호출 1회, 요청 1회이고 진행 중에는 두 버튼이 비활성이며 login.loading이 보인다', async () => {
    const { h } = await openLogin();
    h.social.script(pending);
    route(h, 'auth/social-login__login-success.json');
    fireEvent.click(kakao());
    fireEvent.click(kakao());
    fireEvent.click(kakao());
    expect(await screen.findByTestId('login.loading')).toBeInTheDocument();
    expect(kakao()).toBeDisabled();
    expect(guest()).toBeDisabled();
    await act(async () => h.social.resolvePending());
    await screen.findByTestId('home.root');
    expect(h.social.calls).toBe(1);
    expect(h.ff.callsTo('POST /auth/social-login')).toHaveLength(1);
  });

  it('TC-AUTH-013 사용자가 취소하면 오류 알림 없이 로그인 화면에 머물고 버튼이 다시 눌린다', async () => {
    const { h, path } = await openLogin();
    h.social.script(failWith(new SocialLoginCancelledError('cancelled')));
    fireEvent.click(kakao());
    await waitFor(() => expect(kakao()).toBeEnabled());
    expect(screen.queryByTestId('login.error-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login.loading')).not.toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-AUTH-018 설정 오류는 "카카오 로그인 설정을 확인해 주세요." 알림이고 서버 호출은 0건이다', async () => {
    const { h } = await openLogin();
    h.social.script(failWith(new SocialLoginConfigError('no id token')));
    fireEvent.click(kakao());
    expect(await within(await screen.findByTestId('login.error-dialog')).findByText(t('auth.login.error.config'))).toBeInTheDocument();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-AUTH-019 SDK 일반 실패는 "카카오 로그인에 실패했어요. 다시 시도해 주세요." 알림이다', async () => {
    const { h } = await openLogin();
    h.social.script(failWith(new SocialLoginFailedError('sdk')));
    fireEvent.click(kakao());
    expect(await screen.findByTestId('login.error-dialog')).toHaveTextContent('카카오 로그인에 실패했어요. 다시 시도해 주세요.');
  });

  it('TC-AUTH-020 401이면 "카카오 계정을 확인할 수 없어요. 다시 시도해 주세요." 알림이고 확인을 누르면 사라지며 버튼이 다시 활성화된다', async () => {
    const { h } = await openLogin();
    route(h, 'auth/social-login__unauthorized.json');
    fireEvent.click(kakao());
    const dialog = await screen.findByTestId('login.error-dialog');
    expect(dialog).toHaveTextContent('카카오 계정을 확인할 수 없어요. 다시 시도해 주세요.');
    expect(h.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    fireEvent.click(screen.getByTestId('login.error-dialog-confirm-button'));
    await waitFor(() => expect(screen.queryByTestId('login.error-dialog')).not.toBeInTheDocument());
    expect(kakao()).toBeEnabled();
    expect(guest()).toBeEnabled();
  });

  it('TC-AUTH-021 403 차단 계정은 서버 message를 그대로 보여 주고 자동 재시도하지 않는다', async () => {
    const { h } = await openLogin();
    route(h, 'auth/social-login__forbidden-banned.json');
    fireEvent.click(kakao());
    expect(await screen.findByTestId('login.error-dialog')).toHaveTextContent('차단된 소셜 계정입니다.');
    expect(h.ff.callsTo('POST /auth/social-login')).toHaveLength(1);
  });

  it('TC-AUTH-025 연결 실패는 "네트워크 연결을 확인해 주세요." 알림이다', async () => {
    const { h } = await openLogin();
    h.ff.route('POST /auth/social-login', networkFailure);
    fireEvent.click(kakao());
    expect(await screen.findByTestId('login.error-dialog')).toHaveTextContent('네트워크 연결을 확인해 주세요.');
  });

  it('TC-AUTH-011 알 수 없는 status는 "로그인 응답을 확인할 수 없어요. 다시 시도해 주세요." 알림이고 세션을 저장하지 않는다', async () => {
    const { h } = await openLogin();
    route(h, 'auth/social-login__unknown-status.json');
    fireEvent.click(kakao());
    expect(await screen.findByTestId('login.error-dialog')).toHaveTextContent('로그인 응답을 확인할 수 없어요. 다시 시도해 주세요.');
    expect(h.store.writes).toHaveLength(0);
  });

  it('TC-AUTH-029 같은 오류가 연달아 두 번 나와도 알림이 다시 표시된다', async () => {
    const { h } = await openLogin();
    route(h, 'auth/social-login__internal-error.json');
    fireEvent.click(kakao());
    await screen.findByTestId('login.error-dialog');
    fireEvent.click(screen.getByTestId('login.error-dialog-confirm-button'));
    await waitFor(() => expect(screen.queryByTestId('login.error-dialog')).not.toBeInTheDocument());
    fireEvent.click(kakao());
    expect(await screen.findByTestId('login.error-dialog')).toHaveTextContent(t('auth.login.error.generic'));
  });

  it('TC-AUTH-028 로그인 성공 후 다시 로그인 화면을 열면 새로 제출할 수 있다', async () => {
    const { h, router } = await openLogin();
    route(h, 'auth/social-login__login-success.json');
    fireEvent.click(kakao());
    await screen.findByTestId('home.root');
    await h.store.clear();
    await act(async () => {
      await router.navigate('/login');
    });
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(kakao()).toBeEnabled();
    fireEvent.click(kakao());
    await screen.findByTestId('home.root');
    expect(h.ff.callsTo('POST /auth/social-login')).toHaveLength(2);
  });

  it('TC-AUTH-031 요청 중 화면을 벗어나면 세션을 저장하지 않고 오류도 보이지 않는다', async () => {
    const { h, router, unmount } = await openLogin();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    h.ff.route('POST /auth/social-login', () => gate.then(() => loadFixture('auth/social-login__login-success.json').toResponse()));
    fireEvent.click(kakao());
    await waitFor(() => expect(h.ff.callsTo('POST /auth/social-login')).toHaveLength(1));
    await act(async () => {
      await router.navigate('/signup/terms');
    });
    unmount();
    release();
    await act(async () => {
      await h.clock.advance(1);
    });
    expect(h.store.writes).toHaveLength(0);
    expect(h.container.toast.state.toast).toBeNull();
  });
});

describe('게스트 둘러보기', () => {
  it('TC-AUTH-032 서버 호출 없이 게스트 플래그를 저장하고 홈(게스트)으로 replace 이동한다', async () => {
    const { h, path, router } = await openLogin();
    fireEvent.click(guest());
    expect(await screen.findByTestId('home.root')).toHaveAttribute('data-mode', 'guest');
    expect(path()).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(h.ff.calls).toHaveLength(0);
    expect(h.social.calls).toBe(0);
    expect(await h.store.read()).toEqual({ userId: null, tokens: null, isGuest: true });
  });

  it('REQ-AUTH-020 게스트 플래그 저장이 실패하면 로그인 화면에 머물고 안내 알림을 보인다', async () => {
    const { h, path } = await openLogin();
    vi.spyOn(h.store, 'write').mockRejectedValueOnce(new Error('idb write failed'));
    fireEvent.click(guest());
    expect(await screen.findByTestId('login.error-dialog')).toHaveTextContent(t('auth.login.error.guest'));
    expect(path()).toBe('/login');
  });
});

describe('카카오 리다이렉트 콜백 라우트', () => {
  const CALLBACK = '/login/kakao-callback?code=c&state=s';

  it('복귀 URL로 credential을 복원해 social-login을 이어 가고 홈으로 replace 이동한다', async () => {
    const resume = vi.fn((_url: string) => Promise.resolve({ idToken: 'resumed-id-token', rawNonce: 'resumed-raw-nonce' }));
    const h = makeHarness({ resume });
    route(h, 'auth/social-login__login-success.json');
    const { path, router } = renderApp(h.container, CALLBACK);
    expect(await screen.findByTestId('home.root')).toBeInTheDocument();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(resume.mock.calls[0]![0]).toContain('/login/kakao-callback?code=c&state=s');
    expect(JSON.parse(h.ff.callsTo('POST /auth/social-login')[0]!.body as string)).toEqual({ provider: 'KAKAO', idToken: 'resumed-id-token', rawNonce: 'resumed-raw-nonce' });
    expect(path()).toBe('/home');
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('TC-AUTH-010 복귀 후 SIGN_UP_REQUIRED면 약관 경로로 간다', async () => {
    const h = makeHarness({ resume: () => Promise.resolve({ idToken: 'resumed-id-token', rawNonce: 'resumed-raw-nonce' }) });
    route(h, 'auth/social-login__sign-up-required.json');
    const { path } = renderApp(h.container, CALLBACK);
    await waitFor(() => expect(path()).toBe('/signup/terms'));
    expect(h.container.signupDraft.get()).toEqual({ idToken: 'resumed-id-token', rawNonce: 'resumed-raw-nonce' });
  });

  it('TC-AUTH-013 복귀 처리에서 사용자 취소면 조용히 로그인 화면으로 돌아간다', async () => {
    const h = makeHarness({ resume: () => Promise.reject(new SocialLoginCancelledError('cancelled')) });
    const { path } = renderApp(h.container, CALLBACK);
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(path()).toBe('/login');
    expect(h.container.toast.state.toast).toBeNull();
    expect(h.ff.calls).toHaveLength(0);
  });

  it('TC-AUTH-019 복귀 처리 실패(state 불일치 등)는 로그인 화면으로 돌아가고 "카카오 로그인에 실패했어요" 토스트를 보인다', async () => {
    const h = makeHarness({ resume: () => Promise.reject(new SocialLoginFailedError('state mismatch')) });
    renderApp(h.container, CALLBACK);
    expect(await screen.findByTestId('login.root')).toBeInTheDocument();
    expect(await screen.findByTestId('toast.message')).toHaveTextContent(t('auth.login.error.kakao-failed'));
    expect(h.ff.calls).toHaveLength(0);
  });

  it('콜백 경로를 새로고침 등으로 두 번 처리하지 않는다(복원 함수 1회 호출)', async () => {
    const resume = vi.fn((_url: string) => Promise.reject(new SocialLoginFailedError('used')));
    const h = makeHarness({ resume });
    renderApp(h.container, CALLBACK);
    await screen.findByTestId('login.root');
    expect(resume).toHaveBeenCalledTimes(1);
  });
});
