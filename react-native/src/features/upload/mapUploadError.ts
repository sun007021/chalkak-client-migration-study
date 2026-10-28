import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  NetworkError,
  ReauthenticationRequiredError,
} from '../../core/http/ApiError';
import { t } from '../../shared/copy';

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
 * 403은 어느 단계든 정지 안내(PUT은 S3 응답이라 errorCode FORBIDDEN인 경우만), 네트워크 오류는 통일 문구(D-20), 그 밖은 단계별 문구(REQ-UPL-056~058).
 * 401 처리는 AuthErrorPolicy와 같은 분기(Reauthentication은 세션이 이미 지워짐, Authentication은 화면이 로그인으로)다.
 */
export function mapUploadError(stage: UploadStage, error: unknown): UploadFailure {
  if (error instanceof CancelledError) return { kind: 'cancelled' };
  if (error instanceof ReauthenticationRequiredError) return { kind: 'session-expired' };
  if (error instanceof AuthenticationRequiredError) return { kind: 'login-required' };
  if (error instanceof NetworkError) return { kind: 'message', message: t('upload.error.network') };
  if (
    error instanceof HttpError &&
    error.status === 403 &&
    (stage !== 'put' || error.errorCode === 'FORBIDDEN')
  ) {
    return { kind: 'message', message: t('upload.gate.banned') };
  }
  switch (stage) {
    case 'put':
      return { kind: 'message', message: t('upload.error.upload') };
    case 'create':
      return { kind: 'message', message: t('upload.error.create') };
    default:
      return { kind: 'message', message: t('upload.error.prepare') };
  }
}
