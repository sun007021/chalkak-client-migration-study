import type { Clock } from '../time/Clock';
import type { SessionStore } from '../session/SessionStore';
import type { AuthSessionEvents } from './AuthSessionEvents';
import type { HttpMethod, HttpTransport } from './HttpTransport';
import type { NetworkLogger } from './NetworkLogger';
import type { QueryValue } from './UrlBuilder';
import type { Sleeper } from './Sleeper';
import type { TokenRefresher } from './TokenRefresher';

export type ApiRequest = {
  method: HttpMethod;
  /** `/api/v1` 뒤 경로. 예: `/posts`, `/auth/refresh`. */
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  signal?: AbortSignal;
};

export type PresignedPutRequest = {
  url: string;
  contentType: string;
  body: Uint8Array;
  signal?: AbortSignal;
};

export type ApiClientDeps = {
  baseUrl: string;
  transport: HttpTransport;
  sessionStore: SessionStore;
  tokenRefresher: TokenRefresher;
  events: AuthSessionEvents;
  sleeper: Sleeper;
  clock: Clock;
  logger: NetworkLogger;
};

/**
 * 성공은 값으로, 실패는 ApiError 하위 클래스를 throw한다(Result 타입을 쓰지 않는다).
 * 경로·메서드로 인증 수준·재시도 여부가 정해진다(RequestPolicy).
 */
export class ApiClient {
  constructor(private readonly deps: ApiClientDeps) {}

  /** 2xx JSON 본문을 decode로 해석. 빈 본문·JSON 아님·깨짐·decode 예외는 InvalidResponseError. */
  requestJson<T>(_request: ApiRequest, _decode: (raw: unknown) => T): Promise<T> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** 2xx면 성공(204 포함). 본문은 읽지도 해석하지도 않는다. */
  requestVoid(_request: ApiRequest): Promise<void> {
    throw new Error('not implemented');
  }

  /** presigned PUT: 인증·공통 헤더 없이 Content-Type만, 60초 타임아웃. */
  uploadToPresignedUrl(_request: PresignedPutRequest): Promise<void> {
    throw new Error('not implemented');
  }
}
