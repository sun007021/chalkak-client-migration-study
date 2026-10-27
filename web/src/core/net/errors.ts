/** 서버가 정의한 errorCode 중 클라이언트가 분기에 쓰는 것(API §5). 그 밖의 코드는 BUSINESS_ERROR로 취급한다(D-02). */
export const KNOWN_ERROR_CODES = [
  'BUSINESS_ERROR',
  'UNAUTHORIZED',
  'REAUTHENTICATION_REQUIRED',
  'FORBIDDEN',
  'INTERNAL_ERROR',
  'SIGNATURE_PROCESSING_PENDING',
  'SIGNATURE_REUPLOAD_REQUIRED',
  'SIGNATURE_REGISTRATION_REQUIRED',
] as const;
export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

/** 서버가 HTTP 오류로 응답한 경우. message는 표시용이며 어떤 분기에도 쓰지 않는다. */
export class ApiError extends Error {
  readonly name = 'ApiError';
  constructor(
    readonly status: number,
    /** 알 수 없는 코드는 BUSINESS_ERROR로 정규화. 본문에 errorCode가 없으면(HTML 게이트웨이, 빈 본문) null. */
    readonly errorCode: KnownErrorCode | null,
    message: string,
    /** 서버가 보낸 원래 문자열(로그용). 없으면 null. */
    readonly rawErrorCode: string | null = null,
  ) {
    super(message);
  }
}

export type NetworkFailureKind = 'timeout' | 'connection' | 'insecure_redirect';

/** 연결 실패·DNS·TLS·타임아웃. 플랫폼 예외(fetch TypeError 등)를 모두 이것으로 매핑한다(D-20). */
export class NetworkError extends Error {
  readonly name = 'NetworkError';
  constructor(
    readonly kind: NetworkFailureKind,
    readonly cause?: unknown,
  ) {
    super(`network failure: ${kind}`);
  }
}

/** 2xx인데 해석할 수 없는 응답(깨진 JSON, 빈 본문, 잘못된 Content-Type, 필수 필드 누락). */
export class InvalidResponseError extends Error {
  readonly name = 'InvalidResponseError';
  constructor(
    readonly reason: string,
    readonly cause?: unknown,
  ) {
    super(`invalid response: ${reason}`);
  }
}

/** API_BASE_URL 누락/오류 등 설정 오류. 요청을 보내지 않는다(REQ-NET-002). */
export class ConfigError extends Error {
  readonly name = 'ConfigError';
}

/** 요청 취소(AbortController)는 오류가 아니다. 취소는 AbortError DOMException 그대로 전파한다(D-20). */
export function isCancellation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

const isKnownErrorCode = (value: string): value is KnownErrorCode => (KNOWN_ERROR_CODES as readonly string[]).includes(value);

function parseJsonObject(bodyText: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(bodyText);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 오류 응답 본문(JSON, HTML, 빈 문자열 등)과 HTTP 상태로 ApiError를 만든다. 던지지 않는다. */
export function parseErrorResponse(status: number, bodyText: string): ApiError {
  const body = parseJsonObject(bodyText);
  const message = typeof body?.message === 'string' ? body.message : '';
  const raw = body?.errorCode;
  if (typeof raw !== 'string') return new ApiError(status, null, message, null);
  return new ApiError(status, isKnownErrorCode(raw) ? raw : 'BUSINESS_ERROR', message, raw);
}
