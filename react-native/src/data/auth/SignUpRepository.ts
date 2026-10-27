import type { ApiClient } from '../../core/http/ApiClient';
import { SIGNATURE_CONTENT_TYPE } from '../../shared/constants';
import { decodeIssuedTokens, type AuthRepository, type PendingSignUp } from './AuthRepository';

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
  requestUpload(pending: PendingSignUp, signal?: AbortSignal): Promise<SignUpUploadTicket> {
    return this.deps.api.requestJson(
      {
        method: 'POST',
        path: '/auth/social-signup/signature/uploads',
        body: { provider: 'KAKAO', idToken: pending.idToken, rawNonce: pending.rawNonce },
        signal,
      },
      decodeTicket,
    );
  }

  /** presigned PUT. SIGNATURE_CONTENT_TYPE, 인증 헤더 없음. */
  uploadPng(url: string, png: Uint8Array, signal?: AbortSignal): Promise<void> {
    return this.deps.api.uploadToPresignedUrl({
      url,
      contentType: SIGNATURE_CONTENT_TYPE,
      body: png,
      signal,
    });
  }

  /** POST /auth/social-signup {signupToken}. 200이면 세션을 저장하고 userId를 돌려준다(추가 로그인 호출 없음). */
  async confirm(signupToken: string, signal?: AbortSignal): Promise<{ userId: string }> {
    const issued = await this.deps.api.requestJson(
      { method: 'POST', path: '/auth/social-signup', body: { signupToken }, signal },
      decodeIssuedTokens,
    );
    await this.deps.authRepository.saveIssuedSession(issued.userId, issued);
    return { userId: issued.userId };
  }
}

function decodeTicket(raw: unknown): SignUpUploadTicket {
  const o = asRecord(raw);
  const { uploadId, uploadUrl, expiresInSeconds, signupToken } = o;
  if (
    !isNonEmptyString(uploadId) ||
    !isNonEmptyString(uploadUrl) ||
    typeof expiresInSeconds !== 'number' ||
    !isNonEmptyString(signupToken)
  ) {
    throw new Error('missing upload ticket fields');
  }
  return { uploadId, uploadUrl, expiresInSeconds, signupToken };
}

const asRecord = (raw: unknown): Record<string, unknown> => {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not object');
  return raw as Record<string, unknown>;
};
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';
