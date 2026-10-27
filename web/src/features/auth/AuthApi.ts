import type { AuthTokens } from '../../core/auth/SessionStore';
import type { ApiClient } from '../../core/net/ApiClient';
import { d } from '../../core/net/decode';
import type { Decoder } from '../../core/net/decode';
import type { Clock } from '../../core/time/Clock';
import type { KakaoCredential } from './SocialLoginClient';

export type SocialLoginResult =
  | { kind: 'login_success'; userId: string; tokens: AuthTokens }
  /** 토큰 필드가 없어도 오류가 아니다(REQ-AUTH-012). */
  | { kind: 'sign_up_required' };

const decodeStatus = d.object({ status: d.enumOf(['LOGIN_SUCCESS', 'SIGN_UP_REQUIRED'] as const) });
const decodeSuccess = d.object({
  userId: d.string(),
  accessToken: d.string(),
  expiresIn: d.number(),
  refreshToken: d.string(),
  refreshTokenExpiresIn: d.number(),
});

/**
 * /auth/social-login, /auth/logout, DELETE /users/me.
 * 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, AbortError). 알 수 없는 status·필수 필드 누락은 InvalidResponseError.
 */
export class AuthApi {
  constructor(private readonly deps: { api: ApiClient; clock: Clock }) {}

  /** POST /auth/social-login {provider:'KAKAO', idToken, rawNonce}. 만료 시각은 clock.nowMs() + 응답 초 × 1000. */
  socialLogin(credential: KakaoCredential, signal?: AbortSignal): Promise<SocialLoginResult> {
    const decode: Decoder<SocialLoginResult> = (json) => {
      const { status } = decodeStatus(json);
      if (status === 'SIGN_UP_REQUIRED') return { kind: 'sign_up_required' };
      const body = decodeSuccess(json);
      const now = this.deps.clock.nowMs();
      return {
        kind: 'login_success',
        userId: body.userId,
        tokens: {
          accessToken: body.accessToken,
          accessTokenExpiresAt: now + body.expiresIn * 1000,
          refreshToken: body.refreshToken,
          refreshTokenExpiresAt: now + body.refreshTokenExpiresIn * 1000,
        },
      };
    };
    return this.deps.api.request(
      { method: 'POST', path: '/auth/social-login', body: { provider: 'KAKAO', idToken: credential.idToken, rawNonce: credential.rawNonce }, signal },
      decode,
    );
  }

  /** POST /auth/logout {refreshToken}. 204. */
  logout(refreshToken: string): Promise<void> {
    return this.deps.api.requestVoid({ method: 'POST', path: '/auth/logout', body: { refreshToken } });
  }

  /** DELETE /users/me, 본문 없음. 204. */
  deleteAccount(signal?: AbortSignal): Promise<void> {
    return this.deps.api.requestVoid({ method: 'DELETE', path: '/users/me', signal });
  }
}
