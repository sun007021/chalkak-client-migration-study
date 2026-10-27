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
}
