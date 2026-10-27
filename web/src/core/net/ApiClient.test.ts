import { d } from './decode';
import { ApiError, ConfigError, InvalidResponseError, NetworkError, isCancellation } from './errors';
import { parseApiBaseUrl } from '../config/apiBaseUrl';
import { emptyResponse, jsonResponse, networkFailure, textResponse } from '../../test/fakeFetch';
import { makeApiEnv } from '../../test/apiEnv';
import { track } from '../../test/track';
import { errorBodies, gatewayHtml, memberSession } from '../../test/fixtures';
import { RETRY_BACKOFF_MS } from '../../constants';

const item = d.object({ id: d.string(), kind: d.enumOf(['A', 'B'] as const) });

describe('요청 구성', () => {
  it('TC-NET-054 본문 없는 GET은 Accept JSON만, 본문·Content-Type 없이 보낸다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /posts/today', () => jsonResponse(200, { id: '1', kind: 'A' }));
    const result = track(client().request({ method: 'GET', path: '/posts/today' }, item));
    await clock.advance(0);
    expect(result.value).toEqual({ id: '1', kind: 'A' });
    const call = ff.calls[0]!;
    expect(call.url).toBe('https://mock.local/api/v1/posts/today');
    expect(call.headers['accept']).toBe('application/json');
    expect(call.headers['content-type']).toBeUndefined();
    expect(call.body).toBeNull();
  });

  it('TC-NET-054 바디가 있는 POST는 Content-Type·Accept가 application/json이고 JSON 본문을 보낸다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /feedbacks', () => emptyResponse(204));
    track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: { content: '좋아요' } }));
    await clock.advance(0);
    const call = ff.calls[0]!;
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers['accept']).toBe('application/json');
    expect(JSON.parse(call.body as string)).toEqual({ content: '좋아요' });
  });

  it.each([
    ['POST', '/posts/3f2504e0-4f89-11d3-9a0c-0305e82c3301/ai-review'],
    ['PUT', '/push-devices/current'],
    ['DELETE', '/users/me'],
    ['PATCH', '/notifications/read-all'],
  ] as const)('TC-NET-054 본문 없는 %s %s는 본문과 Content-Type을 보내지 않는다', async (method, path) => {
    const { ff, client, clock } = makeApiEnv();
    ff.route(`${method} ${path}`, () => emptyResponse(204));
    track(client().requestVoid({ method, path }));
    await clock.advance(0);
    expect(ff.calls[0]!.body).toBeNull();
    expect(ff.calls[0]!.headers['content-type']).toBeUndefined();
  });

  it('TC-NET-052 경로·쿼리의 대문자 UUID는 소문자로 나간다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /posts/3f2504e0-4f89-11d3-9a0c-0305e82c3301', () => jsonResponse(200, { id: '1', kind: 'A' }));
    track(client().request({ method: 'GET', path: '/posts/3F2504E0-4F89-11D3-9A0C-0305E82C3301', query: { cursor: 'AB12CD34-0000-0000-0000-00000000000F' } }, item));
    await clock.advance(0);
    expect(ff.calls[0]!.path).toBe('/posts/3f2504e0-4f89-11d3-9a0c-0305e82c3301');
    expect(ff.calls[0]!.query.get('cursor')).toBe('ab12cd34-0000-0000-0000-00000000000f');
  });

  it('TC-NET-053 쿼리는 date yyyy-MM-dd, 10진 정수, 소문자 sort로 나간다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /posts', () => jsonResponse(200, { id: '1', kind: 'A' }));
    track(client().request({ method: 'GET', path: '/posts', query: { date: '2026-10-27', page: 1, pageSize: 20, sort: 'latest', randomSeed: undefined } }, item));
    await clock.advance(0);
    const q = ff.calls[0]!.query;
    expect([q.get('date'), q.get('page'), q.get('pageSize'), q.get('sort')]).toEqual(['2026-10-27', '1', '20', 'latest']);
    expect(q.has('randomSeed')).toBe(false);
  });

  it('TC-NET-058 모든 요청은 구성된 주소로만 나간다(mock 서버 주소 교체)', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession(), 'https://mock.local:4010');
    ff.route('GET /a', () => jsonResponse(200, { id: '1', kind: 'A' }));
    ff.route('GET /b', () => jsonResponse(200, { id: '1', kind: 'A' }));
    const c = client();
    track(c.request({ method: 'GET', path: '/a' }, item));
    track(c.request({ method: 'GET', path: '/b' }, item));
    await clock.advance(0);
    expect(ff.calls.map((x) => x.url.startsWith('https://mock.local:4010/api/v1/'))).toEqual([true, true]);
  });

  it('TC-NET-051 TC-AUTH-055 REQ-NET-002 loopback 외 http·경로가 붙은 기준 주소는 파싱 단계에서 ConfigError이고 요청도 Authorization도 나가지 않는다', () => {
    const { ff } = makeApiEnv(memberSession());
    for (const baseUrl of ['http://mock.local', 'https://mock.local/api/v1/', 'ftp://mock.local']) {
      expect(() => parseApiBaseUrl(baseUrl)).toThrow(ConfigError);
    }
    expect(ff.calls).toHaveLength(0);
  });

  it('REQ-NET-017 REQ-NET-025 /auth/*, /banners에는 유효한 세션이 있어도 Authorization을 붙이지 않고, 그 밖 API에는 붙인다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    ff.route('POST /auth/logout', () => emptyResponse(204));
    ff.route('POST /auth/refresh', () => emptyResponse(204));
    ff.route('GET /banners', () => jsonResponse(200, { id: '1', kind: 'A' }));
    ff.route('GET /notifications', () => jsonResponse(200, { id: '1', kind: 'A' }));
    const c = client();
    track(c.requestVoid({ method: 'POST', path: '/auth/logout', body: { refreshToken: 'fixture-refresh-token-1' } }));
    track(c.request({ method: 'GET', path: '/banners' }, item));
    track(c.request({ method: 'GET', path: '/notifications' }, item));
    await clock.advance(0);
    expect(ff.callsTo('POST /auth/logout')[0]!.headers['authorization']).toBeUndefined();
    expect(ff.callsTo('GET /banners')[0]!.headers['authorization']).toBeUndefined();
    expect(ff.callsTo('GET /notifications')[0]!.headers['authorization']).toBe('Bearer fixture-access-token-1');
  });
});

