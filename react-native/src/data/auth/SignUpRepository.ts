import type { ApiClient } from '../../core/http/ApiClient';
import type { AuthRepository, PendingSignUp } from './AuthRepository';

export type SignUpUploadTicket = {
  uploadId: string;
  uploadUrl: string;
  expiresInSeconds: number;
  /** 5분 유효. 메모리에만 둔다. */
  signupToken: string;
};

export type SignUpRepositoryDeps = { api: ApiClient; authRepository: AuthRepository };

/** 가입 API 3단계. 실패는 ApiError 하위 클래스를 그대로 던진다. POST는 자동 재시도하지 않는다(D-21). */
export class SignUpRepository {
  constructor(private readonly deps: SignUpRepositoryDeps) {}

  /** POST /auth/social-signup/signature/uploads {provider:"KAKAO", idToken, rawNonce}. 인증 헤더 없음. */
  async requestUpload(_pending: PendingSignUp, _signal?: AbortSignal): Promise<SignUpUploadTicket> {
    throw new Error('not implemented');
  }

  /** presigned PUT. SIGNATURE_CONTENT_TYPE, 인증 헤더 없음. */
  async uploadPng(_url: string, _png: Uint8Array, _signal?: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }

  /** POST /auth/social-signup {signupToken}. 200이면 세션을 저장하고 userId를 돌려준다(추가 로그인 호출 없음). */
  async confirm(_signupToken: string, _signal?: AbortSignal): Promise<{ userId: string }> {
    throw new Error('not implemented');
  }
}
