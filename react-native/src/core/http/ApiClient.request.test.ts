import { CancelledError, HttpError, InvalidResponseError } from './ApiError';
import {
  BASE_URL,
  createNetHarness,
  refreshOk,
  unauthorized,
  type NetHarness,
} from './__testing__/createNetHarness';
import { fixtureResponse } from './__testing__/loadFixture';
import { deferred, json, noContent, raw } from './__testing__/FakeTransport';
import type { HttpResponse } from './HttpTransport';

const identity = (value: unknown) => value;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const UPPER = '3F1C2A52-AAAA-4BBB-8CCC-DDDDEEEEFFFF';
const LOWER = UPPER.toLowerCase();

describe('ApiClient 요청 구성', () => {
  let h: NetHarness;
  beforeEach(() => {
    h = createNetHarness();
  });

  it('REQ-NET-003 요청 URL은 base URL 아래 경로로 나간다', async () => {
    h.transport.script(json(200, {}));
    await h.api.requestJson({ method: 'GET', path: '/topics' }, identity);
    expect(h.transport.requests[0].url).toBe(`${BASE_URL}topics`);
  });

  it('TC-NET-058 모든 요청은 주입된 baseUrl로만 나간다(하드코딩된 개발 서버 주소 없음)', async () => {
    await h.signIn();
    h.transport.respond(() => json(200, {}));
    await h.api.requestJson({ method: 'GET', path: '/topics' }, identity);
    await h.api.requestVoid({ method: 'DELETE', path: '/users/me' });
    for (const request of h.transport.requests) {
      expect(request.url.startsWith(BASE_URL)).toBe(true);
      expect(request.url).not.toContain('chalkak-dev.pysun.kr');
    }
  });

  it('TC-NET-052 경로·쿼리·바디의 UUID는 소문자 정규형으로 나간다', async () => {
    await h.signIn();
    h.transport.respond(() => json(200, {}));
    await h.api.requestJson(
      {
        method: 'POST',
        path: `/posts/${UPPER}/ai-review`,
        query: { topicId: UPPER },
        body: { photoUploadId: UPPER, nested: { id: UPPER }, title: 'ABC' },
      },
      identity,
    );
    const request = h.transport.requests[0];
    expect(request.url).toContain(`/posts/${LOWER}/ai-review`);
    expect(request.url).toContain(`topicId=${LOWER}`);
    expect(request.url).not.toContain(UPPER);
    expect(JSON.parse(request.body as string)).toEqual({
      photoUploadId: LOWER,
      nested: { id: LOWER },
      title: 'ABC',
    });
  });

  it('TC-NET-053 쿼리는 date ASCII, 정수 10진수, sort 소문자로 직렬화되고 undefined는 생략된다', async () => {
    await h.signIn();
    h.transport.respond(() => json(200, {}));
    await h.api.requestJson(
      {
        method: 'GET',
        path: '/posts',
        query: { date: '2026-10-27', page: 1, pageSize: 20, sort: 'latest', randomSeed: undefined },
      },
      identity,
    );
    const url = new URL(h.transport.requests[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      date: '2026-10-27',
      page: '1',
      pageSize: '20',
      sort: 'latest',
    });
  });

  it('TC-NET-054 JSON 바디가 있으면 Content-Type/Accept가 application/json이다', async () => {
    await h.signIn();
    h.transport.respond(() => json(200, {}));
    await h.api.requestJson(
      { method: 'POST', path: '/feedbacks', body: { content: 'hi' } },
      identity,
    );
    const request = h.transport.requests[0];
    expect(request.headers['Content-Type']).toBe('application/json');
    expect(request.headers.Accept).toBe('application/json');
    expect(request.body).toBe(JSON.stringify({ content: 'hi' }));
  });

  it.each([
    ['POST', '/posts/uploads'],
    ['PUT', '/push-devices/current'],
    ['DELETE', '/users/me'],
    ['GET', '/topics'],
  ] as const)(
    'TC-NET-054 본문 없는 %s %s 는 본문과 Content-Type을 보내지 않는다',
    async (method, path) => {
      await h.signIn();
      h.transport.respond(() => json(200, {}));
      await h.api.requestVoid({ method, path });
      const request = h.transport.requests[0];
      expect(request.body).toBeUndefined();
      expect(request.headers['Content-Type']).toBeUndefined();
      expect(request.headers.Accept).toBe('application/json');
    },
  );

  describe('presigned PUT', () => {
    const upload = (signal?: AbortSignal) =>
      h.api.uploadToPresignedUrl({
        url: 'https://s3.test/bucket/key?X-Amz-Signature=SECRETSIG&X-Amz-Credential=abc',
        contentType: 'image/webp',
        body: new Uint8Array([1, 2, 3]),
        signal,
      });

    it('TC-NET-044 Authorization·Accept 없이 정책의 Content-Type만 보내고 타임아웃은 60초다', async () => {
      // fixture: common/presigned-put__ok.json
      await h.signIn();
      h.transport.script(fixtureResponse('common/presigned-put__ok'));
      await upload();
      const request = h.transport.requests[0];
      expect(request.method).toBe('PUT');
      expect(request.headers).toEqual({ 'Content-Type': 'image/webp' });
      expect(request.options.responseTimeoutMs).toBe(60_000);
      expect(request.url).toContain('X-Amz-Signature=SECRETSIG');
    });

    it('TC-NET-044 사인 PNG도 정책 Content-Type(image/png)으로 보낸다', async () => {
      h.transport.script(noContent());
      await h.api.uploadToPresignedUrl({
        url: 'https://s3.test/sig?X-Amz-Signature=x',
        contentType: 'image/png',
        body: new Uint8Array([9]),
      });
      expect(h.transport.requests[0].headers['Content-Type']).toBe('image/png');
    });

    it('TC-NET-044 저장소가 403(XML)을 주면 HttpError다', async () => {
      h.transport.script(raw(403, '<Error><Code>AccessDenied</Code></Error>', 'application/xml'));
      await expect(upload()).rejects.toMatchObject({ status: 403, errorCode: null });
    });

    it('TC-NET-044 presigned PUT의 401은 토큰 갱신을 시도하지 않는다', async () => {
      await h.signIn();
      h.transport.script(raw(401, ''));
      await expect(upload()).rejects.toBeInstanceOf(HttpError);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    });

    it('TC-NET-048 업로드 도중 취소하면 CancelledError다', async () => {
      const gate = deferred<HttpResponse>();
      h.transport.respond(() => gate.promise);
      const controller = new AbortController();
      const call = upload(controller.signal).catch((e) => e);
      await flush();
      controller.abort();
      expect(await call).toBeInstanceOf(CancelledError);
    });
  });

  describe('취소', () => {
    it('TC-NET-048 요청 도중 AbortSignal 취소는 CancelledError이고 NetworkError로 바뀌지 않으며 재시도하지 않는다', async () => {
      const gate = deferred<HttpResponse>();
      h.transport.respond(() => gate.promise);
      const controller = new AbortController();
      const call = h.api
        .requestJson({ method: 'GET', path: '/topics', signal: controller.signal }, identity)
        .catch((e) => e);
      await flush();
      controller.abort();
      const error = await call;
      expect(error).toBeInstanceOf(CancelledError);
      expect(h.transport.requests).toHaveLength(1);
      expect(h.sleeper.calls).toEqual([]);
    });

    it('TC-NET-048 transport가 DOMException 형태 AbortError를 던져도 CancelledError로 매핑한다', async () => {
      const controller = new AbortController();
      h.transport.respond(() => {
        controller.abort();
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      });
      await expect(
        h.api.requestJson({ method: 'GET', path: '/topics', signal: controller.signal }, identity),
      ).rejects.toBeInstanceOf(CancelledError);
    });

    it('TC-NET-048 이미 취소된 signal이면 요청을 보내지 않는다', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        h.api.requestJson({ method: 'GET', path: '/topics', signal: controller.signal }, identity),
      ).rejects.toBeInstanceOf(CancelledError);
      expect(h.transport.requests).toHaveLength(0);
    });

    it('TC-NET-048 취소는 응답 해석 오류(InvalidResponse)로도 바뀌지 않는다', async () => {
      const gate = deferred<HttpResponse>();
      h.transport.respond(() => gate.promise);
      const controller = new AbortController();
      const call = h.api
        .requestJson({ method: 'GET', path: '/topics', signal: controller.signal }, identity)
        .catch((e) => e);
      await flush();
      controller.abort();
      gate.resolve(raw(200, 'not json', 'application/json'));
      const error = await call;
      expect(error).not.toBeInstanceOf(InvalidResponseError);
      expect(error).toBeInstanceOf(CancelledError);
    });
  });

  describe('로그 위생', () => {
    it('TC-NET-055 로그에 토큰·idToken·rawNonce·signupToken·FCM 토큰·presigned 쿼리가 남지 않는다', async () => {
      await h.signIn({ accessToken: 'SECRET-ACCESS', refreshToken: 'SECRET-REFRESH' });
      h.transport.respond((req) => {
        const url = new URL(req.url);
        if (url.pathname.endsWith('/auth/refresh')) return refreshOk();
        if (url.pathname.endsWith('/auth/social-login')) {
          return json(500, {
            errorCode: 'INTERNAL_ERROR',
            message: 'idToken SECRET-ID rawNonce SECRET-NONCE',
          });
        }
        if (url.pathname.endsWith('/push-devices/current'))
          return json(500, { errorCode: 'INTERNAL_ERROR', message: 'x' });
        if (url.host === 's3.test') return raw(403, '<Error/>', 'application/xml');
        return req.headers.Authorization === 'Bearer SECRET-ACCESS'
          ? unauthorized()
          : json(200, {});
      });
      await h.api
        .requestJson({ method: 'GET', path: '/notifications' }, identity)
        .catch(() => undefined);
      await h.api
        .requestJson(
          {
            method: 'POST',
            path: '/auth/social-login',
            body: { provider: 'KAKAO', idToken: 'SECRET-ID', rawNonce: 'SECRET-NONCE' },
          },
          identity,
        )
        .catch(() => undefined);
      await h.api
        .requestVoid({
          method: 'PUT',
          path: '/push-devices/current',
          body: { fcmToken: 'SECRET-FCM' },
        })
        .catch(() => undefined);
      await h.api
        .requestJson(
          { method: 'POST', path: '/auth/social-signup', body: { signupToken: 'SECRET-SIGNUP' } },
          identity,
        )
        .catch(() => undefined);
      await h.api
        .uploadToPresignedUrl({
          url: 'https://s3.test/key?X-Amz-Signature=SECRET-SIG',
          contentType: 'image/webp',
          body: new Uint8Array([1]),
        })
        .catch(() => undefined);

      expect(h.logger.entries.length).toBeGreaterThan(0);
      const dump = h.logger.dump();
      for (const secret of [
        'SECRET-ACCESS',
        'SECRET-REFRESH',
        'SECRET-ID',
        'SECRET-NONCE',
        'SECRET-FCM',
        'SECRET-SIGNUP',
        'SECRET-SIG',
        'X-Amz-Signature',
        'access-2',
        'refresh-2',
      ]) {
        expect(dump).not.toContain(secret);
      }
    });
  });
});
