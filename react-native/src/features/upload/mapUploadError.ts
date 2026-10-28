export type UploadStage = 'policy' | 'encode' | 'put' | 'create';

export type UploadFailure =
  | { kind: 'message'; message: string }
  /** 갱신 뒤에도 남은 401 UNAUTHORIZED: 화면이 로그인으로 보낸다. */
  | { kind: 'login-required' }
  /** 401 REAUTHENTICATION_REQUIRED: 세션은 이미 지워졌고 session-expired 이벤트가 로그인으로 보낸다. */
  | { kind: 'session-expired' }
  /** 화면 이탈 등 취소: 오류로 보이지 않는다. */
  | { kind: 'cancelled' };

/**
 * 오류를 errorCode·HTTP 상태·호출 단계로만 분기해 사용자 문구로 바꾼다(D-02). 서버 message로 분기하지 않는다.
 * 403은 어느 단계든 정지 안내, 네트워크 오류는 통일 문구(D-20), 그 밖은 단계별 문구(REQ-UPL-056~058).
 */
export function mapUploadError(stage: UploadStage, error: unknown): UploadFailure {
  void stage;
  void error;
  throw new Error('not implemented');
}
