import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useNavigate } from 'react-router';
import type { RouteObject } from 'react-router';
import { ANALYTICS_SCREEN_NAMES } from '../constants';
import type { ScreenName } from '../constants';
import { AnalyticsProvider } from '../core/analytics/AnalyticsContext';
import { RouteScreenViewTracker } from '../core/analytics/RouteScreenViewTracker';
import { bindToastVisibility } from '../core/ui/bindToastVisibility';
import { ToastHost } from '../core/ui/ToastHost';
import { KakaoCallbackScreen, LoginScreen } from '../features/auth/LoginScreen';
import { resolveAuthGate } from '../features/boot/authGate';
import type { AuthGateDecision } from '../features/boot/authGate';
import { BootScreen, SplashView } from '../features/boot/BootScreen';
import { DisplayScreen } from '../features/display/DisplayScreen';
import { FeedScreen } from '../features/feed/FeedScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { TermsScreen } from '../features/onboarding/TermsScreen';
import { UploadEntryLoading } from '../features/upload/UploadEntryLoading';
import { UploadScreen } from '../features/upload/UploadScreen';
import { UploadSuccessScreen } from '../features/upload/UploadSuccessScreen';
import { SignatureDrawScreen } from '../features/signature/SignatureDrawScreen';
import { SignaturePreviewScreen } from '../features/signature/SignaturePreviewScreen';
import { MemberOnly } from '../features/shell/MemberOnly';
import { BottomBarSlotContext, MainShell, TabGate, TabPlaceholder } from '../features/shell/MainShell';
import type { TabRouteHandle } from '../features/shell/MainShell';
import { ContainerProvider } from './AppContext';
import type { AppContainer } from './container';
import { DEV_SESSION_PATH } from './devSession';
import { ROUTES } from './paths';

export { ROUTES };

/** 전역 경로 추적이 보내는 화면. 탭 4개는 게이트를 통과해 그려진 탭 화면이 useScreenView로 보낸다(차단된 URL 진입은 0건). */
const PATH_SCREEN_NAMES: Readonly<Record<string, ScreenName>> = {
  [ROUTES.login]: 'login',
  [ROUTES.terms]: 'terms',
};

/** pathname → 분석 screen_name(비탭 화면만). '/login' → 'login', '/signup/terms' → 'terms', 그 밖(부팅 '/', 콜백, 탭 경로, 개발 화면)은 null. */
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

const homeHandle: TabRouteHandle = { tab: 'home' };
const displayHandle: TabRouteHandle = { tab: 'display' };
const recordHandle: TabRouteHandle = { tab: 'record' };
const settingsHandle: TabRouteHandle = { tab: 'settings' };

function RootLayout({ container }: { container: AppContainer }): ReactNode {
  const navigate = useNavigate();
  const [bottomBarSlot, setBottomBarSlot] = useState<HTMLElement | null>(null);
  useEffect(
    // 다른 탭이 계정을 바꾸면 부팅 경로에서 인증 게이트를 다시 판정하고, 그 밖에는 로그인으로 보낸다.
    () => container.sessionEvents.subscribe((reason) => void navigate(reason === 'changed' ? ROUTES.boot : ROUTES.login, { replace: true })),
    [container, navigate],
  );
  // 다른 탭의 로그아웃·계정 전환(REQ-NAV-022)과 문서 가시성에 따른 토스트(D-20). 정리 함수로 구독이 하나만 남는다(StrictMode 포함).
  useEffect(() => container.crossTabSync.start(), [container]);
  useEffect(() => bindToastVisibility(container.toast, document), [container]);
  return (
    <ContainerProvider container={container}>
      <AnalyticsProvider reporter={container.analytics}>
        <RouteScreenViewTracker resolve={screenNameForPath} />
        <BottomBarSlotContext.Provider value={bottomBarSlot}>
          <main>
            <Outlet />
          </main>
          <div ref={setBottomBarSlot} />
          <UploadEntryLoading />
          <ToastHost controller={container.toast} />
        </BottomBarSlotContext.Provider>
      </AnalyticsProvider>
    </ContainerProvider>
  );
}

