import { isAllowedTransportUrl } from '../config/transportSecurity';
import { CancelledError, NetworkError, TimeoutError } from './ApiError';
import type { HttpRequest, HttpResponse, HttpTransport, SendOptions } from './HttpTransport';

/** abort되면 reject하는 promise. fetch/본문 읽기가 abort에 반응하지 않아도 타임아웃이 지켜지게 한다. */
function abortion(signal: AbortSignal): { promise: Promise<never>; dispose: () => void } {
  let onAbort = () => undefined as void;
  const promise = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  promise.catch(() => undefined);
  return { promise, dispose: () => signal.removeEventListener('abort', onAbort) };
}

export class FetchTransport implements HttpTransport {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async send(request: HttpRequest, options: SendOptions): Promise<HttpResponse> {
    const caller = options.signal;
    if (caller?.aborted) throw new CancelledError('aborted');

    const controller = new AbortController();
    let timedOut = false;
    const expire = () => {
      timedOut = true;
      controller.abort();
    };
    const onCallerAbort = () => controller.abort();
    caller?.addEventListener('abort', onCallerAbort, { once: true });
    const connectTimer = setTimeout(expire, options.connectTimeoutMs);
    const totalTimer = setTimeout(expire, options.responseTimeoutMs);
    const aborted = abortion(controller.signal);

    try {
      const response = await Promise.race([
        this.fetchImpl(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body as BodyInit | undefined,
          // RN의 fetch는 이 옵션을 무시하고 리다이렉트를 따라갈 수 있다. 아래에서 최종 URL을 따로 검사한다.
          redirect: 'manual',
          signal: controller.signal,
        }),
        aborted.promise,
      ]);
      clearTimeout(connectTimer);
      if (response.url && !isAllowedTransportUrl(response.url)) {
        throw new NetworkError('insecure redirect');
      }
      const bodyText = await Promise.race([response.text(), aborted.promise]);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: response.status, headers, bodyText };
    } catch (error) {
      if (caller?.aborted) throw new CancelledError('aborted');
      if (timedOut) throw new TimeoutError('timeout');
      if (error instanceof NetworkError) throw error;
      throw new NetworkError(error instanceof Error ? error.name : 'network');
    } finally {
      clearTimeout(connectTimer);
      clearTimeout(totalTimer);
      caller?.removeEventListener('abort', onCallerAbort);
      aborted.dispose();
    }
  }
}
