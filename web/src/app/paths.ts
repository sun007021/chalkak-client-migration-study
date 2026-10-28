/** 경로. */
export const ROUTES = {
  boot: '/',
  login: '/login',
  kakaoCallback: '/login/kakao-callback',
  terms: '/signup/terms',
  signupSignature: '/signup/signature',
  signupSignaturePreview: '/signup/signature/preview',
  home: '/home',
  display: '/display',
  record: '/record',
  settings: '/settings',
  /** 설정에서 들어오는 사인 변경 화면(탭 셸 밖, 하단 바 없음). */
  changeSignature: '/settings/signature',
  changeSignaturePreview: '/settings/signature/preview',
} as const;
