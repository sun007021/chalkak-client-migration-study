/**
 * 미리보기의 확정 버튼이 부르는 서버 흐름. 가입(SignupService)과 사인 변경(ChangeSignatureService)이 각각 구현한다.
 * 던지지 않고 결과로 돌려준다(취소·세션 변경도 cancelled).
 */
export interface SignatureSubmitter {
  submit(png: Blob, signal: AbortSignal): Promise<SubmitOutcome>;
}

export type SignatureFailureKind =
  /** 연결 실패·타임아웃 → sign.error.network */
  | 'network'
  /** 그 밖(5xx, 업로드 PUT 오류, 해석 불가 응답) → 모드별 generic */
  | 'generic'
  /** 401, 가입 컨텍스트 없음 → sign.error.expired + 로그인 */
  | 'expired'
  /** 403. 가입은 서버 message, 변경은 auth.banned.signature(D-08) */
  | 'forbidden'
  /** 400 BUSINESS_ERROR(사용할 수 없는 사인 등, D-02: message로 구분하지 않는다) → sign.error.invalid + 그리기로 */
  | 'invalid'
  /** 가입 404, 변경 400 SIGNATURE_REUPLOAD_REQUIRED → onb.signup.error.reupload */
  | 'reupload'
  /** 변경 PUT 404 → sign.change.error.not-found */
  | 'not_found'
  /** 가입 PENDING 재시도 소진 → onb.signup.error.timeout */
  | 'timeout';

export interface SignatureFailure {
  kind: SignatureFailureKind;
  /** 서버가 준 message. forbidden(가입)에서만 화면에 쓴다. */
  serverMessage?: string;
}

export type SubmitOutcome =
  | { kind: 'succeeded' }
  | { kind: 'failed'; failure: SignatureFailure }
  /** 화면 이탈·계정 전환 등으로 결과를 버린다. 오류 문구 없음. */
  | { kind: 'cancelled' };
