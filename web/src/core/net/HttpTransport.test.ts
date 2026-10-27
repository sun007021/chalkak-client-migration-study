import { HttpTransport, isIdempotentRequest, parseRetryAfter, type TransportRequest } from './HttpTransport';
import { NetworkError, isCancellation } from './errors';
import { RecordingLogger } from './Logger';
import { FakeClock } from '../time/FakeClock';
import { FakeFetch, emptyResponse, jsonResponse, networkFailure, textResponse, withUrl } from '../../test/fakeFetch';
import { track } from '../../test/track';
import { HTTP_RESPONSE_TIMEOUT_MS, PRESIGNED_PUT_TIMEOUT_MS, RETRY_BACKOFF_MS } from '../../constants';
import { NOW } from '../../test/fixtures';

function setup() {
  const clock = new FakeClock(NOW);
  const ff = new FakeFetch();
  const logger = new RecordingLogger();
  const transport = new HttpTransport({ fetch: ff.fetch, clock, logger });
  const req = (over: Partial<TransportRequest> = {}): TransportRequest => ({
    method: 'GET',
    url: 'https://mock.local/api/v1/topics',
    headers: { accept: 'application/json' },
    timeoutMs: HTTP_RESPONSE_TIMEOUT_MS,
    retry: true,
    ...over,
  });
  return { clock, ff, logger, transport, req };
}

describe('멱등 판정', () => {
  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('TC-NET-037 %s는 멱등이다', (m) => {
    expect(isIdempotentRequest(m, '/anything')).toBe(true);
  });

  it.each(['/posts/uploads', '/users/me/signature/uploads'])('TC-NET-037 업로드 정책 발급 POST %s는 멱등으로 본다', (p) => {
    expect(isIdempotentRequest('POST', p)).toBe(true);
  });

  it.each([
    '/posts',
    '/auth/refresh',
    '/auth/logout',
    '/feedbacks',
    '/posts/3f2504e0-4f89-11d3-9a0c-0305e82c3301/ai-review',
    '/auth/social-login',
    '/auth/social-signup/signature/uploads',
    '/auth/social-signup',
  ])('TC-NET-038 비멱등 POST %s는 재시도하지 않는다', (p) => {
    expect(isIdempotentRequest('POST', p)).toBe(false);
  });

  it('TC-NET-038 /auth/social-* 로 시작하는 모든 POST는 비멱등이다', () => {
    expect(isIdempotentRequest('POST', '/auth/social-something-new')).toBe(false);
  });
});

describe('재시도·백오프', () => {
  it('TC-NET-037 멱등 요청이 5xx면 0.5초, 1초 뒤 재시도하고 총 3시도 뒤 마지막 응답을 돌려준다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => jsonResponse(500, { errorCode: 'INTERNAL_ERROR', message: 'x' }));
    const result = track(transport.send(req()));

    await clock.advance(0);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(RETRY_BACKOFF_MS[0] - 1);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(1);
    expect(ff.calls).toHaveLength(2);
    await clock.advance(RETRY_BACKOFF_MS[1] - 1);
    expect(ff.calls).toHaveLength(2);
    expect(result.state).toBe('pending');
    await clock.advance(1);
    expect(ff.calls).toHaveLength(3);
    expect(result.state).toBe('fulfilled');
    expect(result.value?.status).toBe(500);
    await clock.advance(60_000);
    expect(ff.calls).toHaveLength(3); // 총 3시도에서 멈춘다
  });

  it('TC-NET-037 네트워크 오류도 같은 간격으로 재시도하고 소진되면 NetworkError를 던진다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', networkFailure);
    const result = track(transport.send(req()));
    await clock.advance(RETRY_BACKOFF_MS[0] + RETRY_BACKOFF_MS[1]);
    expect(ff.calls).toHaveLength(3);
    expect(result.state).toBe('rejected');
    expect(result.error).toBeInstanceOf(NetworkError);
  });

  it('TC-NET-037 재시도 중 성공하면 그 응답을 돌려준다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => emptyResponse(503), () => jsonResponse(200, { ok: true }));
    const result = track(transport.send(req()));
    await clock.advance(RETRY_BACKOFF_MS[0]);
    expect(ff.calls).toHaveLength(2);
    expect(result.value?.status).toBe(200);
    expect(result.value?.text).toBe('{"ok":true}');
  });

  it('TC-NET-038 retry=false(비멱등)는 네트워크 오류·5xx에도 정확히 1시도다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('POST /feedbacks', () => emptyResponse(500));
    ff.route('POST /posts', networkFailure);
    const a = track(transport.send(req({ method: 'POST', url: 'https://mock.local/api/v1/feedbacks', retry: false })));
    const b = track(transport.send(req({ method: 'POST', url: 'https://mock.local/api/v1/posts', retry: false })));
    await clock.advance(10_000);
    expect(ff.callsTo('POST /feedbacks')).toHaveLength(1);
    expect(ff.callsTo('POST /posts')).toHaveLength(1);
    expect(a.value?.status).toBe(500);
    expect(b.error).toBeInstanceOf(NetworkError);
  });

  it.each([400, 403, 404])('TC-NET-039 멱등 요청이라도 %i는 재시도하지 않는다', async (status) => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => emptyResponse(status));
    const result = track(transport.send(req()));
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.value?.status).toBe(status);
  });
});

