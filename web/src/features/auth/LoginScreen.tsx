import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import type { AppContainer } from '../../app/container';
import { ROUTES } from '../../app/paths';
import { t } from '../../copy/ko';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { LoadingIndicator } from '../../core/ui/StateViews';
import { LoginViewModel } from './LoginViewModel';
import type { LoginOutcome } from './LoginViewModel';

function createLoginViewModel(container: AppContainer): LoginViewModel {
  return new LoginViewModel({
    client: container.socialLogin,
    resume: container.resumeKakaoRedirect,
    authApi: container.authApi,
    store: container.store,
    signupDraft: container.signupDraft,
    userCaches: container.userCaches,
    ids: container.ids,
    logger: container.logger,
  });
}

/** 결과가 이동을 요구하면 그 경로, 아니면 null. */
function pathFor(outcome: LoginOutcome): string | null {
  if (outcome.kind === 'home') return ROUTES.home;
  if (outcome.kind === 'terms') return ROUTES.terms;
  return null;
}

/**
 * 로그인 화면. data-testid: login.root, login.tagline, login.kakao-button, login.guest-button, login.loading(social-login 요청 중에만),
 * login.error-dialog + login.error-dialog-confirm-button(오류가 있을 때만), login.dev-bypass-button(devSessionEnabled일 때만, /dev/session으로 이동).
 * 결과가 home이면 /home, terms이면 /signup/terms로 replace 이동. 마운트마다 새 LoginViewModel, 언마운트에서 dispose.
 */
export function LoginScreen(): ReactNode {
  const container = useContainer();
  const create = useCallback(() => createLoginViewModel(container), [container]);
  const vm = useOwnedViewModel(create);
  return vm ? <LoginView vm={vm} /> : null;
}

function LoginView({ vm }: { vm: LoginViewModel }): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  const state = useViewModel(vm);
  const busy = state.busy !== 'none';
  const go = (outcome: LoginOutcome) => {
    const to = pathFor(outcome);
    if (to) navigate(to, { replace: true });
  };
  return (
    <div data-testid="login.root" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, padding: 16 }}>
      <h1 data-testid="login.tagline" style={{ whiteSpace: 'pre-line' }}>
        {t('auth.login.tagline')}
      </h1>
      <button type="button" data-testid="login.kakao-button" disabled={busy} onClick={() => void vm.loginWithKakao().then(go)}>
        {t('auth.login.kakao')}
      </button>
      <button type="button" data-testid="login.guest-button" disabled={busy} onClick={() => void vm.browseAsGuest().then(go)}>
        {t('auth.login.guest')}
      </button>
      {container.devSessionEnabled && (
        <button type="button" data-testid="login.dev-bypass-button" onClick={() => navigate(ROUTES.devSession)}>
          Dev session
        </button>
      )}
      {state.busy === 'server' && <LoadingIndicator screenId="login" />}
      {state.error && (
        <div key={state.error.id} data-testid="login.error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="login-error-title">
          {/* 제목 "로그인": 전용 문구 키가 없어 settings.guest.login을 쓴다(공용 문구에 키 추가 필요). */}
          <h2 id="login-error-title">{t('settings.guest.login')}</h2>
          <p>{state.error.message}</p>
          <button type="button" data-testid="login.error-dialog-confirm-button" onClick={() => vm.dismissError()}>
            {t('common.confirm')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * '/login/kakao-callback': 마운트 시 한 번만(StrictMode 포함) 현재 URL로 resumeKakaoRedirect를 호출하고 LoginScreen과 같은 방식으로 이동한다.
 * 취소·오류면 /login으로 replace 이동하고, 오류(취소 제외)는 container.toast로 보인다(로그인 화면의 알림 대화상자는 쓰지 않는다).
 */
export function KakaoCallbackScreen(): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  const location = useLocation();
  // 인가 코드·state는 1회용이라 효과가 두 번 돌아도(StrictMode) 복원은 한 번만 한다. 결과는 같은 약속을 기다린다.
  const flight = useRef<Promise<{ vm: LoginViewModel; outcome: LoginOutcome }> | null>(null);
  useEffect(() => {
    flight.current ??= (() => {
      const vm = createLoginViewModel(container);
      const url = new URL(`${location.pathname}${location.search}`, window.location.origin).toString();
      return vm.resumeKakaoRedirect(url).then((outcome) => ({ vm, outcome }));
    })();
    let active = true;
    void flight.current.then(({ vm, outcome }) => {
      if (!active) return;
      const to = pathFor(outcome);
      if (to) {
        navigate(to, { replace: true });
        return;
      }
      if (vm.state.error) container.toast.show(vm.state.error.message);
      navigate(ROUTES.login, { replace: true });
    });
    return () => {
      active = false;
    };
  }, [container, navigate, location.pathname, location.search]);
  return null;
}
