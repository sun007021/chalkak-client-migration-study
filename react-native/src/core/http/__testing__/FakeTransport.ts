import { CancelledError, NetworkError, TimeoutError } from '../ApiError';
import type { HttpRequest, HttpResponse, HttpTransport, SendOptions } from '../HttpTransport';

export type RecordedRequest = HttpRequest & { options: SendOptions };

/** 핸들러는 응답을 돌려주거나 throw(TypeError, NetworkError, TimeoutError ...)로 장애를 흉내 낸다. */
export type TransportHandler = (
  request: HttpRequest,
  index: number,
) => HttpResponse | Promise<HttpResponse>;

export class FakeTransport implements HttpTransport {
  readonly requests: RecordedRequest[] = [];
  private handler: TransportHandler = () => {
    throw new Error('FakeTransport: 핸들러가 지정되지 않았다');
  };

  respond(handler: TransportHandler): this {
    this.handler = handler;
    return this;
  }

  /** 호출 순서대로 응답/오류를 하나씩 소비한다. 다 쓰면 마지막 항목을 반복한다. */
  script(...steps: (HttpResponse | Error)[]): this {
    return this.respond((_req, index) => {
      const step = steps[Math.min(index, steps.length - 1)];
      if (step instanceof Error) throw step;
      return step;
    });
  }

  requestsTo(method: string, pathSuffix: string): RecordedRequest[] {
    return this.requests.filter(
      (r) => r.method === method && new URL(r.url).pathname.endsWith(pathSuffix),
    );
  }

  async send(request: HttpRequest, options: SendOptions): Promise<HttpResponse> {
    const index = this.requests.length;
    this.requests.push({ ...request, headers: { ...request.headers }, options });
    if (options.signal?.aborted) throw new CancelledError('aborted');
    const result = Promise.resolve().then(() => this.handler(request, index));
    if (!options.signal) return result;
    const signal = options.signal;
    return new Promise<HttpResponse>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new CancelledError('aborted')), {
        once: true,
      });
      result.then(resolve, reject);
    });
  }
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json', ...headers },
    bodyText: JSON.stringify(body),
  };
}

export function raw(
  status: number,
  bodyText: string,
  contentType: string | null = null,
  headers: Record<string, string> = {},
): HttpResponse {
  return {
    status,
    headers: { ...(contentType ? { 'content-type': contentType } : {}), ...headers },
    bodyText,
  };
}

export function noContent(): HttpResponse {
  return { status: 204, headers: {}, bodyText: '' };
}

export const networkFailure = (): Error => new NetworkError('offline');
export const timeoutFailure = (): Error => new TimeoutError('timeout');

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
