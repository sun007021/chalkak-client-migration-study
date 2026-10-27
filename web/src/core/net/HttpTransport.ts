import type { Clock } from '../time/Clock';
import type { Logger } from './Logger';

export interface TransportRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: BodyInit;
  /** 응답(헤더 도착)까지 허용 시간. 초과하면 NetworkError('timeout'). */
  timeoutMs: number;
  /** true일 때만 네트워크 오류·5xx에 0.5s, 1s 백오프로 최대 2회 재시도(D-21). */
  retry: boolean;
  signal?: AbortSignal;
}

export interface TransportResponse {
  status: number;
  headers: Headers;
  /** 본문 전체 텍스트(빈 본문은 ''). */
  text: string;
}

export interface HttpTransportDeps {
  fetch: typeof fetch;
  clock: Clock;
  logger?: Logger;
}

/**
 * fetch 위의 얇은 층. 타임아웃, 재시도·Retry-After, 취소, 플랫폼 예외 → NetworkError 매핑, https→http 리다이렉트 거부를 맡는다.
 * 4xx/5xx(재시도 소진 포함)는 던지지 않고 그대로 돌려준다. 해석은 호출자 몫.
 */
export class HttpTransport {
  constructor(_deps: HttpTransportDeps) {}

  send(_request: TransportRequest): Promise<TransportResponse> {
    throw new Error('not implemented');
  }
}

/** 멱등 요청 판정(D-21): GET/PUT/DELETE/PATCH와 업로드 정책 발급 POST(/posts/uploads, /users/me/signature/uploads). path는 /api/v1 뒤 경로. */
export function isIdempotentRequest(_method: string, _path: string): boolean {
  throw new Error('not implemented');
}

/** Retry-After 값을 대기 ms로. 숫자 초 또는 HTTP 날짜. 음수·비숫자·과거 날짜는 null(무시). 상한(RETRY_AFTER_MAX_SECONDS) 초과는 'too_long'. */
export function parseRetryAfter(_value: string | null, _nowMs: number): number | 'too_long' | null {
  throw new Error('not implemented');
}
