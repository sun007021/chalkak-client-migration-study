import type { RefreshedTokens, SessionCredentials } from './SessionStore';

export type TokenResponse = {
  accessToken: string;
  /** 초 */
  expiresIn: number;
  refreshToken: string;
  /** 초 */
  refreshTokenExpiresIn: number;
};

const after = (now: Date, seconds: number): Date => new Date(now.getTime() + seconds * 1000);

/** 응답의 수명(초)을 받은 시각 now에 더해 절대 만료 시각으로 바꾼다. 수명 값을 코드에 고정하지 않는다. */
export function credentialsFromTokenResponse(
  userId: string,
  response: TokenResponse,
  now: Date,
): SessionCredentials {
  return { userId, ...refreshedTokensFromResponse(response, now) };
}

export function refreshedTokensFromResponse(response: TokenResponse, now: Date): RefreshedTokens {
  return {
    accessToken: response.accessToken,
    accessTokenExpiresAt: after(now, response.expiresIn),
    refreshToken: response.refreshToken,
    refreshTokenExpiresAt: after(now, response.refreshTokenExpiresIn),
  };
}