describe('Retry-After', () => {
  it('TC-NET-040 503 + Retry-After 초 값이면 백오프 대신 그 시간만큼 기다린 뒤 재시도한다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => emptyResponse(503, { 'retry-after': '2' }), () => jsonResponse(200, {}));
    const result = track(transport.send(req()));
    await clock.advance(1_999);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(1);
    expect(ff.calls).toHaveLength(2);
    expect(result.value?.status).toBe(200);
  });

  it('TC-NET-040 HTTP 날짜 형식의 Retry-After도 지킨다', async () => {
    const { clock, ff, transport, req } = setup();
    const date = new Date(clock.nowMs() + 2_000).toUTCString();
    ff.route('GET /topics', () => emptyResponse(503, { 'retry-after': date }), () => jsonResponse(200, {}));
    track(transport.send(req()));
    await clock.advance(1_999);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(1);
    expect(ff.calls).toHaveLength(2);
  });

  it('TC-NET-040 멱등 요청이 429 + Retry-After면 재시도하고, Retry-After가 없으면 재시도하지 않는다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => emptyResponse(429, { 'retry-after': '2' }), () => jsonResponse(200, {}));
    const a = track(transport.send(req()));
    await clock.advance(2_000);
    expect(ff.calls).toHaveLength(2);
    expect(a.value?.status).toBe(200);

    const second = setup();
    second.ff.route('GET /topics', () => emptyResponse(429));
    const b = track(second.transport.send(second.req()));
    await second.clock.advance(10_000);
    expect(second.ff.calls).toHaveLength(1);
    expect(b.value?.status).toBe(429);
  });

  it('TC-NET-041 Retry-After가 잘못되면 무시하고 기본 백오프(0.5초)를 쓴다', async () => {
    for (const bad of ['-1', 'abc', new Date(NOW - 60_000).toUTCString()]) {
      const { clock, ff, transport, req } = setup();
      ff.route('GET /topics', () => emptyResponse(503, { 'retry-after': bad }), () => jsonResponse(200, {}));
      track(transport.send(req()));
      await clock.advance(RETRY_BACKOFF_MS[0]);
      expect(ff.calls, `Retry-After: ${bad}`).toHaveLength(2);
    }
  });

  it('TC-NET-041 상한(30초)을 넘는 Retry-After는 기다리지 않고 그 응답으로 실패 처리한다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => emptyResponse(503, { 'retry-after': '99999' }));
    const result = track(transport.send(req()));
    await clock.advance(120_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.value?.status).toBe(503);
  });

  it('TC-NET-042 비멱등 POST가 429면 재시도 없이 그 응답을 돌려준다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('POST /feedbacks', () => emptyResponse(429, { 'retry-after': '2' }));
    const result = track(transport.send(req({ method: 'POST', url: 'https://mock.local/api/v1/feedbacks', retry: false })));
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.value?.status).toBe(429);
  });

  it.each([
    ['2', 2_000],
    ['0', 0],
    ['30', 30_000],
    ['31', 'too_long'],
    ['99999', 'too_long'],
    ['-1', null],
    ['abc', null],
    ['1.5', null],
    ['', null],
  ])('TC-NET-041 parseRetryAfter(%j)', (raw, expected) => {
    expect(parseRetryAfter(raw, NOW)).toBe(expected);
  });

  it('TC-NET-041 parseRetryAfter는 헤더가 없거나 날짜가 과거·상한 초과인 경우를 구분한다', () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter(new Date(NOW + 5_000).toUTCString(), NOW)).toBe(5_000);
    expect(parseRetryAfter(new Date(NOW - 5_000).toUTCString(), NOW)).toBeNull();
    expect(parseRetryAfter(new Date(NOW + 3_600_000).toUTCString(), NOW)).toBe('too_long');
  });
});

