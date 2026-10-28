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
  /** 알림함(홈 벨). 화면은 알림 PR. 지금은 자리표시. */
  notifications: '/notifications',
  /** 게시물 상세(피드) 접두. 실제 경로는 `${ROUTES.feed}/:postId`(feedPath). 화면은 전시·피드 PR. 지금은 자리표시. */
  feed: '/feed',
} as const;

/** 전시 탭을 해당 날짜의 인기순으로: `/display?date=2026-10-26&sort=popular`. */
export function displayPath(date: string, sort: 'popular' | 'recent'): string {
  return `${ROUTES.display}?${new URLSearchParams({ date, sort }).toString()}`;
}

/** 기록 탭. 날짜가 있으면 `/record?date=2026-10-26`, null이면 `/record`. */
export function recordPath(date: string | null): string {
  return date === null ? ROUTES.record : `${ROUTES.record}?${new URLSearchParams({ date }).toString()}`;
}

/** 게시물 상세: `/feed/{postId}`(postId는 소문자 UUID 그대로). */
export function feedPath(postId: string): string {
  return `${ROUTES.feed}/${encodeURIComponent(postId)}`;
}

/**
 * 설정에서 변경 흐름으로 push할 때 넣는 location state. "설정이 바로 아래에 쌓여 있다"는 뜻이라
 * 변경 흐름이 끝나면 뒤로 가기(POP)로 설정에 돌아온다. 설정 화면이 `navigate(ROUTES.changeSignature, { state: SETTINGS_BELOW_STATE })`로 넣는다.
 * 새로고침·딥링크로 첫 항목이 된 경우(`location.key === 'default'`)에는 쓰지 않는다.
 */
export const SETTINGS_BELOW_STATE = { settingsBelow: true } as const;

export function isSettingsBelow(location: { key: string; state: unknown }): boolean {
  return location.key !== 'default' && (location.state as { settingsBelow?: unknown } | null)?.settingsBelow === true;
}
