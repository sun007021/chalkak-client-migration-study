import type { AuthRepository, PendingSignUp } from '../../data/auth/AuthRepository';
import type { SignUpRepository } from '../../data/auth/SignUpRepository';
import type { SignatureRepository } from '../../data/signature/SignatureRepository';
import { CancelledError, HttpError, NetworkError } from '../../core/http/ApiError';
import type { Sleeper } from '../../core/http/Sleeper';
import { SIGNUP_PENDING_RETRY } from '../../shared/constants';

/** 미리보기의 "시작하기"/"사인 변경하기"가 하는 서버 작업. 모드마다 구현이 다르다. 실패는 throw. */
export interface SignatureSubmitter {
  submit(png: Uint8Array, signal: AbortSignal): Promise<void>;
}

/** presigned PUT 단계의 실패(만료·서명 불일치 등). 네트워크·취소는 그대로 전달하고 나머지를 이것으로 감싼다. */
export class SignatureUploadError extends Error {
  constructor(override readonly cause: unknown) {
    super('signature upload failed');
  }
}

/** SIGNATURE_PROCESSING_PENDING을 최대 횟수만큼 다시 요청했지만 끝나지 않았다. */
export class SignupPendingTimeoutError extends Error {}

/** uploads가 400(이미 가입된 계정)이라 social-login을 다시 불렀지만 로그인되지 않았다(SIGN_UP_REQUIRED). 일반 실패로 보인다. */
export class AlreadyRegisteredUnresolvedError extends Error {}

export type SignUpSubmitterDeps = {
  signUpRepository: SignUpRepository;
  authRepository: AuthRepository;
  pending: PendingSignUp;
  /** PENDING 재요청 사이의 1초 대기. 테스트는 FakeSleeper. */
  sleeper: Sleeper;
};

/**
 * 가입: uploads -> PUT -> social-signup(+PENDING 폴링). 매번 uploads부터 새로 시작한다.
 * uploads가 400이면 같은 idToken·rawNonce로 social-login을 다시 불러 LOGIN_SUCCESS면 성공으로 끝낸다(REQ-ONB-022).
 */
export class SignUpSubmitter implements SignatureSubmitter {
  constructor(private readonly deps: SignUpSubmitterDeps) {}

  async submit(png: Uint8Array, signal: AbortSignal): Promise<void> {
    const { signUpRepository, authRepository, pending, sleeper } = this.deps;
    let ticket;
    try {
      ticket = await signUpRepository.requestUpload(pending, signal);
    } catch (error) {
      // 400은 이미 가입된 소셜 계정이다. 문구가 아니라 호출 API(uploads)로 분기하고 로그인으로 돌려 본다(D-02).
      if (error instanceof HttpError && error.status === 400) {
        const outcome = await authRepository.socialLoginKakao(pending, signal);
        if (outcome.kind === 'logged-in') return;
        throw new AlreadyRegisteredUnresolvedError();
      }
      throw error;
    }
    await wrapUploadFailure(signUpRepository.uploadPng(ticket.uploadUrl, png, signal));

    const { intervalMs, maxAttempts } = SIGNUP_PENDING_RETRY;
    for (let retry = 0; ; retry += 1) {
      try {
        await signUpRepository.confirm(ticket.signupToken, signal);
        return;
      } catch (error) {
        if (!isProcessingPending(error)) throw error;
        if (retry >= maxAttempts) throw new SignupPendingTimeoutError();
        await sleeper.sleep(intervalMs, signal);
      }
    }
  }
}

const isProcessingPending = (error: unknown): boolean =>
  error instanceof HttpError &&
  error.status === 400 &&
  error.errorCode === 'SIGNATURE_PROCESSING_PENDING';

/** 업로드 단계의 실패를 SignatureUploadError로 감싼다. 네트워크·취소는 문구가 다르므로 그대로 둔다. */
function wrapUploadFailure(upload: Promise<void>): Promise<void> {
  return upload.catch((error: unknown) => {
    if (error instanceof NetworkError || error instanceof CancelledError) throw error;
    throw new SignatureUploadError(error);
  });
}

/** 변경: uploads -> PUT -> PUT /users/me/signature. 앞 단계가 실패하면 다음 단계를 부르지 않는다. */
export class SignatureChangeSubmitter implements SignatureSubmitter {
  constructor(private readonly repository: SignatureRepository) {}

  async submit(png: Uint8Array, signal: AbortSignal): Promise<void> {
    const ticket = await this.repository.requestUpload(signal);
    await wrapUploadFailure(this.repository.uploadPng(ticket.uploadUrl, png, signal));
    await this.repository.confirmChange(ticket.uploadId, signal);
  }
}