describe('타임아웃', () => {
  it('TC-NET-043 응답이 14.9초에 오면 성공한다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', async () => {
      await clock.sleep(14_900);
      return jsonResponse(200, { ok: true });
    });
    const result = track(transport.send(req({ retry: false })));
    await clock.advance(14_900);
    expect(result.state).toBe('fulfilled');
    expect(result.value?.status).toBe(200);
  });

  it('TC-NET-043 응답이 15.1초에 오면 NetworkError(timeout)로 실패하고 요청을 취소한다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', async () => {
      await clock.sleep(15_100);
      return jsonResponse(200, {});
    });
    const result = track(transport.send(req({ retry: false })));
    await clock.advance(15_000);
    expect(result.state).toBe('rejected');
    expect(result.error).toMatchObject({ name: 'NetworkError', kind: 'timeout' });
    expect(ff.calls[0]!.signal?.aborted).toBe(true);
  });

  it('TC-NET-043 타임아웃도 멱등 요청이면 재시도 대상이다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => new Promise<Response>(() => {}));
    track(transport.send(req()));
    await clock.advance(15_000);
    await clock.advance(RETRY_BACKOFF_MS[0]);
    expect(ff.calls).toHaveLength(2);
  });

  it('TC-NET-044 timeoutMs=60초(presigned PUT)면 59초 응답은 성공하고 61초는 실패한다', async () => {
    const ok = setup();
    ok.ff.route('PUT /bucket/key', async () => {
      await ok.clock.sleep(59_000);
      return emptyResponse(200);
    });
    const a = track(ok.transport.send(ok.req({ method: 'PUT', url: 'https://s3.test/bucket/key?sig=1', timeoutMs: PRESIGNED_PUT_TIMEOUT_MS, retry: false })));
    await ok.clock.advance(59_000);
    expect(a.state).toBe('fulfilled');

    const slow = setup();
    slow.ff.route('PUT /bucket/key', async () => {
      await slow.clock.sleep(61_000);
      return emptyResponse(200);
    });
    const b = track(slow.transport.send(slow.req({ method: 'PUT', url: 'https://s3.test/bucket/key?sig=1', timeoutMs: PRESIGNED_PUT_TIMEOUT_MS, retry: false })));
    await slow.clock.advance(60_000);
    expect(b.error).toMatchObject({ kind: 'timeout' });
  });

  it('TC-NET-043 끝난 요청은 타임아웃 타이머를 남기지 않는다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => jsonResponse(200, {}));
    track(transport.send(req()));
    await clock.advance(0);
    expect(clock.pendingTimers).toBe(0);
  });
});

