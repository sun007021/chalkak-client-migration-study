/** 경로. 약관(가입) 화면 자체는 다음 PR이 이 경로를 채운다. */
export const ROUTES = {
  boot: '/',
  login: '/login',
  kakaoCallback: '/login/kakao-callback',
  terms: '/signup/terms',
  home: '/home',
  devSession: '/dev/session',
} as const;
