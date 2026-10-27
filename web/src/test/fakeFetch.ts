/**
 * 계약 테스트용 fake fetch. MSW 대신 이것으로 통일한다: 가짜 시계(FakeClock)와 같이 쓸 때 타이머 간섭이 없고,
 * 경로·메서드·헤더·바디 기록과 요청 취소(signal) 처리를 직접 통제할 수 있다.
 */
export interface RecordedRequest {
  method: string;
  /** fetch에 넘어온 URL 그대로 */
  url: string;
  /** '/api/v1' 접두를 뗀 경로(쿼리 제외). 접두가 없으면 pathname 그대로. */
  path: string;
  query: URLSearchParams;
  /** 소문자 헤더 이름 */
  headers: Record<string, string>;
  /** 문자열 본문, 없으면 null. Blob/ArrayBuffer는 그 객체 */
  body: string | Blob | ArrayBuffer | null;
  signal: AbortSignal | null;
}

export type Responder = (req: RecordedRequest) => Response | Promise<Response>;

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

export function textResponse(status: number, body: string, contentType: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'content-type': contentType, ...headers } });
}

/** response.url을 지정한 사본(리다이렉트 시뮬레이션). */
export function withUrl(response: Response, url: string): Response {
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

/** fetch가 TypeError로 거절되는 상황(연결 실패, DNS, TLS). */
export const networkFailure: Responder = () => {
  throw new TypeError('Failed to fetch');
};

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}

export class FakeFetch {
  readonly calls: RecordedRequest[] = [];
  private routes: { method: string; path: string; responders: Responder[]; used: number }[] = [];

  /** 'POST /auth/refresh' 형태. 응답이 여러 개면 순서대로 소비하고 마지막 것을 반복한다. */
  route(spec: string, ...responders: Responder[]): this {
    const [method, path] = spec.split(' ') as [string, string];
    this.routes.push({ method, path, responders, used: 0 });
    return this;
  }

  callsTo(spec: string): RecordedRequest[] {
    const [method, path] = spec.split(' ');
    return this.calls.filter((c) => c.method === method && c.path === path);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url, 'http://localhost');
    const path = parsed.pathname.replace(/^\/api\/v1/, '') || '/';
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const req: RecordedRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      url,
      path,
      query: parsed.searchParams,
      headers,
      body: (init?.body as RecordedRequest['body']) ?? null,
      signal: init?.signal ?? null,
    };
    this.calls.push(req);
    if (req.signal?.aborted) throw abortError();

    const route = this.routes.find((r) => r.method === req.method && r.path === req.path);
    if (!route) throw new TypeError(`FakeFetch: no route for ${req.method} ${req.path}`);
    const responder = route.responders[Math.min(route.used, route.responders.length - 1)]!;
    route.used += 1;

    const pending = Promise.resolve().then(() => responder(req));
    if (!req.signal) return pending;
    const signal = req.signal;
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
    });
  };
}
