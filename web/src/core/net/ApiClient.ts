import type { Decoder } from './decode';
import type { AuthCoordinator } from './AuthCoordinator';
import type { Logger } from './Logger';
import type { QueryValue } from './url';
import type { Clock } from '../time/Clock';

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** /api/v1 뒤의 경로. 예: '/notifications', '/posts/uploads'. */
  path: string;
  query?: Record<string, QueryValue>;
  /** JSON으로 직렬화. 없으면 본문과 Content-Type을 보내지 않는다. */
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClientDeps {
  /** 검증 전 문자열. 잘못되면 생성자가 ConfigError를 던진다(요청은 한 건도 나가지 않는다). */
  baseUrl: string | undefined;
  fetch: typeof fetch;
  clock: Clock;
  auth: AuthCoordinator;
  logger?: Logger;
}

/**
 * 서버 API 호출. 헤더 구성, 오류 파싱, 재시도 정책 선택, 401 갱신 후 1회 재전송, 응답 디코딩을 맡는다.
 * 던지는 것: ApiError, NetworkError, InvalidResponseError, AbortError(취소 그대로).
 */
export class ApiClient {
  constructor(_deps: ApiClientDeps) {}

  /** 본문이 있는 2xx(JSON)를 decode로 해석한다. 204/빈 본문/비 JSON/해석 실패는 InvalidResponseError. */
  request<T>(_request: ApiRequest, _decode: Decoder<T>): Promise<T> {
    throw new Error('not implemented');
  }

  /** 본문이 없는 2xx(204 등). 본문 디코딩을 시도하지 않는다. */
  requestVoid(_request: ApiRequest): Promise<void> {
    throw new Error('not implemented');
  }
}
