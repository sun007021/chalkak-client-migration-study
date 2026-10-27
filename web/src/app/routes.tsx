import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import type { ScreenName } from '../constants';
import type { AppContainer } from './container';

/** 경로. 약관(가입) 화면 자체는 다음 PR이 이 경로를 채운다. */
export const ROUTES = {
  boot: '/',
  login: '/login',
  kakaoCallback: '/login/kakao-callback',
  terms: '/signup/terms',
  home: '/home',
  devSession: '/dev/session',
} as const;

/** pathname → 분석 screen_name. '/login' → 'login', '/signup/terms' → 'terms', '/home' → 'home', 그 밖(부팅 '/', 콜백, 개발 화면)은 null. */
export function screenNameForPath(_pathname: string): ScreenName | null {
  throw new Error('not implemented');
}

/**
 * 앱 라우트 정의. 루트 레이아웃이 Provider(컨테이너, 분석, 토스트 호스트), RouteScreenViewTracker, SessionEvents 구독(→ /login으로 replace 이동)을 둔다.
 * '/': BootScreen(스플래시 → 판정에 따라 /login 또는 /home으로 replace). '/login': LoginScreen. '/login/kakao-callback': KakaoCallbackScreen.
 * '/signup/terms': 자리표시(다음 PR). '/home': RequireSession 안의 HomePlaceholder. '/dev/session': container.devSessionEnabled일 때만 존재.
 * 그 밖의 경로는 '/'로 replace.
 */
export function createAppRoutes(_container: AppContainer): RouteObject[] {
  throw new Error('not implemented');
}

/** 세션이 없으면(판정 login) /login으로 replace, 있으면 children. 읽는 동안은 스플래시 화면. */
export function RequireSession(_props: { container: AppContainer; children: (mode: 'member' | 'guest') => ReactNode }): ReactNode {
  throw new Error('not implemented');
}

/** 메인(홈 탭) 자리표시. data-testid="home.root", 회원/게스트는 data-mode="member|guest". 탭·게스트 제한은 다음 PR. */
export function HomePlaceholder(_props: { mode: 'member' | 'guest' }): ReactNode {
  throw new Error('not implemented');
}
