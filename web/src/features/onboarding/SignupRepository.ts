import type { AuthTokens } from '../../core/auth/SessionStore';
import type { ApiClient } from '../../core/net/ApiClient';
import type { Clock } from '../../core/time/Clock';
import type { KakaoCredential } from '../auth/SocialLoginClient';

export interface SignupUploadTicket {
  uploadId: string;
  uploadUrl: string;
  expiresInSeconds: number;
  /** 5분 유효. PENDING 재시도에 같은 값을 쓴다. */
  signupToken: string;
}

export interface SignupSession {
  userId: string;
  tokens: AuthTokens;
}

/**
 * /auth/social-signup 계열(API §1.1). 던지는 것은 ApiClient와 같다(ApiError, NetworkError, InvalidResponseError, AbortError).
 * /auth/* 라서 Authorization 없이 보내고 401 갱신을 하지 않으며 자동 재시도도 없다(D-21).
 */
export class SignupRepository {
  constructor(_deps: { api: ApiClient; clock: Clock }) {}

  /** POST /auth/social-signup/signature/uploads {provider:'KAKAO', idToken, rawNonce}만. 응답의 uploadId, uploadUrl, expiresInSeconds, signupToken을 읽는다. */
  requestUpload(_credential: KakaoCredential, _signal?: AbortSignal): Promise<SignupUploadTicket> {
    throw new Error('not implemented');
  }

  /** POST /auth/social-signup {signupToken}만. 만료 시각은 clock.nowMs() + 응답 초 × 1000. */
  signUp(_signupToken: string, _signal?: AbortSignal): Promise<SignupSession> {
    throw new Error('not implemented');
  }
}
