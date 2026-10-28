import {
  AuthenticationRequiredError,
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  ReauthenticationRequiredError,
  TimeoutError,
} from './ApiError';
import {
  REFRESH_SUCCESS,
  createNetHarness,
  reauth,
  refreshOk,
  unauthorized,
  type NetHarness,
} from './__testing__/createNetHarness';
import { deferred, json, networkFailure, timeoutFailure } from './__testing__/FakeTransport';
import type { HttpRequest, HttpResponse } from './HttpTransport';

const identity = (raw: unknown) => raw;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const path = (req: HttpRequest) => new URL(req.url).pathname.replace('/api/v1', '');
const bearer = (req: HttpRequest) => req.headers.Authorization;
const OK_BODY = { ok: true };

describe('ApiClient 인증 헤더와 401 갱신', () => {
  let h: NetHarness;
  beforeEach(() => {
    h = createNetHarness();
  });

  const getNotifications = (signal?: AbortSignal) =>
    h.api.requestJson({ method: 'GET', path: '/notifications', signal }, identity);

  /** access-1은 401, access-2는 200, refresh는 성공 */
  function useRotatingServer(
    options: { refresh?: () => HttpResponse | Promise<HttpResponse> } = {},
  ) {
    h.transport.respond((req) => {
      if (path(req) === '/auth/refresh') return (options.refresh ?? refreshOk)();
      return bearer(req) === 'Bearer access-2' ? json(200, OK_BODY) : unauthorized();
    });
  }

  describe('응답 도착 시 세션 확인', () => {
    it('인증 요청의 2xx 응답이 로그아웃 뒤에 도착하면 CancelledError로 버린다', async () => {
      await h.signIn();
      const gate = deferred<void>();
      h.transport.respond(async () => {
        await gate.promise;
        return json(200, OK_BODY);
      });
      const call = getNotifications();
      await flush();
      await h.sessionStore.clear();
      gate.resolve();
      await expect(call).rejects.toBeInstanceOf(CancelledError);
    });

    it('다른 계정으로 바뀐 뒤 도착한 응답도 버린다', async () => {
      await h.signIn();
      const gate = deferred<void>();
      h.transport.respond(async () => {
        await gate.promise;
        return json(200, OK_BODY);
      });
      const call = getNotifications();
      await flush();
      await h.signIn({ userId: 'user-b', refreshToken: 'refresh-b' });
      gate.resolve();
      await expect(call).rejects.toBeInstanceOf(CancelledError);
    });

    it('오류 응답(HttpError)과 네트워크 오류도 로그아웃 뒤에 도착하면 CancelledError다', async () => {
      for (const failure of [() => json(500, { errorCode: 'INTERNAL_ERROR' }), networkFailure()]) {
        h = createNetHarness();
        await h.signIn();
        const gate = deferred<void>();
        h.transport.respond(async () => {
          await gate.promise;
          if (typeof failure !== 'function') throw failure;
          return failure();
        });
        const call = getNotifications();
        await flush();
        await h.sessionStore.clear();
        gate.resolve();
        await expect(call).rejects.toBeInstanceOf(CancelledError);
      }
    });

    it('Authorization을 붙이지 않는 요청(level none)은 세션이 바뀌어도 결과를 그대로 돌려준다', async () => {
      await h.signIn();
      const gate = deferred<void>();
      h.transport.respond(async () => {
        await gate.promise;
        return json(200, OK_BODY);
      });
      const call = h.api.requestJson(
        { method: 'POST', path: '/auth/social-login', body: {} },
        identity,
      );
      await flush();
      await h.sessionStore.clear();
      gate.resolve();
      await expect(call).resolves.toEqual(OK_BODY);
    });

    it('같은 계정의 토큰 갱신 뒤 재전송된 응답은 통과한다', async () => {
      await h.signIn();
      useRotatingServer();
      await expect(getNotifications()).resolves.toEqual(OK_BODY);
    });

    it('게스트·세션 없음 요청은 확인하지 않는다', async () => {
      h.transport.script(json(200, OK_BODY));
      await expect(getNotifications()).resolves.toEqual(OK_BODY);
    });
  });

  describe('헤더 부착', () => {
    it('TC-NET-014 만료된 access token은 Authorization을 붙이지 않고 서버 401로 갱신 경로에 들어간다', async () => {
      await h.signIn({ accessTokenExpiresAt: new Date(h.clock.now().getTime() - 1000) });
      useRotatingServer();
      await expect(getNotifications()).resolves.toEqual(OK_BODY);
      expect(bearer(h.transport.requests[0])).toBeUndefined();
      expect(path(h.transport.requests[1])).toBe('/auth/refresh');
      expect(bearer(h.transport.requests[2])).toBe('Bearer access-2');
    });

    it('만료되지 않은 access token은 Bearer로 붙인다', async () => {
      await h.signIn();
      h.transport.script(json(200, OK_BODY));
      await getNotifications();
      expect(bearer(h.transport.requests[0])).toBe('Bearer access-1');
    });

    it('TC-NET-031 GET /banners는 로그인 상태여도 Authorization을 붙이지 않고 401이어도 갱신하지 않는다', async () => {
      await h.signIn();
      h.transport.script(unauthorized());
      await expect(
        h.api.requestJson({ method: 'GET', path: '/banners' }, identity),
      ).rejects.toMatchObject({
        status: 401,
      });
      expect(bearer(h.transport.requests[0])).toBeUndefined();
      expect(h.transport.requests).toHaveLength(1);
      expect((await h.sessionStore.load()).kind).toBe('authenticated');
    });

    it('/auth/* 요청에는 Authorization을 붙이지 않는다', async () => {
      await h.signIn();
      h.transport.script(json(200, REFRESH_SUCCESS));
      await h.api.requestVoid({
        method: 'POST',
        path: '/auth/logout',
        body: { refreshToken: 'refresh-1' },
      });
      expect(bearer(h.transport.requests[0])).toBeUndefined();
    });

    it('게스트의 GET /topics는 헤더 없이 나간다', async () => {
      await h.sessionStore.enterGuest();
      h.transport.script(json(200, OK_BODY));
      await h.api.requestJson({ method: 'GET', path: '/topics' }, identity);
      expect(bearer(h.transport.requests[0])).toBeUndefined();
    });
  });

  describe('갱신 대상 판정', () => {
    it('TC-NET-013 토큰 없는 게스트 요청의 401은 갱신하지 않고 세션도 지우지 않는다', async () => {
      await h.sessionStore.enterGuest();
      h.transport.script(unauthorized());
      await expect(getNotifications()).rejects.toMatchObject({
        status: 401,
        errorCode: 'UNAUTHORIZED',
      });
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
      expect((await h.sessionStore.load()).kind).toBe('guest');
      expect(h.emitted).toEqual([]);
    });

    it('TC-NET-013 세션이 아예 없어도(none) 갱신하지 않는다', async () => {
      h.transport.script(unauthorized());
      await expect(getNotifications()).rejects.toBeInstanceOf(HttpError);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    });

    it('REQ-NET-018 refresh token이 이미 만료된 세션은 갱신하지 않고 AuthenticationRequiredError다(세션 유지)', async () => {
      await h.signIn({ refreshTokenExpiresAt: new Date(h.clock.now().getTime() - 1) });
      h.transport.script(unauthorized());
      await expect(getNotifications()).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect((await h.sessionStore.load()).kind).toBe('authenticated');
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    });

    it('REQ-NET-018 401이어도 errorCode가 UNAUTHORIZED가 아니면 갱신하지 않는다', async () => {
      await h.signIn();
      h.transport.script(json(401, { errorCode: 'SOMETHING_NEW', message: 'x' }));
      await expect(getNotifications()).rejects.toBeInstanceOf(HttpError);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    });

    it('/auth/social-login의 401 UNAUTHORIZED는 갱신하지 않는다', async () => {
      await h.signIn();
      h.transport.script(unauthorized());
      await expect(
        h.api.requestJson({ method: 'POST', path: '/auth/social-login', body: {} }, identity),
      ).rejects.toMatchObject({ status: 401 });
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    });

    it.each(['/posts', '/topics'])(
      'TC-NET-030 토큰을 보낸 비로그인 허용 API(GET %s)의 401도 refresh 후 재전송한다',
      async (p) => {
        await h.signIn();
        useRotatingServer();
        await expect(h.api.requestJson({ method: 'GET', path: p }, identity)).resolves.toEqual(
          OK_BODY,
        );
        expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
      },
    );
  });

  describe('갱신과 재전송', () => {
    it('TC-NET-012 401 UNAUTHORIZED면 refresh 1회 뒤 원 요청을 정확히 1회 재전송해 성공을 돌려준다', async () => {
      await h.signIn();
      useRotatingServer();
      await expect(getNotifications()).resolves.toEqual(OK_BODY);
      const sent = h.transport.requests;
      expect(sent.map((r) => `${r.method} ${path(r)}`)).toEqual([
        'GET /notifications',
        'POST /auth/refresh',
        'GET /notifications',
      ]);
      expect(bearer(sent[0])).toBe('Bearer access-1');
      expect(JSON.parse(sent[1].body as string)).toEqual({ refreshToken: 'refresh-1' });
      expect(bearer(sent[1])).toBeUndefined();
      expect(bearer(sent[2])).toBe('Bearer access-2');
    });

    it('TC-NET-022 새 access·refresh를 함께 저장하고 만료는 응답 초 값으로 계산하며 저장 뒤에 재전송한다', async () => {
      await h.signIn();
      const storedAtResend: unknown[] = [];
      h.transport.respond(async (req) => {
        if (path(req) === '/auth/refresh') return refreshOk();
        if (bearer(req) === 'Bearer access-2') {
          storedAtResend.push(await h.sessionStore.load());
          return json(200, OK_BODY);
        }
        return unauthorized();
      });
      const now = h.clock.now().getTime();
      await getNotifications();
      expect(storedAtResend).toHaveLength(1);
      expect(storedAtResend[0]).toEqual({
        kind: 'authenticated',
        credentials: {
          userId: 'user-a',
          accessToken: 'access-2',
          accessTokenExpiresAt: new Date(now + 900_000),
          refreshToken: 'refresh-2',
          refreshTokenExpiresAt: new Date(now + 2_592_000_000),
        },
      });
    });

    it('TC-NET-015 동시에 여러 요청이 401이어도 refresh는 1건이고 모든 원 요청이 새 토큰으로 1회씩 재전송된다', async () => {
      await h.signIn();
      const gate = deferred<HttpResponse>();
      useRotatingServer({ refresh: () => gate.promise });
      const calls = [getNotifications(), getNotifications(), getNotifications()];
      await flush();
      gate.resolve(refreshOk());
      await expect(Promise.all(calls)).resolves.toEqual([OK_BODY, OK_BODY, OK_BODY]);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
      const resent = h.transport.requests.filter((r) => bearer(r) === 'Bearer access-2');
      expect(resent).toHaveLength(3);
      expect(h.transport.requests).toHaveLength(7);
    });

    it('TC-NET-029 같은 refresh token을 두 번 보내지 않는다(동시 갱신은 1건, 다음 갱신은 회전된 토큰)', async () => {
      await h.signIn();
      let accepted = 'Bearer access-2';
      h.transport.respond((req) => {
        if (path(req) === '/auth/refresh') {
          const sent = JSON.parse(req.body as string).refreshToken;
          return sent === 'refresh-1'
            ? refreshOk()
            : json(200, { ...REFRESH_SUCCESS, accessToken: 'access-3', refreshToken: 'refresh-3' });
        }
        return bearer(req) === accepted ? json(200, OK_BODY) : unauthorized();
      });
      await Promise.all([getNotifications(), getNotifications()]);
      accepted = 'Bearer access-3'; // 서버가 access-2를 더 이상 받아주지 않는 상황
      await getNotifications();
      const sentTokens = h.transport
        .requestsTo('POST', '/auth/refresh')
        .map((r) => JSON.parse(r.body as string).refreshToken as string);
      expect(sentTokens).toEqual(['refresh-1', 'refresh-2']);
    });

    it('TC-NET-016 401을 받은 사이 다른 요청이 이미 갱신했으면 refresh 없이 새 토큰으로 재전송한다', async () => {
      const original = await h.signIn();
      h.transport.respond(async (req) => {
        if (bearer(req) === 'Bearer access-2') return json(200, OK_BODY);
        // 이 요청이 401을 받기 전에 다른 요청이 갱신을 끝냈다고 가정
        await h.sessionStore.replaceTokensIfCurrent(original.refreshToken, {
          accessToken: 'access-2',
          accessTokenExpiresAt: new Date(h.clock.now().getTime() + 900_000),
          refreshToken: 'refresh-2',
          refreshTokenExpiresAt: new Date(h.clock.now().getTime() + 2_592_000_000),
        });
        return unauthorized();
      });
      await expect(getNotifications()).resolves.toEqual(OK_BODY);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
      expect(h.transport.requests).toHaveLength(2);
    });

    it('TC-NET-017 재전송한 요청이 다시 401이면 더 재전송하지 않고 AuthenticationRequiredError를 던지며 세션은 유지한다', async () => {
      await h.signIn();
      h.transport.respond((req) => (path(req) === '/auth/refresh' ? refreshOk() : unauthorized()));
      await expect(getNotifications()).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect(h.transport.requests).toHaveLength(3);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
      const state = await h.sessionStore.load();
      expect(state.kind).toBe('authenticated');
      expect(h.emitted).toEqual([]);
    });
  });

  describe('읽는 사이 갱신이 끝나는 경합 (wiki: 옛 refresh token 재전송)', () => {
    const rotated = () => ({
      accessToken: 'access-2',
      accessTokenExpiresAt: new Date(h.clock.now().getTime() + 900_000),
      refreshToken: 'refresh-2',
      refreshTokenExpiresAt: new Date(h.clock.now().getTime() + 2_592_000_000),
    });

    it('TC-NET-016 401 처리 중 저장소 읽기가 지연되는 사이 다른 요청의 갱신이 끝나도 옛 refresh token을 다시 보내지 않고 새 토큰으로 재전송한다', async () => {
      const original = await h.signIn();
      let release: () => void = () => undefined;
      h.transport.respond((req) => {
        if (bearer(req) === 'Bearer access-2') return json(200, OK_BODY);
        // 401을 돌려주는 순간 다음 저장소 읽기(401 처리의 세션 재확인)를 붙잡는다.
        release = h.storage.holdNextRead();
        return unauthorized();
      });
      const call = getNotifications();
      await flush();
      // 붙잡힌 읽기 뒤에 다른 요청의 갱신 결과 저장이 줄을 선다.
      const saved = h.sessionStore.replaceTokensIfCurrent(original.refreshToken, rotated());
      await flush();
      release();
      await saved;
      await expect(call).resolves.toEqual(OK_BODY);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
      expect(h.transport.requests).toHaveLength(2);
    });

    it('TC-NET-016 single-flight가 비어 있어도 refresh 직전 재확인으로 옛 토큰 refresh를 막는다(TokenRefresher 단독)', async () => {
      const original = await h.signIn();
      await h.sessionStore.replaceTokensIfCurrent(original.refreshToken, rotated());
      const outcome = await h.tokenRefresher.refresh(original.refreshToken, original.userId);
      expect(outcome.kind === 'refreshed' && outcome.credentials.refreshToken).toBe('refresh-2');
      expect(h.transport.requests).toHaveLength(0);
    });

    it('TC-NET-016 재확인 때 다른 계정이거나 세션이 없으면 session-changed다(네트워크 없음)', async () => {
      const original = await h.signIn();
      await h.signIn({ userId: 'user-b', refreshToken: 'refresh-b' });
      expect(await h.tokenRefresher.refresh(original.refreshToken, original.userId)).toEqual({
        kind: 'session-changed',
      });
      await h.sessionStore.clear();
      expect(await h.tokenRefresher.refresh('refresh-b', 'user-b')).toEqual({
        kind: 'session-changed',
      });
      expect(h.transport.requests).toHaveLength(0);
    });

    it('REQ-AUTH-023 인증 상태였는데 보안 저장소 읽기가 예외를 던지면 세션을 버리고 ReauthenticationRequiredError + session-expired 1회, 갱신·재시도는 없다', async () => {
      await h.signIn();
      h.transport.respond(() => {
        h.storage.failNextRead = true; // 401 처리의 세션 재확인 읽기가 실패
        return unauthorized();
      });
      await expect(getNotifications()).rejects.toBeInstanceOf(ReauthenticationRequiredError);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
      expect(h.transport.requests).toHaveLength(1);
      expect(h.emitted).toEqual([{ type: 'session-expired' }]);
      expect((await h.sessionStore.load()).kind).toBe('none');
    });
  });

  describe('REAUTHENTICATION_REQUIRED', () => {
    it('TC-NET-018 재전송한 요청이 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 이벤트를 낸다', async () => {
      await h.signIn();
      h.transport.respond((req) => {
        if (path(req) === '/auth/refresh') return refreshOk();
        return bearer(req) === 'Bearer access-2' ? reauth() : unauthorized();
      });
      await expect(getNotifications()).rejects.toBeInstanceOf(ReauthenticationRequiredError);
      expect((await h.sessionStore.load()).kind).toBe('none');
      expect(h.emitted).toEqual([{ type: 'session-expired' }]);
    });

    it('TC-NET-019 늦게 도착한 REAUTH 응답인데 그 사이 토큰이 갱신됐으면 새 토큰으로 1회 재시도하고 세션은 지우지 않는다', async () => {
      const original = await h.signIn();
      h.transport.respond(async (req) => {
        if (bearer(req) === 'Bearer access-2') return json(200, OK_BODY);
        await h.sessionStore.replaceTokensIfCurrent(original.refreshToken, {
          accessToken: 'access-2',
          accessTokenExpiresAt: new Date(h.clock.now().getTime() + 900_000),
          refreshToken: 'refresh-2',
          refreshTokenExpiresAt: new Date(h.clock.now().getTime() + 2_592_000_000),
        });
        return reauth();
      });
      await expect(getNotifications()).resolves.toEqual(OK_BODY);
      expect((await h.sessionStore.load()).kind).toBe('authenticated');
      expect(h.emitted).toEqual([]);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    });

    it('TC-NET-020 일반 API가 401 REAUTHENTICATION_REQUIRED면 refresh를 부르지 않고 세션을 지운 뒤 이벤트를 낸다', async () => {
      await h.signIn();
      h.transport.script(reauth());
      await expect(getNotifications()).rejects.toBeInstanceOf(ReauthenticationRequiredError);
      expect(h.transport.requests).toHaveLength(1);
      expect((await h.sessionStore.load()).kind).toBe('none');
      expect(h.emitted).toEqual([{ type: 'session-expired' }]);
    });

    it('TC-NET-020 일반 API 여러 개가 동시에 직접 REAUTH 401을 받아도 이벤트는 한 번이고 모두 ReauthenticationRequiredError다', async () => {
      await h.signIn();
      h.transport.respond(() => reauth());
      const results = await Promise.all(
        [getNotifications(), getNotifications(), getNotifications()].map((p) => p.catch((e) => e)),
      );
      results.forEach((r) => expect(r).toBeInstanceOf(ReauthenticationRequiredError));
      expect(h.emitted).toHaveLength(1);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
    });

    it('TC-NET-021 refresh 요청 자체가 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 이벤트를 낸다', async () => {
      // fixture: auth/refresh__reauthentication-required.json
      await h.signIn();
      h.transport.respond((req) => (path(req) === '/auth/refresh' ? reauth() : unauthorized()));
      await expect(getNotifications()).rejects.toBeInstanceOf(ReauthenticationRequiredError);
      expect((await h.sessionStore.load()).kind).toBe('none');
      expect(h.emitted).toEqual([{ type: 'session-expired' }]);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
    });

    it('TC-NET-021 동시 요청 여러 개가 같은 REAUTH를 받아도 이벤트는 한 번만 나간다', async () => {
      await h.signIn();
      const gate = deferred<HttpResponse>();
      h.transport.respond((req) => (path(req) === '/auth/refresh' ? gate.promise : unauthorized()));
      const calls = [getNotifications(), getNotifications(), getNotifications()].map((p) =>
        p.catch((e) => e),
      );
      await flush();
      gate.resolve(reauth());
      const results = await Promise.all(calls);
      results.forEach((r) => expect(r).toBeInstanceOf(ReauthenticationRequiredError));
      expect(h.emitted).toHaveLength(1);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
    });
  });

  describe('갱신 실패', () => {
    it.each([
      ['연결 실패', () => networkFailure(), NetworkError],
      ['타임아웃', () => timeoutFailure(), TimeoutError],
    ])(
      'TC-NET-023 refresh가 %s면 그 요청만 실패하고 로그아웃·refresh 재시도·원 요청 재전송이 없다',
      async (_n, fail, ErrorClass) => {
        await h.signIn();
        h.transport.respond((req) => {
          if (path(req) === '/auth/refresh') throw fail();
          return unauthorized();
        });
        await expect(getNotifications()).rejects.toBeInstanceOf(ErrorClass);
        expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
        expect(h.transport.requestsTo('GET', '/notifications')).toHaveLength(1);
        expect(h.sleeper.calls).toEqual([]);
        const state = await h.sessionStore.load();
        expect(state.kind === 'authenticated' && state.credentials.refreshToken).toBe('refresh-1');
        expect(h.emitted).toEqual([]);
      },
    );

    it('TC-NET-023 refresh 응답이 REAUTH 아닌 401이면 AuthenticationRequiredError이고 세션은 유지한다', async () => {
      await h.signIn();
      h.transport.respond(() => unauthorized());
      await expect(getNotifications()).rejects.toBeInstanceOf(AuthenticationRequiredError);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
      expect((await h.sessionStore.load()).kind).toBe('authenticated');
      expect(h.emitted).toEqual([]);
    });

    it('TC-NET-024 refresh가 5xx면 일시 실패로 보고 세션을 유지하며 재시도하지 않는다', async () => {
      // fixture: auth/refresh__internal-error.json
      await h.signIn();
      h.transport.respond((req) =>
        path(req) === '/auth/refresh'
          ? json(500, { errorCode: 'INTERNAL_ERROR', message: 'x' })
          : unauthorized(),
      );
      await expect(getNotifications()).rejects.toMatchObject({ status: 500 });
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
      expect((await h.sessionStore.load()).kind).toBe('authenticated');
      expect(h.emitted).toEqual([]);
    });

    it('TC-NET-025 refresh 응답에 필수 토큰 필드가 없으면 InvalidResponseError이고 기존 세션을 덮어쓰지 않는다', async () => {
      // fixture: auth/refresh__missing-token-field.json
      const original = await h.signIn();
      h.transport.respond((req) =>
        path(req) === '/auth/refresh'
          ? json(200, { accessToken: 'access-2', expiresIn: 900 })
          : unauthorized(),
      );
      await expect(getNotifications()).rejects.toBeInstanceOf(InvalidResponseError);
      const state = await h.sessionStore.load();
      expect(state).toEqual({ kind: 'authenticated', credentials: original });
      expect(h.emitted).toEqual([]);
    });

    it('TC-NET-026 refresh가 400이면 요청만 실패시키고 로그아웃하지 않으며 오류 로그를 남긴다', async () => {
      // fixture: common/error__business-400.json
      await h.signIn();
      h.transport.respond((req) =>
        path(req) === '/auth/refresh'
          ? json(400, {
              errorCode: 'BUSINESS_ERROR',
              message: '리프레시 토큰은 비어 있을 수 없습니다.',
            })
          : unauthorized(),
      );
      await expect(getNotifications()).rejects.toMatchObject({ status: 400 });
      expect((await h.sessionStore.load()).kind).toBe('authenticated');
      expect(h.emitted).toEqual([]);
      expect(h.logger.entries.some((e) => e.level === 'error')).toBe(true);
    });
  });

  describe('갱신 도중 세션 변경·취소', () => {
    it('TC-NET-027 refresh 도중 로그아웃하면 새 토큰을 저장하지 않고 세션을 되살리지 않으며 원 요청은 조용히 끝난다', async () => {
      await h.signIn();
      const gate = deferred<HttpResponse>();
      useRotatingServer({ refresh: () => gate.promise });
      const call = getNotifications().catch((e) => e);
      await flush();
      await h.sessionStore.clear();
      gate.resolve(refreshOk());
      expect(await call).toBeInstanceOf(CancelledError);
      expect((await h.sessionStore.load()).kind).toBe('none');
      expect(h.transport.requestsTo('GET', '/notifications')).toHaveLength(1);
      expect(h.emitted).toEqual([]);
    });

    it('TC-NET-027 refresh 도중 다른 계정으로 로그인하면 새 계정 세션을 덮어쓰지 않는다', async () => {
      await h.signIn();
      const gate = deferred<HttpResponse>();
      useRotatingServer({ refresh: () => gate.promise });
      const call = getNotifications().catch((e) => e);
      await flush();
      const accountB = await h.signIn({
        userId: 'user-b',
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
      });
      gate.resolve(refreshOk());
      expect(await call).toBeInstanceOf(CancelledError);
      expect(await h.sessionStore.load()).toEqual({ kind: 'authenticated', credentials: accountB });
    });

    it('TC-NET-021 계정 전환 뒤 늦게 온 이전 계정의 refresh REAUTH는 새 계정 세션을 지우지 않는다', async () => {
      await h.signIn();
      const gate = deferred<HttpResponse>();
      h.transport.respond((req) => (path(req) === '/auth/refresh' ? gate.promise : unauthorized()));
      const call = getNotifications().catch((e) => e);
      await flush();
      const accountB = await h.signIn({
        userId: 'user-b',
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
      });
      gate.resolve(reauth());
      await call;
      expect(await h.sessionStore.load()).toEqual({ kind: 'authenticated', credentials: accountB });
      expect(h.emitted).toEqual([]);
    });

    it('TC-NET-057 계정 A의 요청이 계정 전환 뒤 401을 받아도 B의 토큰으로 재전송하거나 B 세션을 건드리지 않는다', async () => {
      await h.signIn();
      const gate = deferred<HttpResponse>();
      h.transport.respond((req) =>
        bearer(req) === 'Bearer access-1' ? gate.promise : json(200, OK_BODY),
      );
      const call = getNotifications().catch((e) => e);
      await flush();
      await h.sessionStore.clear();
      const accountB = await h.signIn({
        userId: 'user-b',
        accessToken: 'access-b',
        refreshToken: 'refresh-b',
      });
      gate.resolve(unauthorized());
      expect(await call).toBeInstanceOf(CancelledError);
      expect(h.transport.requests).toHaveLength(1);
      expect(await h.sessionStore.load()).toEqual({ kind: 'authenticated', credentials: accountB });
    });

    it('TC-NET-028 refresh 중 한 요청이 취소돼도 그 요청은 오류 없이 끝나고 다른 요청을 위한 refresh는 계속된다', async () => {
      await h.signIn();
      const gate = deferred<HttpResponse>();
      useRotatingServer({ refresh: () => gate.promise });
      const controller = new AbortController();
      const cancelled = getNotifications(controller.signal).catch((e) => e);
      const survivor = getNotifications();
      await flush();
      controller.abort();
      expect(await cancelled).toBeInstanceOf(CancelledError);
      gate.resolve(refreshOk());
      await expect(survivor).resolves.toEqual(OK_BODY);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);
      expect((await h.sessionStore.load()).kind).toBe('authenticated');
    });
  });
});