/**
 * 앱 라우트 정의. 루트 레이아웃이 Provider(컨테이너, 분석, 토스트 호스트), RouteScreenViewTracker, SessionEvents 구독(→ /login으로 replace 이동)을 둔다.
 * '/': BootScreen(스플래시 → 판정에 따라 /login 또는 /home으로 replace). '/login': LoginScreen. '/login/kakao-callback': KakaoCallbackScreen.
 * '/signup/terms', '/signup/signature', '/signup/signature/preview': 가입 흐름. '/settings/signature', '/settings/signature/preview': 회원의 사인 변경(탭 셸 밖). 탭 4개('/home', '/display', '/record', '/settings'): RequireSession 안 MainShell(하단 바) 레이아웃의 자리표시 화면. '/dev/session': container.devSessionEnabled일 때만 존재.
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
        { path: ROUTES.terms, element: <TermsScreen /> },
        { path: ROUTES.signupSignature, element: <SignatureDrawScreen mode="onboarding" /> },
        { path: ROUTES.signupSignaturePreview, element: <SignaturePreviewScreen mode="onboarding" /> },
        {
          // 사인 변경: 회원만, 탭 셸(하단 바) 밖. 게스트는 설정으로 보낸다.
          element: <RequireSession container={container}>{(mode) => (mode === 'guest' ? <Navigate to={ROUTES.settings} replace /> : <Outlet />)}</RequireSession>,
          children: [
            { path: ROUTES.changeSignature, element: <SignatureDrawScreen mode="change" /> },
            { path: ROUTES.changeSignaturePreview, element: <SignaturePreviewScreen mode="change" /> },
          ],
        },
        {
          element: <RequireSession container={container}>{(mode) => <MainShell mode={mode} />}</RequireSession>,
          children: [
            { path: ROUTES.home, handle: homeHandle, element: <HomeScreen /> },
            { path: ROUTES.display, handle: displayHandle, element: <DisplayScreen /> },
            {
              path: ROUTES.record,
              handle: recordHandle,
              element: (
                <TabGate tab="record">
                  <TabPlaceholder tab="record" testId="record.root" />
                </TabGate>
              ),
            },
            { path: ROUTES.settings, handle: settingsHandle, element: <TabPlaceholder tab="settings" testId="settings.root" /> },
          ],
        },
        // 알림함·게시물 상세는 다음 PR의 화면이 대체하는 자리표시(홈 이동 계약 검증용). 탭 셸 밖이라 하단 바가 없고 회원만 들어온다(게스트는 홈으로).
        {
          element: <RequireSession container={container}>{(mode) => <MemberOnly mode={mode} action="notification"><Outlet /></MemberOnly>}</RequireSession>,
          children: [{ path: ROUTES.notifications, element: <div data-testid="notifications.root" /> }],
        },
        {
          element: <RequireSession container={container}>{(mode) => <MemberOnly mode={mode} action="feed"><Outlet /></MemberOnly>}</RequireSession>,
          children: [{ path: `${ROUTES.feed}/:postId`, element: <FeedScreen /> }],
        },
        // 업로드: 회원만, 탭 셸 밖(하단 바 없음). 게스트가 URL로 오면 홈으로 + nav.guest.upload 토스트.
        {
          element: <RequireSession container={container}>{(mode) => <MemberOnly mode={mode} action="upload"><Outlet /></MemberOnly>}</RequireSession>,
          children: [
            { path: ROUTES.upload, element: <UploadScreen /> },
            { path: ROUTES.uploadSuccess, element: <UploadSuccessScreen /> },
          ],
        },
        ...devSessionRoutes(container),
        { path: '*', element: <Navigate to={ROUTES.boot} replace /> },
      ],
    },
  ];
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
