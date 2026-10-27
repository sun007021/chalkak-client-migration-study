import type { AuthRepository, PendingSignUp } from '../../data/auth/AuthRepository';
import type { SignUpRepository } from '../../data/auth/SignUpRepository';
import type { SignatureRepository } from '../../data/signature/SignatureRepository';
import type { Sleeper } from '../../core/http/Sleeper';

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

  async submit(_png: Uint8Array, _signal: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}

/** 변경: uploads -> PUT -> PUT /users/me/signature. 앞 단계가 실패하면 다음 단계를 부르지 않는다. */
export class SignatureChangeSubmitter implements SignatureSubmitter {
  constructor(private readonly repository: SignatureRepository) {}

  async submit(_png: Uint8Array, _signal: AbortSignal): Promise<void> {
    throw new Error('not implemented');
  }
}
