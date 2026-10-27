import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { ANALYTICS_SCREEN_NAMES } from '../constants';
import type { ScreenName } from '../constants';
import { AnalyticsProvider } from '../core/analytics/AnalyticsContext';
import { RouteScreenViewTracker } from '../core/analytics/RouteScreenViewTracker';
import { ToastHost } from '../core/ui/ToastHost';
import { KakaoCallbackScreen, LoginScreen } from '../features/auth/LoginScreen';
import { resolveAuthGate } from '../features/boot/authGate';
import type { AuthGateDecision } from '../features/boot/authGate';
import { BootScreen, SplashView } from '../features/boot/BootScreen';
import { ContainerProvider } from './AppContext';
import type { AppContainer } from './container';
import { DEV_SESSION_PATH } from './devSession';
import { ROUTES } from './paths';

export { ROUTES };

const PATH_SCREEN_NAMES: Readonly<Record<string, ScreenName>> = {
  [ROUTES.login]: 'login',
  [ROUTES.terms]: 'terms',
  [ROUTES.home]: 'home',
};

/** pathname → 분석 screen_name. '/login' → 'login', '/signup/terms' → 'terms', '/home' → 'home', 그 밖(부팅 '/', 콜백, 개발 화면)은 null. */
export function screenNameForPath(pathname: string): ScreenName | null {
  const name = PATH_SCREEN_NAMES[pathname];
  return name && (ANALYTICS_SCREEN_NAMES as readonly string[]).includes(name) ? name : null;
}

/** 개발 전용 세션 주입 라우트. DEV_SESSION_ENABLED가 false인 빌드에서는 이 분기와 동적 import가 번들에서 빠진다(Q-02). */
function devSessionRoutes(container: AppContainer): RouteObject[] {
  // 정의 파일(devSession.ts)의 상수와 같은 define 값을 여기서 직접 읽어야 롤업이 청크를 만들기 전에 이 분기를 제거한다.
  if (__DEV_SESSION_ENABLED__ && container.devSessionEnabled) {
    return [
      {
        path: DEV_SESSION_PATH,
        lazy: async () => ({ Component: (await import('../features/auth/DevSessionScreen')).DevSessionScreen }),
      },
    ];
  }
  return [];
}

function RootLayout({ container }: { container: AppContainer }): ReactNode {
  const navigate = useNavigate();
  useEffect(
    () => container.sessionEvents.subscribe(() => void navigate(ROUTES.login, { replace: true })),
    [container, navigate],
  );
  return (
    <ContainerProvider container={container}>
      <AnalyticsProvider reporter={container.analytics}>
        <RouteScreenViewTracker resolve={screenNameForPath} />
        <main>
          <Outlet />
        </main>
        <ToastHost controller={container.toast} />
      </AnalyticsProvider>
    </ContainerProvider>
  );
}

/**
 * 앱 라우트 정의. 루트 레이아웃이 Provider(컨테이너, 분석, 토스트 호스트), RouteScreenViewTracker, SessionEvents 구독(→ /login으로 replace 이동)을 둔다.
 * '/': BootScreen(스플래시 → 판정에 따라 /login 또는 /home으로 replace). '/login': LoginScreen. '/login/kakao-callback': KakaoCallbackScreen.
 * '/signup/terms': 자리표시(다음 PR). '/home': RequireSession 안의 HomePlaceholder. '/dev/session': container.devSessionEnabled일 때만 존재.
 * 그 밖의 경로는 '/'로 replace.
 */
export function createAppRoutes(container: AppContainer): RouteObject[] {
  return [
    {
      element: <RootLayout container={container} />,
      HydrateFallback: SplashView,
      children: [
        { path: ROUTES.boot, element: <BootScreen /> },
        { path: ROUTES.login, element: <LoginScreen /> },
        { path: ROUTES.kakaoCallback, element: <KakaoCallbackScreen /> },
        { path: ROUTES.terms, element: <TermsPlaceholder /> },
        { path: ROUTES.home, element: <RequireSession container={container}>{(mode) => <HomePlaceholder mode={mode} />}</RequireSession> },
        ...devSessionRoutes(container),
        { path: '*', element: <Navigate to={ROUTES.boot} replace /> },
      ],
    },
  ];
}

/** 약관(가입) 화면 자리. 다음 PR(ONB)이 채운다. */
function TermsPlaceholder(): ReactNode {
  return <div />;
}

/** 세션이 없으면(판정 login) /login으로 replace, 있으면 children. 읽는 동안은 스플래시 화면. */
export function RequireSession({ container, children }: { container: AppContainer; children: (mode: 'member' | 'guest') => ReactNode }): ReactNode {
  const { store, clock, logger } = container;
  const [decision, setDecision] = useState<AuthGateDecision | null>(null);
  useEffect(() => {
    let active = true;
    void resolveAuthGate({ store, clock, logger }).then((next) => {
      if (active) setDecision(next);
    });
    return () => {
      active = false;
    };
  }, [store, clock, logger]);
  if (!decision) return <SplashView />;
  if (decision.destination === 'login') return <Navigate to={ROUTES.login} replace />;
  return children(decision.mode);
}

/** 메인(홈 탭) 자리표시. data-testid="home.root", 회원/게스트는 data-mode="member|guest". 탭·게스트 제한은 다음 PR. */
export function HomePlaceholder({ mode }: { mode: 'member' | 'guest' }): ReactNode {
  return <div data-testid="home.root" data-mode={mode} />;
}
