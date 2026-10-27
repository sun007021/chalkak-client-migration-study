import type { RefreshedTokens, SessionCredentials } from './SessionStore';

export type TokenResponse = {
  accessToken: string;
  /** 초 */
  expiresIn: number;
  refreshToken: string;
  /** 초 */
  refreshTokenExpiresIn: number;
};

/** 응답의 수명(초)을 받은 시각 now에 더해 절대 만료 시각으로 바꾼다. 수명 값을 코드에 고정하지 않는다. */
export function credentialsFromTokenResponse(
  _userId: string,
  _response: TokenResponse,
  _now: Date,
): SessionCredentials {
  throw new Error('not implemented');
}

export function refreshedTokensFromResponse(_response: TokenResponse, _now: Date): RefreshedTokens {
  throw new Error('not implemented');
}
