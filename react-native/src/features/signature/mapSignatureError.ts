export type SignatureMode = 'onboarding' | 'change';

/** 실패를 사용자에게 어떻게 보일지. 분기는 errorCode·HTTP 상태·단계로만 한다(D-02, message 파싱 금지). */
export type SignatureFailure =
  /** 미리보기 오류 알림. backToDraw면 그리기 화면으로 돌아가 거기서 보인다(획은 유지). */
  | { kind: 'message'; message: string; backToDraw: boolean }
  /** 로그인 화면으로 보내고 토스트로 알린다(401 만료, 가입 403 차단). */
  | { kind: 'login'; message: string }
  /** 토스트만(변경 모드 403 정지 회원). */
  | { kind: 'toast'; message: string }
  /** 화면에 아무것도 보이지 않는다(취소됨). */
  | { kind: 'ignore' };

/** REQ-ONB-016/022~026, REQ-SIGN-024~028 및 두 문서의 오류 표. */
export function mapSignatureError(_error: unknown, _mode: SignatureMode): SignatureFailure {
  throw new Error('not implemented');
}