describe('응답 해석', () => {
  it('TC-NET-005 200인데 JSON이 깨졌으면 InvalidResponseError다(크래시 없음)', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => textResponse(200, '{"id": ', 'application/json'));
    const result = track(client().request({ method: 'GET', path: '/x' }, item));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-006 본문이 필요한 API가 200 빈 본문이면 InvalidResponseError다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => emptyResponse(200));
    const result = track(client().request({ method: 'GET', path: '/x' }, item));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-007 204는 성공이고 본문 디코딩을 시도하지 않는다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /auth/logout', () => emptyResponse(204));
    const result = track(client().requestVoid({ method: 'POST', path: '/auth/logout', body: { refreshToken: 'r' } }));
    await clock.advance(0);
    expect(result.state).toBe('fulfilled');
  });

  it('TC-NET-007 requestVoid는 2xx 본문이 있어도 디코딩하지 않는다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('PATCH /notifications/read-all', () => textResponse(200, 'not json', 'text/plain'));
    const result = track(client().requestVoid({ method: 'PATCH', path: '/notifications/read-all' }));
    await clock.advance(0);
    expect(result.state).toBe('fulfilled');
  });

  it('TC-NET-008 알 수 없는 JSON 필드는 무시한다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => jsonResponse(200, { id: '1', kind: 'A', future: [1, 2, 3] }));
    const result = track(client().request({ method: 'GET', path: '/x' }, item));
    await clock.advance(0);
    expect(result.value).toEqual({ id: '1', kind: 'A' });
  });

  it('TC-NET-009 TC-NET-010 정의되지 않은 enum 값·필수 필드 누락은 InvalidResponseError다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /enum', () => jsonResponse(200, { id: '1', kind: 'Z' }));
    ff.route('GET /missing', () => jsonResponse(200, { kind: 'A' }));
    const a = track(client().request({ method: 'GET', path: '/enum' }, item));
    const b = track(client().request({ method: 'GET', path: '/missing' }, item));
    await clock.advance(0);
    expect(a.error).toBeInstanceOf(InvalidResponseError);
    expect(b.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-011 Content-Type이 JSON이 아닌 200 응답은 InvalidResponseError다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => textResponse(200, '{"id":"1","kind":"A"}', 'text/plain'));
    const result = track(client().request({ method: 'GET', path: '/x' }, item));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(InvalidResponseError);
  });

  it('TC-NET-011 Content-Type에 charset이 붙은 JSON은 허용한다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => textResponse(200, '{"id":"1","kind":"A"}', 'application/json; charset=utf-8'));
    const result = track(client().request({ method: 'GET', path: '/x' }, item));
    await clock.advance(0);
    expect(result.state).toBe('fulfilled');
  });
});

