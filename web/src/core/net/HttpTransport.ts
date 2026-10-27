import { RETRY_AFTER_MAX_MS, RETRY_BACKOFF_MS } from '../../constants';
import type { Clock } from '../time/Clock';
import { NetworkError, isCancellation } from './errors';
import { sanitizeLogFields, stripUrlQuery } from './Logger';
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

const MAX_RETRIES = RETRY_BACKOFF_MS.length;
const IDEMPOTENT_METHODS = new Set(['GET', 'PUT', 'DELETE', 'PATCH']);
const IDEMPOTENT_POST_PATHS = new Set(['/posts/uploads', '/users/me/signature/uploads']);

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * fetch 위의 얇은 층. 타임아웃, 재시도·Retry-After, 취소, 플랫폼 예외 → NetworkError 매핑, https→http 리다이렉트 거부를 맡는다.
 * 4xx/5xx(재시도 소진 포함)는 던지지 않고 그대로 돌려준다. 해석은 호출자 몫.
 */
export class HttpTransport {
  constructor(private readonly deps: HttpTransportDeps) {}

  async send(request: TransportRequest): Promise<TransportResponse> {
    for (let attempt = 0; ; attempt++) {
      if (request.signal?.aborted) throw abortError();
      const canRetry = request.retry && attempt < MAX_RETRIES;
      let response: TransportResponse;
      try {
        response = await this.attempt(request);
      } catch (error) {
        if (!canRetry || !(error instanceof NetworkError) || error.kind === 'insecure_redirect') throw error;
        this.logRetry(request, attempt, { reason: error.kind });
        await this.deps.clock.sleep(RETRY_BACKOFF_MS[attempt]!, request.signal);
        continue;
      }
      const delay = canRetry ? this.retryDelayMs(response, attempt) : null;
      if (delay === null) return response;
      this.logRetry(request, attempt, { status: response.status, delayMs: delay });
      await this.deps.clock.sleep(delay, request.signal);
    }
  }

  /** 재시도할 응답이면 대기 ms, 아니면 null. 5xx는 재시도, 429는 유효한 Retry-After가 있을 때만(D-21). */
  private retryDelayMs(response: TransportResponse, attempt: number): number | null {
    const { status } = response;
    if (status !== 429 && status < 500) return null;
    const retryAfter = parseRetryAfter(response.headers.get('retry-after'), this.deps.clock.nowMs());
    if (retryAfter === 'too_long') return null;
    if (retryAfter !== null) return retryAfter;
    return status === 429 ? null : RETRY_BACKOFF_MS[attempt]!;
  }

  private async attempt(request: TransportRequest): Promise<TransportResponse> {
    const { clock } = this.deps;
    const controller = new AbortController();
    const onUserAbort = () => controller.abort();
    request.signal?.addEventListener('abort', onUserAbort, { once: true });
    // 응답 본문을 다 읽을 때까지 하나의 타임아웃을 적용한다(헤더 후 본문이 멈춰도 NetworkError(timeout), D-21).
    const timerStop = new AbortController();
    let timedOut = false;
    void clock.sleep(request.timeoutMs, timerStop.signal).then(
      () => {
        timedOut = true;
        controller.abort();
      },
      () => {},
    );
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(abortError()), { once: true });
    });
    aborted.catch(() => {});
    // fetch·본문 읽기가 abort를 무시하는 환경에서도 끝나도록 abort와 경주시킨다. 진 쪽의 늦은 거절은 삼킨다.
    const raceWithAbort = <T>(promise: Promise<T>): Promise<T> => {
      promise.catch(() => {});
      return Promise.race([promise, aborted]);
    };
    let response: Response | undefined;
    try {
      response = await raceWithAbort(
        this.deps.fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
          credentials: 'omit',
        }),
      );
      if (request.url.startsWith('https:') && response.url.startsWith('http:')) {
        await response.body?.cancel().catch(() => {});
        throw new NetworkError('insecure_redirect');
      }
      const text = await raceWithAbort(response.text());
      return { status: response.status, headers: response.headers, text };
    } catch (error) {
      void response?.body?.cancel().catch(() => {});
      if (request.signal?.aborted) throw isCancellation(error) ? error : abortError();
      if (timedOut) throw new NetworkError('timeout', error);
      if (error instanceof NetworkError) throw error;
      throw new NetworkError('connection', error);
    } finally {
      timerStop.abort();
      request.signal?.removeEventListener('abort', onUserAbort);
    }
  }

  private logRetry(request: TransportRequest, attempt: number, extra: Record<string, unknown>): void {
    this.deps.logger?.log(
      'warn',
      'http retry',
      sanitizeLogFields({ method: request.method, url: stripUrlQuery(request.url), attempt: attempt + 1, ...extra }) as Record<string, unknown>,
    );
  }
}

/** 멱등 요청 판정(D-21): GET/PUT/DELETE/PATCH와 업로드 정책 발급 POST(/posts/uploads, /users/me/signature/uploads). path는 /api/v1 뒤 경로. */
export function isIdempotentRequest(method: string, path: string): boolean {
  const upper = method.toUpperCase();
  if (IDEMPOTENT_METHODS.has(upper)) return true;
  return upper === 'POST' && IDEMPOTENT_POST_PATHS.has(path);
}

/** Retry-After 값을 대기 ms로. 숫자 초 또는 HTTP 날짜. 음수·비숫자·과거 날짜는 null(무시). 상한(RETRY_AFTER_MAX_MS) 초과는 'too_long'. */
export function parseRetryAfter(value: string | null, nowMs: number): number | 'too_long' | null {
  const text = value?.trim() ?? '';
  if (text === '') return null;
  const maxMs = RETRY_AFTER_MAX_MS;
  if (/^\d+$/.test(text)) {
    const ms = Number(text) * 1000;
    return ms > maxMs ? 'too_long' : ms;
  }
  if (!/[a-z]/i.test(text)) return null; // Date.parse가 '-1' 같은 값을 날짜로 받아들이는 것을 막는다
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  const ms = at - nowMs;
  if (ms <= 0) return null;
  return ms > maxMs ? 'too_long' : ms;
}
