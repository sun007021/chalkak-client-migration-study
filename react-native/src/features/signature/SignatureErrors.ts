// 사인 가입·변경 흐름이 던지는 오류. 제출 로직(SignatureSubmitter)과 문구 매핑(mapSignatureError)이 함께 쓴다.

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