describe('오류 응답', () => {
  it('TC-NET-001 400 오류 바디를 ApiError(status, errorCode, message)로 던진다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /feedbacks', () => jsonResponse(400, errorBodies.business400));
    const result = track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: { content: 'x' } }));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR', message: '조회 조건이 올바르지 않습니다.' });
  });

  it('TC-NET-002 TC-NET-003 알 수 없는 errorCode는 BUSINESS_ERROR로 던진다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /feedbacks', () => jsonResponse(400, errorBodies.unknownCode), () => jsonResponse(400, errorBodies.resourceStateChanged));
    const a = track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    const b = track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    await clock.advance(0);
    expect(a.error).toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
    expect(b.error).toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
  });

  it('TC-NET-004 HTML 게이트웨이·빈 본문 오류도 status를 보존한 ApiError다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /feedbacks', () => textResponse(502, gatewayHtml, 'text/html'), () => emptyResponse(500));
    const a = track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    const b = track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    await clock.advance(0);
    expect(a.error).toMatchObject({ name: 'ApiError', status: 502, errorCode: null });
    expect(b.error).toMatchObject({ name: 'ApiError', status: 500, errorCode: null });
  });

  it('TC-NET-032 403 FORBIDDEN은 멱등 GET이어도 다시 보내지 않고 세션도 건드리지 않는다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /users/me', () => jsonResponse(403, errorBodies.forbiddenBanned));
    const result = track(client().request({ method: 'GET', path: '/users/me' }, item));
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.error).toMatchObject({ status: 403, errorCode: 'FORBIDDEN' });
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-NET-033 TC-NET-034 TC-NET-035 필터 403, 404 API 없음, 400 검증 오류도 ApiError로 던진다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /a', () => jsonResponse(403, errorBodies.forbiddenNoPermission));
    ff.route('POST /b', () => jsonResponse(404, errorBodies.notFoundApi));
    ff.route('POST /c', () => jsonResponse(400, errorBodies.validationFormat));
    const rs = (['a', 'b', 'c'] as const).map((p) => track(client().requestVoid({ method: 'POST', path: `/${p}`, body: {} })));
    await clock.advance(0);
    expect(rs.map((r) => (r.error as ApiError).status)).toEqual([403, 404, 400]);
  });

  it('TC-NET-036 500 INTERNAL_ERROR는 ApiError(500)이고 GET은 0.5초, 1초 뒤 재시도한 다음에 던진다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => jsonResponse(500, errorBodies.internal500));
    const result = track(client().request({ method: 'GET', path: '/x' }, item));
    await clock.advance(RETRY_BACKOFF_MS[0] + RETRY_BACKOFF_MS[1]);
    expect(ff.calls).toHaveLength(3);
    expect(result.error).toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
  });
});

