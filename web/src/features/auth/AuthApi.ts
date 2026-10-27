import type { AuthTokens } from '../../core/auth/SessionStore';
import type { ApiClient } from '../../core/net/ApiClient';
import type { Clock } from '../../core/time/Clock';
import type { KakaoCredential } from './SocialLoginClient';

export type SocialLoginResult =
  | { kind: 'login_success'; userId: string; tokens: AuthTokens }
  /** 토큰 필드가 없어도 오류가 아니다(REQ-AUTH-012). */
  | { kind: 'sign_up_required' };

/**
 * /auth/social-login, /auth/logout, DELETE /users/me.
 * 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, AbortError). 알 수 없는 status·필수 필드 누락은 InvalidResponseError.
 */
export class AuthApi {
  constructor(_deps: { api: ApiClient; clock: Clock }) {}
  /** POST /auth/social-login {provider:'KAKAO', idToken, rawNonce}. 만료 시각은 clock.nowMs() + 응답 초 × 1000. */
  socialLogin(_credential: KakaoCredential, _signal?: AbortSignal): Promise<SocialLoginResult> {
    throw new Error('not implemented');
  }
  /** POST /auth/logout {refreshToken}. 204. */
  logout(_refreshToken: string): Promise<void> {
    throw new Error('not implemented');
  }
  /** DELETE /users/me, 본문 없음. 204. */
  deleteAccount(_signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
