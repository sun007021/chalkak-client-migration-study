/** D-17 저장 항목. 토큰 4종(access, access 만료, refresh, refresh 만료) + userId + 게스트 플래그. */
export interface AuthTokens {
  accessToken: string;
  /** epoch ms */
  accessTokenExpiresAt: number;
  refreshToken: string;
  /** epoch ms */
  refreshTokenExpiresAt: number;
}

export interface StoredSession {
  userId: string | null;
  tokens: AuthTokens | null;
  isGuest: boolean;
}

export const EMPTY_SESSION: StoredSession = { userId: null, tokens: null, isGuest: false };

/** 구현(IndexedDB 등)은 다음 PR. 이 PR의 테스트는 FakeSessionStore를 쓴다. */
export interface SessionStore {
  read(): Promise<StoredSession>;
  write(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
  /**
   * 저장된 refresh token이 expectedRefreshToken과 같을 때만 next로 바꾼다(비교-후-쓰기, 원자적). 바꿨으면 true.
   * refresh 도중 로그아웃·계정 전환·다른 탭의 갱신이 끼어들었으면 false이고 아무것도 쓰지 않는다.
   */
  updateIf(expectedRefreshToken: string, next: StoredSession): Promise<boolean>;
  /** 저장된 refresh token이 expectedRefreshToken과 같을 때만 지운다. 지웠으면 true. */
  clearIf(expectedRefreshToken: string): Promise<boolean>;
}
