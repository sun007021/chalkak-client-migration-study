import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useContainer } from '../../app/AppContext';
import { DEV_SESSION_ENABLED, DEV_SESSION_PATH } from '../../app/devSession';
import { ROUTES } from '../../app/paths';
import { t } from '../../copy/ko';
import { useOwnedViewModel } from '../../core/state/useOwnedViewModel';
import { useViewModel } from '../../core/state/useViewModel';
import { AlertDialog } from '../../core/ui/AlertDialog';
import { LoadingIndicator } from '../../core/ui/StateViews';
import { usePageRestore } from '../../core/ui/usePageRestore';
import { SplashView } from '../boot/BootScreen';
import type { LoginOutcome, LoginViewModel } from './LoginViewModel';

/** 결과가 이동을 요구하면 그 경로, 아니면 null. */
function pathFor(outcome: LoginOutcome): string | null {
  if (outcome.kind === 'home') return ROUTES.home;
  if (outcome.kind === 'terms') return ROUTES.terms;
  return null;
}

/**
 * 로그인 화면. data-testid: login.root, login.tagline, login.kakao-button, login.guest-button, login.loading(social-login 요청 중에만),
 * login.error-dialog + login.error-dialog-confirm-button(오류가 있을 때만), login.dev-bypass-button(개발 플래그가 켜진 빌드에서만, /dev/session으로 이동).
 * 결과가 home이면 /home, terms이면 /signup/terms로 replace 이동. 마운트마다 새 LoginViewModel, 언마운트에서 dispose.
 */
export function LoginScreen(): ReactNode {
  const container = useContainer();
  const [checked, setChecked] = useState(false);
  const create = useCallback(() => (checked ? container.createLoginViewModel() : null), [container, checked]);
  const vm = useOwnedViewModel(create);
  // 로그인 화면에 들어오면 가입 중이던 idToken·rawNonce를 폐기한다(가입 흐름을 벗어난 것). 이미 회원 세션이 있으면(가입 완료 뒤 뒤로 가기 등) 홈으로 보낸다.
  const navigate = useNavigate();
  useEffect(() => {
    container.signupDraft.clear();
    let active = true;
    const proceed = (member: boolean) => {
      if (!active) return;
      if (member) navigate(ROUTES.home, { replace: true });
      else setChecked(true);
    };
    void container.store.read().then(
      (session) => proceed(session.tokens !== null && !session.isGuest),
      () => proceed(false),
    );
    return () => {
      active = false;
    };
  }, [container, navigate]);
  return vm ? <LoginView vm={vm} /> : null;
}

function LoginView({ vm }: { vm: LoginViewModel }): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  const state = useViewModel(vm);
  const busy = state.busy !== 'none';
  // 카카오로 리다이렉트한 뒤 뒤로 가기로 bfcache에서 복원되면 진행 중 상태가 그대로 남아 버튼이 잠긴다.
  usePageRestore(useCallback(() => vm.reset(), [vm]));
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
      {DEV_SESSION_ENABLED && container.devSessionEnabled && (
        // 개발 전용: 배포 빌드에는 이 버튼이 없다.
        <button type="button" data-testid="login.dev-bypass-button" onClick={() => navigate(DEV_SESSION_PATH)}>
          Dev session
        </button>
      )}
      {state.busy === 'server' && <LoadingIndicator screenId="login" />}
      {state.error && <AlertDialog key={state.error.id} testId="login.error-dialog" message={state.error.message} confirmLabel={t('common.confirm')} onConfirm={() => vm.dismissError()} />}
    </div>
  );
}

/**
 * '/login/kakao-callback': 마운트 시 한 번만(StrictMode 포함) 현재 URL로 resumeKakaoRedirect를 호출하고 LoginScreen과 같은 방식으로 이동한다.
 * 인가 코드·state는 읽자마자 주소에서 지운다(replace). 진행 중에는 스플래시를 보인다.
 * 취소·오류면 /login으로 replace 이동하고, 오류(취소 제외)는 container.toast로 보인다(로그인 화면의 알림 대화상자는 쓰지 않는다).
 * 보관된 시도가 없으면(새로고침·뒤로 가기·재진입) 토스트 없이 세션이 있으면 /home, 없으면 /login.
 */
export function KakaoCallbackScreen(): ReactNode {
  const container = useContainer();
  const navigate = useNavigate();
  const location = useLocation();
  // 처음 렌더의 URL(코드·state 포함)을 메모리에 잡아 두고, 주소에서는 바로 지운다.
  const [callbackUrl] = useState(() => new URL(`${location.pathname}${location.search}`, window.location.origin).toString());
  const { pathname, search } = location;
  useEffect(() => {
    if (search !== '') navigate(pathname, { replace: true });
  }, [navigate, pathname, search]);
  const create = useCallback(() => container.createLoginViewModel(), [container]);
  const vm = useOwnedViewModel(create);
  return vm ? <KakaoCallbackRun vm={vm} callbackUrl={callbackUrl} /> : <SplashView />;
}

function KakaoCallbackRun({ vm, callbackUrl }: { vm: LoginViewModel; callbackUrl: string }): ReactNode {
  const { toast } = useContainer();
  const navigate = useNavigate();
  // 인가 코드는 1회용이라 이 VM으로 복원은 한 번만 한다(StrictMode가 효과를 두 번 돌려도 같은 약속을 기다린다).
  const flight = useRef<Promise<LoginOutcome> | null>(null);
  useEffect(() => {
    flight.current ??= vm.resumeKakaoRedirect(callbackUrl);
    let active = true;
    void flight.current.then((outcome) => {
      if (!active) return;
      const to = pathFor(outcome);
      if (to) {
        navigate(to, { replace: true });
      } else if (outcome.kind === 'no_pending' && outcome.hasSession) {
        navigate(ROUTES.home, { replace: true });
      } else {
        if (vm.state.error) toast.show(vm.state.error.message);
        navigate(ROUTES.login, { replace: true });
      }
    });
    return () => {
      active = false;
    };
  }, [vm, callbackUrl, navigate, toast]);
  return <SplashView />;
}
