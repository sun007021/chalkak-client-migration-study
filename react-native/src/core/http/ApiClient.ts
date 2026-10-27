import {
  HTTP_CONNECT_TIMEOUT_MS,
  HTTP_RESPONSE_TIMEOUT_MS,
  RETRY_MAX,
  UPLOAD_PUT_TIMEOUT_MS,
} from '../../shared/constants';
import {
  ApiError,
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  ReauthenticationRequiredError,
  parseErrorBody,
} from './ApiError';
import { abortable, throwIfAborted } from './abort';
import { authorizationHeaderFor } from './AuthHeaderPolicy';
import {
  MAX_RETRY_AFTER_MS,
  authLevelFor,
  isRefreshableRequest,
  isRetryable,
} from './RequestPolicy';
import { backoffMs, parseRetryAfterMs } from './RetryAfter';
import { toApiError } from './transportErrors';
import { buildUrl, normalizeBodyUuids, stripQuery } from './UrlBuilder';
import type { Clock } from '../time/Clock';
import type { SessionCredentials, SessionStore } from '../session/SessionStore';
import type { AuthSessionEvents } from './AuthSessionEvents';
import type { HttpMethod, HttpResponse, HttpTransport } from './HttpTransport';
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

type Attempt = {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
  retryable: boolean;
  timeoutMs: { connect: number; response: number };
};

/** 요청을 보낼 때의 세션. 401 처리에서 "그 사이 세션이 바뀌었는지" 판단하는 기준이다. */
type SentSession =
  | { kind: 'other' }
  | { kind: 'authenticated'; userId: string; refreshToken: string; refreshExpired: boolean };

const isJsonContentType = (value: string): boolean =>
  /^\s*application\/([\w.+-]+\+)?json\b/i.test(value);

/**
 * 성공은 값으로, 실패는 ApiError 하위 클래스를 throw한다(Result 타입을 쓰지 않는다).
 * 경로·메서드로 인증 수준·재시도 여부가 정해진다(RequestPolicy).
 * 요청 도중 세션(로그아웃·계정 전환)이 바뀌면 응답을 버리고 CancelledError로 조용히 끝낸다(다른 계정 토큰으로 재전송 금지).
 */
export class ApiClient {
  constructor(private readonly deps: ApiClientDeps) {}

  /** 2xx JSON 본문을 decode로 해석. 빈 본문·JSON 아님·깨짐·decode 예외는 InvalidResponseError. */
  async requestJson<T>(request: ApiRequest, decode: (raw: unknown) => T): Promise<T> {
    const response = await this.execute(request);
    throwIfAborted(request.signal);
    const contentType = response.headers['content-type'];
    if (contentType !== undefined && !isJsonContentType(contentType)) {
      throw new InvalidResponseError('response is not JSON');
    }
    if (response.bodyText.trim() === '') throw new InvalidResponseError('empty response body');
    let raw: unknown;
    try {
      raw = JSON.parse(response.bodyText);
    } catch {
      throw new InvalidResponseError('malformed JSON');
    }
    try {
      return decode(raw);
    } catch {
      throw new InvalidResponseError('unexpected response shape');
    }
  }

  /** 2xx면 성공(204 포함). 본문은 읽지도 해석하지도 않는다. */
  async requestVoid(request: ApiRequest): Promise<void> {
    await this.execute(request);
  }

  /** presigned PUT: 인증·공통 헤더 없이 Content-Type만, 60초 타임아웃. 갱신 없음. */
  async uploadToPresignedUrl(request: PresignedPutRequest): Promise<void> {
    await this.sendWithRetry({
      method: 'PUT',
      url: request.url,
      headers: { 'Content-Type': request.contentType },
      body: request.body,
      signal: request.signal,
      retryable: true,
      timeoutMs: { connect: UPLOAD_PUT_TIMEOUT_MS, response: UPLOAD_PUT_TIMEOUT_MS },
    });
  }

  private async execute(request: ApiRequest): Promise<HttpResponse> {
    const { sessionStore, clock } = this.deps;
    throwIfAborted(request.signal);
    const url = buildUrl(this.deps.baseUrl, request.path, request.query);
    const level = authLevelFor(request.method, request.path);
    const session = await sessionStore.load();
    throwIfAborted(request.signal);

    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: string | undefined;
    if (request.body !== undefined) {
      body = JSON.stringify(normalizeBodyUuids(request.body));
      headers['Content-Type'] = 'application/json';
    }
    const authorization = authorizationHeaderFor({ url, level, session, now: clock.now() });
    if (authorization) headers.Authorization = authorization;

    const attempt: Attempt = {
      method: request.method,
      url,
      headers,
      body,
      signal: request.signal,
      retryable: isRetryable(request.method, request.path),
      timeoutMs: { connect: HTTP_CONNECT_TIMEOUT_MS, response: HTTP_RESPONSE_TIMEOUT_MS },
    };
    try {
      return await this.sendWithRetry(attempt);
    } catch (error) {
      if (
        !(error instanceof HttpError) ||
        error.status !== 401 ||
        !isRefreshableRequest(request.method, request.path)
      ) {
        throw error;
      }
      const sent: SentSession =
        session.kind === 'authenticated'
          ? {
              kind: 'authenticated',
              userId: session.credentials.userId,
              refreshToken: session.credentials.refreshToken,
              refreshExpired:
                session.credentials.refreshTokenExpiresAt.getTime() <= clock.now().getTime(),
            }
          : { kind: 'other' };
      return this.handleUnauthorized(error, sent, attempt);
    }
  }