describe('오류 매핑·취소·리다이렉트', () => {
  it.each([
    ['fetch TypeError(연결·DNS·TLS)', () => new TypeError('Failed to fetch')],
    ['TimeoutError DOMException', () => new DOMException('timed out', 'TimeoutError')],
    ['일반 Error', () => new Error('socket hang up')],
  ])('TC-NET-045 %s는 모두 NetworkError(connection)로 매핑된다', async (_n, make) => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => {
      throw make();
    });
    const result = track(transport.send(req({ retry: false })));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(NetworkError);
    expect((result.error as NetworkError).kind).toBe('connection');
  });

  it('TC-NET-048 요청 도중 취소하면 AbortError가 그대로 전파되고 NetworkError로 바뀌지 않는다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => new Promise<Response>(() => {}));
    const ctrl = new AbortController();
    const result = track(transport.send(req({ signal: ctrl.signal })));
    await clock.advance(100);
    ctrl.abort();
    await clock.advance(0);
    expect(result.state).toBe('rejected');
    expect(isCancellation(result.error)).toBe(true);
    expect(result.error).not.toBeInstanceOf(NetworkError);
    expect(clock.pendingTimers).toBe(0);
  });

  it('TC-NET-048 이미 취소된 signal이면 요청을 보내지 않는다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => jsonResponse(200, {}));
    const ctrl = new AbortController();
    ctrl.abort();
    const result = track(transport.send(req({ signal: ctrl.signal })));
    await clock.advance(0);
    expect(ff.calls).toHaveLength(0);
    expect(isCancellation(result.error)).toBe(true);
  });

  it('TC-NET-049 재시도 백오프 대기 중 취소하면 즉시 중단하고 추가 요청을 보내지 않는다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => emptyResponse(500));
    const ctrl = new AbortController();
    const result = track(transport.send(req({ signal: ctrl.signal })));
    await clock.advance(100); // 첫 시도 실패, 백오프 대기 중
    expect(ff.calls).toHaveLength(1);
    ctrl.abort();
    await clock.advance(0);
    expect(isCancellation(result.error)).toBe(true);
    await clock.advance(60_000);
    expect(ff.calls).toHaveLength(1);
    expect(clock.pendingTimers).toBe(0);
  });

  it('TC-NET-050 https 요청이 http로 리다이렉트된 응답은 따르지 않고 실패 처리한다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => withUrl(jsonResponse(200, {}), 'http://mock.local/api/v1/topics'));
    const result = track(transport.send(req({ retry: false })));
    await clock.advance(0);
    expect(result.error).toMatchObject({ name: 'NetworkError', kind: 'insecure_redirect' });
  });

  it('TC-NET-050 같은 https 주소로 끝난 응답은 정상이다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => withUrl(jsonResponse(200, {}), 'https://mock.local/api/v1/topics'));
    const result = track(transport.send(req({ retry: false })));
    await clock.advance(0);
    expect(result.state).toBe('fulfilled');
  });

  it('REQ-NET-005 비 JSON 응답 본문도 text로 돌려준다', async () => {
    const { clock, ff, transport, req } = setup();
    ff.route('GET /topics', () => textResponse(502, '<html>bad</html>', 'text/html'));
    const result = track(transport.send(req({ retry: false })));
    await clock.advance(0);
    expect(result.value).toMatchObject({ status: 502, text: '<html>bad</html>' });
    expect(result.value?.headers.get('content-type')).toBe('text/html');
  });
});

describe('로그 위생', () => {
  it('TC-NET-055 Authorization 값과 presigned URL의 쿼리 문자열을 로그에 남기지 않는다', async () => {
    const { clock, ff, logger, transport, req } = setup();
    ff.route('PUT /bucket/key', () => emptyResponse(500));
    ff.route('GET /topics', networkFailure);
    track(transport.send(req({ method: 'PUT', url: 'https://s3.test/bucket/key?X-Amz-Signature=SECRETSIG&X-Amz-Credential=SECRETCRED', headers: { authorization: 'Bearer SECRETTOKEN' }, retry: false })));
    track(transport.send(req({ headers: { authorization: 'Bearer SECRETTOKEN' }, retry: false })));
    await clock.advance(5_000);
    const dump = logger.dump();
    expect(dump).not.toContain('SECRETSIG');
    expect(dump).not.toContain('SECRETCRED');
    expect(dump).not.toContain('SECRETTOKEN');
  });
});
