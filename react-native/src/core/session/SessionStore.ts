/** D-17 저장 항목: userId, access+만료, refresh+만료. (게스트 플래그는 SessionState.kind === 'guest') */
export type SessionCredentials = {
  userId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type SessionState =
  { kind: 'none' } | { kind: 'guest' } | { kind: 'authenticated'; credentials: SessionCredentials };

export type RefreshedTokens = Omit<SessionCredentials, 'userId'>;

export interface SessionStore {
  load(): Promise<SessionState>;
  /**
   * load와 같되, 읽기 예외·손상 값 때문에 저장된 세션을 버렸는지 함께 알려준다(`discarded`).
   * 버린 경우 state는 none이다. 사용자가 로그아웃한 none과 구분하려는 용도다.
   */
  loadChecked(): Promise<{ state: SessionState; discarded: boolean }>;
  /** 인증 세션을 저장하고 게스트 플래그를 지운다. 한 번의 쓰기로 원자적이다. */
  saveAuthenticated(credentials: SessionCredentials): Promise<void>;
  /** 인증 자격을 지우고 게스트 플래그를 저장한다. */
  enterGuest(): Promise<void>;
  /**
   * 현재 저장된 refresh token이 expected와 같을 때만 새 토큰으로 교체한다(userId 유지). 교체했으면 true.
   * 로그아웃·계정 전환으로 세션이 바뀌었으면 아무것도 쓰지 않고 false. 동시 호출은 직렬화된다.
   */
  replaceTokensIfCurrent(expectedRefreshToken: string, tokens: RefreshedTokens): Promise<boolean>;
  /** 모든 항목을 지운다(로그아웃, 탈퇴). */
  clear(): Promise<void>;
  /** 현재 refresh token이 expected와 같을 때만 지운다. 지웠으면 true. */
  clearIfCurrent(expectedRefreshToken: string): Promise<boolean>;
}