  /** 401 처리(REQ-NET-018~025). 반환은 재전송 결과, 갱신 대상이 아니면 원래 오류를 그대로 던진다. */
  private async handleUnauthorized(
    error: HttpError,
    sent: SentSession,
    attempt: Attempt,
  ): Promise<HttpResponse> {
    if (sent.kind !== 'authenticated') throw error;
    const code = error.errorCode;
    if (code !== 'UNAUTHORIZED' && code !== 'REAUTHENTICATION_REQUIRED') throw error;
    if (code === 'UNAUTHORIZED' && sent.refreshExpired) throw error;

    const current = await this.deps.sessionStore.load();
    if (current.kind !== 'authenticated' || current.credentials.userId !== sent.userId) {
      throw new CancelledError('session changed');
    }
    throwIfAborted(attempt.signal);
    if (current.credentials.refreshToken !== sent.refreshToken) {
      // 401을 받은 사이 다른 요청이 이미 갱신했다: refresh 없이 새 토큰으로 재전송(REQ-NET-020).
      return this.resend(attempt, current.credentials);
    }
    if (code === 'REAUTHENTICATION_REQUIRED') return this.expireSession(sent.refreshToken);

    const outcome = await abortable(
      this.deps.tokenRefresher.refresh(sent.refreshToken, sent.userId),
      attempt.signal,
    );
    if (outcome.kind === 'session-changed') throw new CancelledError('session changed');
    return this.resend(attempt, outcome.credentials);
  }

  /** 새 자격으로 원 요청을 정확히 한 번 다시 보낸다(REQ-NET-021). */
  private async resend(attempt: Attempt, credentials: SessionCredentials): Promise<HttpResponse> {
    throwIfAborted(attempt.signal);
    const authorization = authorizationHeaderFor({
      url: attempt.url,
      level: 'required',
      session: { kind: 'authenticated', credentials },
      now: this.deps.clock.now(),
    });
    const headers = { ...attempt.headers };
    delete headers.Authorization;
    if (authorization) headers.Authorization = authorization;
    try {
      return await this.sendWithRetry({ ...attempt, headers });
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
      if (error.errorCode === 'REAUTHENTICATION_REQUIRED') {
        return this.expireSession(credentials.refreshToken);
      }
      if (error.errorCode === 'UNAUTHORIZED') {
        throw new AuthenticationRequiredError('authentication required');
      }
      throw error;
    }
  }

  private async expireSession(refreshToken: string): Promise<never> {
    const outcome = await this.deps.tokenRefresher.expire(refreshToken);
    if (outcome === 'session-changed') throw new CancelledError('session changed');
    throw new ReauthenticationRequiredError('reauthentication required');
  }

  /** 2xx 응답을 돌려주거나 ApiError를 던진다. 재시도 대상이면 백오프/Retry-After만큼 기다려 다시 보낸다. */
  private async sendWithRetry(attempt: Attempt): Promise<HttpResponse> {
    const { transport, logger, sleeper, clock } = this.deps;
    const logUrl = stripQuery(attempt.url);
    for (let index = 0; ; index += 1) {
      throwIfAborted(attempt.signal);
      let failure: ApiError;
      let retryAfterHeader: string | undefined;
      try {
        const response = await transport.send(
          {
            method: attempt.method,
            url: attempt.url,
            headers: attempt.headers,
            body: attempt.body,
          },
          {
            signal: attempt.signal,
            connectTimeoutMs: attempt.timeoutMs.connect,
            responseTimeoutMs: attempt.timeoutMs.response,
          },
        );
        throwIfAborted(attempt.signal);
        logger.log({
          level: 'debug',
          event: 'http.response',
          method: attempt.method,
          url: logUrl,
          status: response.status,
          attempt: index,
        });
        if (response.status >= 200 && response.status < 300) return response;
        retryAfterHeader = response.headers['retry-after'];
        failure = parseErrorBody(response.status, response.bodyText);
      } catch (error) {
        if (error instanceof ApiError && !(error instanceof NetworkError)) throw error;
        failure = toApiError(error, attempt.signal);
        if (failure instanceof CancelledError) throw failure;
      }

      const delay =
        attempt.retryable && index < RETRY_MAX
          ? this.retryDelay(failure, retryAfterHeader, index, clock.now())
          : null;
      logger.log({
        level: delay === null ? 'error' : 'warn',
        event: delay === null ? 'http.failed' : 'http.retry',
        method: attempt.method,
        url: logUrl,
        status: failure instanceof HttpError ? failure.status : undefined,
        errorCode: failure instanceof HttpError ? (failure.errorCode ?? undefined) : undefined,
        detail: failure.name,
        attempt: index,
      });
      if (delay === null) throw failure;
      await sleeper.sleep(delay, attempt.signal);
    }
  }

  /** 다음 재시도 전 대기 ms, 재시도하지 않으면 null(D-21, REQ-NET-013/015). */
  private retryDelay(failure: ApiError, retryAfter: string | undefined, index: number, now: Date) {
    if (failure instanceof NetworkError) return backoffMs(index);
    if (!(failure instanceof HttpError)) return null;
    if (failure.status === 429 || failure.status === 503) {
      const waitMs = parseRetryAfterMs(retryAfter, now);
      if (waitMs !== null) return waitMs > MAX_RETRY_AFTER_MS ? null : waitMs;
      return failure.status === 503 ? backoffMs(index) : null;
    }
    return failure.status >= 500 ? backoffMs(index) : null;
  }
}
