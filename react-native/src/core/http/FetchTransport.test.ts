import { CancelledError, NetworkError, TimeoutError } from './ApiError';
import { FetchTransport } from './FetchTransport';
import type { HttpRequest } from './HttpTransport';

type FakeResponse = {
  status: number;
  headers: { forEach(cb: (value: string, key: string) => void): void };
  text(): Promise<string>;
};

const OPTIONS = { connectTimeoutMs: 10_000, responseTimeoutMs: 15_000 };
const REQUEST: HttpRequest = {
  method: 'POST',
  url: 'https://api.test/api/v1/feedbacks',
  headers: { 'Content-Type': 'application/json' },
  body: '{"a":1}',
};

function response(
  status: number,
  headers: Record<string, string>,
  text: () => Promise<string>,
): FakeResponse {
  return {
    status,
    headers: { forEach: (cb) => Object.entries(headers).forEach(([k, v]) => cb(v, k)) },
    text,
  };
}

/** init.signal이 abort되면 AbortError로 reject하는 fetch 가짜. */
function fetchWith(
  produce: (init: RequestInit) => Promise<FakeResponse>,
): jest.Mock<Promise<FakeResponse>, [string, RequestInit]> {
  return jest.fn((_url: string, init: RequestInit) => {
    return new Promise<FakeResponse>((resolve, reject) => {
      const abort = () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (init.signal?.aborted) return abort();
      init.signal?.addEventListener('abort', abort, { once: true });
      produce(init).then(resolve, reject);
    });
  });
}

const never = () => new Promise<FakeResponse>(() => undefined);
const later = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('FetchTransport', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const make = (fetchMock: ReturnType<typeof fetchWith>) =>
    new FetchTransport(fetchMock as unknown as typeof fetch);

  it('응답을 status, 소문자 헤더, bodyText로 돌려주고 4xx/5xx도 throw하지 않는다', async () => {
    const fetchMock = fetchWith(async () =>
      response(
        500,
        { 'Content-Type': 'application/json', 'Retry-After': '2' },
        async () => '{"x":1}',
      ),
    );
    const result = await make(fetchMock).send(REQUEST, OPTIONS);
    expect(result).toEqual({
      status: 500,
      headers: { 'content-type': 'application/json', 'retry-after': '2' },
      bodyText: '{"x":1}',
    });
  });

  it('TC-NET-050 method·headers·body를 그대로 넘기고 redirect를 따라가지 않는다(manual)', async () => {
    const fetchMock = fetchWith(async () => response(200, {}, async () => ''));
    await make(fetchMock).send(REQUEST, OPTIONS);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(REQUEST.url);
    expect(init).toMatchObject({
      method: 'POST',
      headers: REQUEST.headers,
      body: REQUEST.body,
      redirect: 'manual',
    });
  });

  it('TC-NET-045 fetch TypeError(연결 실패, DNS, TLS)는 NetworkError다', async () => {
    const fetchMock = fetchWith(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(make(fetchMock).send(REQUEST, OPTIONS)).rejects.toBeInstanceOf(NetworkError);
  });

  it('TC-NET-043 응답 헤더가 10초 안에 오지 않으면 TimeoutError(NetworkError)다', async () => {
    const fetchMock = fetchWith(never);
    const call = make(fetchMock)
      .send(REQUEST, OPTIONS)
      .catch((e) => e);
    await jest.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void call.then(() => (settled = true));
    await jest.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    const error = await call;
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it('TC-NET-043 요청 시작부터 14.9초에 본문까지 받으면 성공이다', async () => {
    const fetchMock = fetchWith(async () => response(200, {}, () => later(14_900, '{"ok":true}')));
    const call = make(fetchMock).send(REQUEST, OPTIONS);
    await jest.advanceTimersByTimeAsync(14_900);
    await expect(call).resolves.toMatchObject({ status: 200, bodyText: '{"ok":true}' });
  });

  it('TC-NET-043 본문이 15.1초에 오면 TimeoutError다', async () => {
    const fetchMock = fetchWith(async () => response(200, {}, () => later(15_100, 'late')));
    const call = make(fetchMock)
      .send(REQUEST, OPTIONS)
      .catch((e) => e);
    await jest.advanceTimersByTimeAsync(15_100);
    expect(await call).toBeInstanceOf(TimeoutError);
  });

  it('TC-NET-044 presigned PUT처럼 60초 한도를 주면 59초 본문은 성공이다', async () => {
    const fetchMock = fetchWith(async () => response(200, {}, () => later(59_000, '')));
    const call = make(fetchMock).send(REQUEST, {
      connectTimeoutMs: 60_000,
      responseTimeoutMs: 60_000,
    });
    await jest.advanceTimersByTimeAsync(59_000);
    await expect(call).resolves.toMatchObject({ status: 200 });
  });

  it('TC-NET-048 호출자 signal을 abort하면 CancelledError이고 NetworkError가 아니다', async () => {
    const fetchMock = fetchWith(never);
    const controller = new AbortController();
    const call = make(fetchMock)
      .send(REQUEST, { ...OPTIONS, signal: controller.signal })
      .catch((e) => e);
    await jest.advanceTimersByTimeAsync(100);
    controller.abort();
    const error = await call;
    expect(error).toBeInstanceOf(CancelledError);
    expect(error).not.toBeInstanceOf(NetworkError);
  });

  it('TC-NET-048 이미 abort된 signal이면 fetch를 호출하지 않는다', async () => {
    const fetchMock = fetchWith(never);
    const controller = new AbortController();
    controller.abort();
    await expect(
      make(fetchMock).send(REQUEST, { ...OPTIONS, signal: controller.signal }),
    ).rejects.toBeInstanceOf(CancelledError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('요청이 끝나면 타이머를 남기지 않는다', async () => {
    const fetchMock = fetchWith(async () => response(200, {}, async () => 'ok'));
    await make(fetchMock).send(REQUEST, OPTIONS);
    expect(jest.getTimerCount()).toBe(0);
  });
});