describe('재시도 정책 선택', () => {
  it.each([
    ['GET', '/notifications'],
    ['PUT', '/push-devices/current'],
    ['DELETE', '/users/me'],
    ['PATCH', '/notification-settings'],
    ['POST', '/posts/uploads'],
    ['POST', '/users/me/signature/uploads'],
  ] as const)('TC-NET-037 멱등 %s %s는 5xx에 총 3시도한다', async (method, path) => {
    const { ff, client, clock } = makeApiEnv();
    ff.route(`${method} ${path}`, () => jsonResponse(500, errorBodies.internal500));
    const result = track(client().requestVoid({ method, path, body: method === 'GET' ? undefined : {} }));
    await clock.advance(5_000);
    expect(ff.calls).toHaveLength(3);
    expect(result.state).toBe('rejected');
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
  ])('TC-NET-038 비멱등 POST %s는 네트워크 오류·5xx에도 자동 재시도 0회다', async (path) => {
    for (const responder of [networkFailure, () => jsonResponse(500, errorBodies.internal500)]) {
      const { ff, client, clock } = makeApiEnv();
      ff.route(`POST ${path}`, responder);
      const result = track(client().requestVoid({ method: 'POST', path, body: {} }));
      await clock.advance(10_000);
      expect(ff.callsTo(`POST ${path}`)).toHaveLength(1);
      expect(result.state).toBe('rejected');
    }
  });

  it('TC-NET-042 비멱등 POST가 429여도 재시도 없이 ApiError(429)를 던진다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /feedbacks', () => emptyResponse(429, { 'retry-after': '2' }));
    const result = track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(1);
    expect(result.error).toMatchObject({ name: 'ApiError', status: 429 });
  });

  it('TC-NET-040 멱등 GET이 503 + Retry-After: 2면 2초 뒤 재시도해 성공한다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => emptyResponse(503, { 'retry-after': '2' }), () => jsonResponse(200, { id: '1', kind: 'A' }));
    const result = track(client().request({ method: 'GET', path: '/x' }, item));
    await clock.advance(1_999);
    expect(ff.calls).toHaveLength(1);
    await clock.advance(1);
    expect(result.value).toEqual({ id: '1', kind: 'A' });
  });
});

describe('네트워크 오류·타임아웃·취소', () => {
  it('TC-NET-045 연결 실패는 NetworkError다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('POST /feedbacks', networkFailure);
    const result = track(client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(NetworkError);
  });

  it('TC-NET-043 일반 API는 응답 15초가 한계다(14.9초 성공, 15.1초 NetworkError)', async () => {
    const fast = makeApiEnv();
    fast.ff.route('POST /feedbacks', async () => {
      await fast.clock.sleep(14_900);
      return emptyResponse(204);
    });
    const a = track(fast.client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    await fast.clock.advance(14_900);
    expect(a.state).toBe('fulfilled');

    const slow = makeApiEnv();
    slow.ff.route('POST /feedbacks', async () => {
      await slow.clock.sleep(15_100);
      return emptyResponse(204);
    });
    const b = track(slow.client().requestVoid({ method: 'POST', path: '/feedbacks', body: {} }));
    await slow.clock.advance(15_000);
    expect(b.error).toMatchObject({ name: 'NetworkError', kind: 'timeout' });
  });

  it('TC-NET-048 요청을 취소하면 AbortError가 그대로 전파된다(ApiError·NetworkError로 바뀌지 않음)', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => new Promise<Response>(() => {}));
    const ctrl = new AbortController();
    const result = track(client().request({ method: 'GET', path: '/x', signal: ctrl.signal }, item));
    await clock.advance(100);
    ctrl.abort();
    await clock.advance(0);
    expect(isCancellation(result.error)).toBe(true);
  });

  it('TC-NET-049 재시도 대기 중 취소하면 더 이상 요청하지 않는다', async () => {
    const { ff, client, clock } = makeApiEnv();
    ff.route('GET /x', () => jsonResponse(500, errorBodies.internal500));
    const ctrl = new AbortController();
    const result = track(client().request({ method: 'GET', path: '/x', signal: ctrl.signal }, item));
    await clock.advance(100);
    ctrl.abort();
    await clock.advance(10_000);
    expect(ff.calls).toHaveLength(1);
    expect(isCancellation(result.error)).toBe(true);
  });
});
