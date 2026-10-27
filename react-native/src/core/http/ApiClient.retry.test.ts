import { CancelledError, HttpError, NetworkError, TimeoutError } from './ApiError';
import {
  BUSINESS_BODY,
  INTERNAL_BODY,
  createNetHarness,
  type NetHarness,
} from './__testing__/createNetHarness';
import { json, networkFailure, timeoutFailure } from './__testing__/FakeTransport';
import { fixtureResponse } from './__testing__/loadFixture';
import { MAX_RETRY_AFTER_MS } from './RequestPolicy';

const identity = (raw: unknown) => raw;
const ok = () => json(200, { ok: true });
const serverError = () => json(500, INTERNAL_BODY);

describe('ApiClient 재시도', () => {
  let h: NetHarness;
  beforeEach(async () => {
    h = createNetHarness();
    await h.signIn();
  });

  const get = (signal?: AbortSignal) =>
    h.api.requestJson({ method: 'GET', path: '/notifications', signal }, identity);

  describe('멱등 요청', () => {
    it.each([
      ['5xx', () => serverError()],
      ['연결 실패', () => networkFailure()],
      ['타임아웃', () => timeoutFailure()],
    ])(
      'TC-NET-037 %s이면 0.5초, 1초 대기로 총 3시도 뒤 마지막 오류를 돌려준다',
      async (_n, fail) => {
        h.transport.script(fail());
        await expect(get()).rejects.toBeDefined();
        expect(h.transport.requests).toHaveLength(3);
        expect(h.sleeper.calls).toEqual([500, 1000]);
      },
    );

    it('TC-NET-037 재시도 중 성공하면 거기서 멈추고 성공 값을 돌려준다', async () => {
      h.transport.script(serverError(), networkFailure(), ok());
      await expect(get()).resolves.toEqual({ ok: true });
      expect(h.transport.requests).toHaveLength(3);
      expect(h.sleeper.calls).toEqual([500, 1000]);
    });

    it('TC-NET-037 첫 재시도에서 성공하면 0.5초만 기다린다', async () => {
      h.transport.script(timeoutFailure(), ok());
      await get();
      expect(h.sleeper.calls).toEqual([500]);
    });

    it.each([
      ['PUT', '/posts/abc', { title: 't' }],
      ['DELETE', '/posts/abc', undefined],
      ['PATCH', '/notification-settings', { enabled: true }],
      ['POST', '/posts/uploads', undefined],
      ['POST', '/users/me/signature/uploads', undefined],
    ] as const)('TC-NET-037 %s %s 도 재시도한다', async (method, path, body) => {
      h.transport.script(serverError(), ok());
      await h.api.requestVoid({ method, path, body });
      expect(h.transport.requests).toHaveLength(2);
    });

    it('TC-NET-036 500 INTERNAL_ERROR 최종 실패는 HttpError로 전달된다', async () => {
      h.transport.script(serverError());
      await expect(get()).rejects.toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
    });

    it.each([400, 403, 404])(
      'TC-NET-039 멱등 요청이라도 %d는 재시도하지 않는다',
      async (status) => {
        h.transport.script(json(status, BUSINESS_BODY));
        await expect(get()).rejects.toBeInstanceOf(HttpError);
        expect(h.transport.requests).toHaveLength(1);
        expect(h.sleeper.calls).toEqual([]);
      },
    );
  });

  describe('비멱등 요청', () => {
    const cases = [
      ['POST', '/posts'],
      ['POST', '/feedbacks'],
      ['POST', '/posts/3f1c2a52-1111-4222-8333-444455556666/ai-review'],
      ['POST', '/auth/refresh'],
      ['POST', '/auth/social-login'],
      ['POST', '/auth/social-signup/signature/uploads'],
      ['POST', '/auth/social-signup'],
      ['POST', '/auth/logout'],
    ] as const;

    it.each(cases)('TC-NET-038 %s %s 는 5xx에도 재시도 0회', async (method, path) => {
      h.transport.script(serverError());
      await expect(h.api.requestVoid({ method, path, body: {} })).rejects.toBeInstanceOf(HttpError);
      expect(h.transport.requests).toHaveLength(1);
      expect(h.sleeper.calls).toEqual([]);
    });

    it.each(cases)('TC-NET-038 %s %s 는 연결 실패에도 재시도 0회', async (method, path) => {
      h.transport.script(networkFailure());
      await expect(h.api.requestVoid({ method, path, body: {} })).rejects.toBeInstanceOf(
        NetworkError,
      );
      expect(h.transport.requests).toHaveLength(1);
    });

    it('TC-NET-042 비멱등 POST가 429여도 재시도 없이 실패한다', async () => {
      // fixture: common/error__rate-limited-429.json
      h.transport.script(fixtureResponse('common/error__rate-limited-429'));
      await expect(
        h.api.requestVoid({ method: 'POST', path: '/posts', body: {} }),
      ).rejects.toMatchObject({ status: 429 });
      expect(h.transport.requests).toHaveLength(1);
      expect(h.sleeper.calls).toEqual([]);
    });

    it('TC-NET-040 비멱등 요청은 503 + Retry-After여도 기다리지 않고 실패한다', async () => {
      h.transport.script(json(503, INTERNAL_BODY, { 'retry-after': '2' }));
      await expect(
        h.api.requestVoid({ method: 'POST', path: '/feedbacks', body: {} }),
      ).rejects.toMatchObject({ status: 503 });
      expect(h.sleeper.calls).toEqual([]);
    });
  });

  describe('Retry-After', () => {
    it.each([
      ['503', 503],
      ['429', 429],
    ])(
      'TC-NET-040 %s + Retry-After 2초면 백오프 대신 2초 기다린 뒤 재시도한다',
      async (_n, status) => {
        const name =
          status === 503
            ? 'common/error__service-unavailable-503'
            : 'common/error__rate-limited-429';
        h.transport.script(fixtureResponse(name), ok());
        await expect(get()).resolves.toEqual({ ok: true });
        expect(h.sleeper.calls).toEqual([2000]);
      },
    );

    it('TC-NET-040 HTTP 날짜 형식 Retry-After도 따른다', async () => {
      const at = new Date(h.clock.now().getTime() + 3000).toUTCString();
      h.transport.script(json(503, INTERNAL_BODY, { 'retry-after': at }), ok());
      await get();
      expect(h.sleeper.calls).toEqual([3000]);
    });

    it('TC-NET-040 Retry-After 재시도도 최대 2회 안에 든다(총 3시도)', async () => {
      h.transport.script(json(503, INTERNAL_BODY, { 'retry-after': '1' }));
      await expect(get()).rejects.toMatchObject({ status: 503 });
      expect(h.transport.requests).toHaveLength(3);
      expect(h.sleeper.calls).toEqual([1000, 1000]);
    });

    it.each(['-5', 'soon', ''])(
      'TC-NET-041 비정상 Retry-After(%j)는 무시하고 기본 백오프를 쓴다',
      async (value) => {
        // fixture: common/error__service-unavailable-503-bad-retry-after.json
        h.transport.script(json(503, INTERNAL_BODY, { 'retry-after': value }), ok());
        await get();
        expect(h.sleeper.calls).toEqual([500]);
      },
    );

    it('TC-NET-041 상한(MAX_RETRY_AFTER_MS)보다 긴 Retry-After는 자르지 않고 재시도를 포기해 실패로 돌려준다', async () => {
      h.transport.script(json(503, INTERNAL_BODY, { 'retry-after': '86400' }), ok());
      await expect(get()).rejects.toMatchObject({ status: 503 });
      expect(h.transport.requests).toHaveLength(1);
      expect(h.sleeper.calls).toEqual([]);
    });

    it('TC-NET-041 상한과 같은 Retry-After는 기다린다', async () => {
      h.transport.script(
        json(503, INTERNAL_BODY, { 'retry-after': String(MAX_RETRY_AFTER_MS / 1000) }),
        ok(),
      );
      await get();
      expect(h.sleeper.calls).toEqual([MAX_RETRY_AFTER_MS]);
    });

    it('TC-NET-042 Retry-After 없는 429는 멱등 요청이라도 재시도하지 않는다', async () => {
      h.transport.script(fixtureResponse('common/error__rate-limited-429', { 'Retry-After': '' }));
      await expect(get()).rejects.toMatchObject({ status: 429 });
      expect(h.transport.requests).toHaveLength(1);
    });
  });

  describe('타임아웃 옵션', () => {
    it('TC-NET-043 일반 요청은 연결 10초, 응답 15초 한도를 transport에 전달한다', async () => {
      h.transport.script(ok());
      await get();
      expect(h.transport.requests[0].options).toMatchObject({
        connectTimeoutMs: 10_000,
        responseTimeoutMs: 15_000,
      });
    });

    it('TC-NET-043 transport가 던진 TimeoutError는 NetworkError 계열로 끝까지 전달된다', async () => {
      h.transport.script(timeoutFailure());
      await expect(get()).rejects.toBeInstanceOf(TimeoutError);
    });
  });

  describe('취소', () => {
    it('TC-NET-049 백오프 대기 중 취소하면 즉시 중단하고 추가 요청을 보내지 않는다', async () => {
      const manual = createNetHarness({ manualSleeper: true });
      await manual.signIn();
      manual.transport.script(serverError(), ok());
      const controller = new AbortController();
      const promise = manual.api.requestJson(
        { method: 'GET', path: '/notifications', signal: controller.signal },
        identity,
      );
      const settled = promise.catch((e) => e);
      await new Promise((r) => setImmediate(r));
      expect(manual.sleeper.waiting).toBe(1);
      controller.abort();
      expect(await settled).toBeInstanceOf(CancelledError);
      expect(manual.transport.requests).toHaveLength(1);
    });
  });
});
