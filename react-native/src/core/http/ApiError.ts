/** 서버가 내려주는 errorCode 중 클라이언트가 구분하는 값. 알 수 없는 코드는 BUSINESS_ERROR로 정규화한다(D-02). */
export type KnownErrorCode =
  | 'BUSINESS_ERROR'
  | 'UNAUTHORIZED'
  | 'REAUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'SIGNATURE_PROCESSING_PENDING'
  | 'SIGNATURE_REUPLOAD_REQUIRED'
  | 'SIGNATURE_REGISTRATION_REQUIRED';

/** 네트워크 계층이 던지는 모든 오류의 부모. 화면은 `instanceof`로 분기한다. */
export abstract class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** HTTP 4xx/5xx(및 3xx). errorCode는 정규화된 값, 본문에 없으면 null. message는 표시용으로만 쓴다. */
export class HttpError extends ApiError {
  constructor(
    readonly status: number,
    readonly errorCode: KnownErrorCode | null,
    readonly serverMessage: string | null,
    readonly rawErrorCode: string | null = null,
  ) {
    super(`HTTP ${status}${errorCode ? ` ${errorCode}` : ''}`);
  }
}

/** 연결 실패·DNS·TLS·끊김. 사용자 문구는 "네트워크 연결을 확인해 주세요."로 통일(D-20). */
export class NetworkError extends ApiError {}

/** 연결/응답 타임아웃. NetworkError의 하위라서 같은 문구로 보인다. */
export class TimeoutError extends NetworkError {}

/** 200이지만 해석 불가(깨진 JSON, 빈 본문, JSON이 아닌 Content-Type, 필수 필드 누락). */
export class InvalidResponseError extends ApiError {}

/** 호출자가 취소(AbortSignal)했거나 세션이 바뀌어 결과를 버린 경우. 화면에 표시하지 않는다. */
export class CancelledError extends ApiError {}

/** 갱신·재전송 뒤에도 401 UNAUTHORIZED. 세션은 유지하고 화면이 로그인으로 보낸다(REQ-NET-023). */
export class AuthenticationRequiredError extends ApiError {}

/** 401 REAUTHENTICATION_REQUIRED. 세션은 이미 지워졌고 로그인 이벤트가 나갔다. */
export class ReauthenticationRequiredError extends ApiError {}

/** API_BASE_URL 설정 오류(ApiError가 아니라 요청 전에 나는 설정 오류). */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** 오류 응답 본문을 HttpError로 변환한다. 빈 본문·비 JSON·errorCode 없음이면 status만 가진 오류. */
export function parseErrorBody(_status: number, _bodyText: string): HttpError {
  throw new Error('not implemented');
}
