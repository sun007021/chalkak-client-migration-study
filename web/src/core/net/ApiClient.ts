import { HTTP_RESPONSE_TIMEOUT_MS } from '../../constants';
import type { ApiBaseUrl } from '../config/apiBaseUrl';
import type { Clock } from '../time/Clock';
import type { AuthContext, AuthCoordinator } from './AuthCoordinator';
import type { Decoder } from './decode';
import { ApiError, InvalidResponseError, SessionChangedError, parseErrorResponse } from './errors';
import { HttpTransport, isIdempotentRequest } from './HttpTransport';
import type { TransportResponse } from './HttpTransport';
import type { Logger } from './Logger';
import { buildUrl } from './url';
import type { QueryValue } from './url';

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
  /** parseApiBaseUrl/readApiBaseUrl로 검증을 마친 주소. 검증은 조립 한 곳(container)에서만 한다. */
  baseUrl: ApiBaseUrl;
  fetch: typeof fetch;
  clock: Clock;
  auth: AuthCoordinator;
  logger?: Logger;
}

const NO_AUTH: AuthContext = { authorization: null, userId: null, accessTokenAtRequest: null, refreshTokenAtRequest: null, canRefresh: false };
const JSON_CONTENT_TYPE = /^application\/([\w.+-]+\+)?json\s*(;|$)/i;

/** 토큰을 붙이지 않고 401 갱신도 하지 않는 API: /auth/*, /banners (REQ-NET-017, 025). */
const isAuthlessPath = (path: string): boolean => path === '/banners' || path.startsWith('/auth/');

const isSuccess = (response: TransportResponse): boolean => response.status >= 200 && response.status < 300;

/**
 * 서버 API 호출. 헤더 구성, 오류 파싱, 재시도 정책 선택, 401 갱신 후 1회 재전송, 응답 디코딩을 맡는다.
 * 던지는 것: ApiError, NetworkError, InvalidResponseError, AbortError(취소 그대로).
 */
export class ApiClient {
  private readonly baseUrl: ApiBaseUrl;
  private readonly transport: HttpTransport;

  constructor(private readonly deps: ApiClientDeps) {
    this.baseUrl = deps.baseUrl;
    this.transport = new HttpTransport({ fetch: deps.fetch, clock: deps.clock, logger: deps.logger });
  }

  /** 본문이 있는 2xx(JSON)를 decode로 해석한다. 204/빈 본문/비 JSON/해석 실패는 InvalidResponseError. */
  async request<T>(request: ApiRequest, decode: Decoder<T>): Promise<T> {
    const response = await this.execute(request);
    return decode(this.parseJson(response));
  }

  /** 본문이 없는 2xx(204 등). 본문 디코딩을 시도하지 않는다. */
  async requestVoid(request: ApiRequest): Promise<void> {
    await this.execute(request);
  }

  private parseJson(response: TransportResponse): unknown {
    if (response.status === 204 || response.text === '') throw new InvalidResponseError('empty body');
    if (!JSON_CONTENT_TYPE.test(response.headers.get('content-type') ?? '')) throw new InvalidResponseError('response is not JSON');
    try {
      return JSON.parse(response.text);
    } catch (error) {
      throw new InvalidResponseError('malformed JSON', error);
    }
  }

  /** 요청을 보내고 2xx 응답을 돌려준다. 401 처리(D-17)는 여기서 한다: 원 요청은 최대 1회만 재전송한다. */
  private async execute(request: ApiRequest): Promise<TransportResponse> {
    const authless = isAuthlessPath(request.path);
    const { auth } = this.deps;
    let ctx = authless ? NO_AUTH : await auth.prepare();
    for (let attempt = 0; ; attempt++) {
      const response = await this.sendOnce(request, ctx);
      if (isSuccess(response)) return response;
      const error = parseErrorResponse(response.status, response.text);
      if (authless || error.status !== 401) throw error;

      if (error.errorCode === 'REAUTHENTICATION_REQUIRED') {
        const outcome = await auth.handleReauthenticationRequired(ctx);
        if (outcome.kind !== 'retry' || attempt > 0) throw error;
      } else if (error.errorCode === 'UNAUTHORIZED') {
        if (attempt > 0) throw error;
        const outcome = await auth.handleUnauthorized(ctx, request.signal);
        if (outcome.kind === 'failed') throw outcome.error;
        if (outcome.kind === 'reauthentication_required') {
          throw new ApiError(401, 'REAUTHENTICATION_REQUIRED', error.message, 'REAUTHENTICATION_REQUIRED');
        }
        if (outcome.kind === 'not_applicable') throw error;
      } else {
        throw error;
      }
      const next = await auth.prepare();
      if (next.userId !== ctx.userId) throw new SessionChangedError('account switched before retry');
      ctx = next;
    }
  }

  private sendOnce(request: ApiRequest, ctx: AuthContext): Promise<TransportResponse> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (ctx.authorization) headers.authorization = ctx.authorization;
    let body: string | undefined;
    if (request.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(request.body);
    }
    return this.transport.send({
      method: request.method,
      url: buildUrl(this.baseUrl, request.path, request.query),
      headers,
      body,
      timeoutMs: HTTP_RESPONSE_TIMEOUT_MS,
      retry: isIdempotentRequest(request.method, request.path),
      signal: request.signal,
    });
  }
}
