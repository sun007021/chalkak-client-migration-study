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

/**
 * 설정에서 변경 흐름으로 push할 때 넣는 location state. "설정이 바로 아래에 쌓여 있다"는 뜻이라
 * 변경 흐름이 끝나면 뒤로 가기(POP)로 설정에 돌아온다. 설정 화면이 `navigate(ROUTES.changeSignature, { state: SETTINGS_BELOW_STATE })`로 넣는다.
 * 새로고침·딥링크로 첫 항목이 된 경우(`location.key === 'default'`)에는 쓰지 않는다.
 */
export const SETTINGS_BELOW_STATE = { settingsBelow: true } as const;

export function isSettingsBelow(location: { key: string; state: unknown }): boolean {
  return location.key !== 'default' && (location.state as { settingsBelow?: unknown } | null)?.settingsBelow === true;
}
