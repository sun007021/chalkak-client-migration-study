import type { ReactNode } from 'react';

/**
 * 로그인 화면. data-testid: login.root, login.tagline, login.kakao-button, login.guest-button, login.loading(진행 중에만),
 * login.error-dialog + login.error-dialog-confirm-button(오류가 있을 때만), login.dev-bypass-button(devSessionEnabled일 때만, /dev/session으로 이동).
 * 결과가 home이면 /home, terms이면 /signup/terms로 replace 이동. 마운트마다 새 LoginViewModel, 언마운트에서 dispose.
 */
export function LoginScreen(): ReactNode {
  throw new Error('not implemented');
}

/**
 * '/login/kakao-callback': 마운트 시 한 번만(StrictMode 포함) 현재 URL로 resumeKakaoRedirect를 호출하고 LoginScreen과 같은 방식으로 이동한다.
 * 취소·오류면 /login으로 replace 이동하고, 오류(취소 제외)는 container.toast로 보인다(로그인 화면의 알림 대화상자는 쓰지 않는다).
 */
export function KakaoCallbackScreen(): ReactNode {
  throw new Error('not implemented');
}
