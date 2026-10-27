import {
  CancelledError,
  HttpError,
  InvalidResponseError,
  NetworkError,
  TimeoutError,
} from '../../core/http/ApiError';
import { refreshOk, unauthorized } from '../../core/http/__testing__/createNetHarness';
import { fixtureResponse } from '../../core/http/__testing__/loadFixture';
import {
  deferred,
  networkFailure,
  noContent,
  timeoutFailure,
} from '../../core/http/__testing__/FakeTransport';
import { createAuthHarness } from './__testing__/createAuthHarness';

const INPUT = { idToken: 'id-token-1', rawNonce: 'raw-1' };
const bodyOf = (request: { body?: string | Uint8Array }) => JSON.parse(request.body as string);
const hasHeader = (headers: Record<string, string>, name: string) =>
  Object.keys(headers).some((key) => key.toLowerCase() === name);

describe('AuthRepository.socialLoginKakao', () => {
  it('TC-AUTH-005 POST /auth/social-login 바디는 {provider, idToken, rawNonce}뿐이고 authorizationCode와 Authorization 헤더가 없다', async () => {
    const h = createAuthHarness();
    await h.signIn(); // 로그인돼 있어도 /auth/* 는 토큰을 붙이지 않는다.
    h.routes({ 'POST /auth/social-login': 'auth/social-login__login-success' });

    await h.repository.socialLoginKakao(INPUT);

    const [request] = h.transport.requestsTo('POST', '/auth/social-login');
    expect(bodyOf(request)).toEqual({
      provider: 'KAKAO',
      idToken: 'id-token-1',
      rawNonce: 'raw-1',
    });
    expect(request.body).not.toContain('authorizationCode');
    expect(hasHeader(request.headers, 'authorization')).toBe(false);
  });

  it('TC-AUTH-006 LOGIN_SUCCESS를 읽어 userId와 토큰·만료 시각(응답 초 값)을 저장한다', async () => {
    const h = createAuthHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__login-success' });

    const outcome = await h.repository.socialLoginKakao(INPUT);

    expect(outcome).toEqual({ kind: 'logged-in', userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
    const state = await h.sessionStore.load();
    if (state.kind !== 'authenticated') throw new Error('세션이 저장되지 않았다');
    const now = h.clock.now().getTime();
    expect(state.credentials).toMatchObject({
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      accessToken: 'fixture-access-token-1',
      refreshToken: 'fixture-refresh-token-1',
    });
    expect(state.credentials.accessTokenExpiresAt.getTime()).toBe(now + 900 * 1000);
    expect(state.credentials.refreshTokenExpiresAt.getTime()).toBe(now + 2_592_000 * 1000);
  });

  it('TC-AUTH-058 로그인 성공이면 이전 계정의 캐시를 비우고 새 세션으로 바꾼다(저장보다 먼저 비운다)', async () => {
    const h = createAuthHarness();
    await h.signIn({ userId: 'user-a', refreshToken: 'refresh-a' });
    h.routes({ 'POST /auth/social-login': 'auth/social-login__login-success' });

    await h.repository.socialLoginKakao(INPUT);

    expect(h.cache.clearCalls).toBe(1);
    const state = await h.sessionStore.load();
    expect(state.kind === 'authenticated' && state.credentials.userId).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
  });

  it('TC-AUTH-010 SIGN_UP_REQUIRED는 토큰을 저장하지 않고 idToken·rawNonce를 다음 단계에 넘긴다', async () => {
    const h = createAuthHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__sign-up-required' });

    const outcome = await h.repository.socialLoginKakao(INPUT);

    expect(outcome).toEqual({ kind: 'sign-up-required', pending: INPUT });
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.storage.writes).toEqual([]);
    expect(h.cache.clearCalls).toBe(0);
  });

  it('TC-AUTH-011 알 수 없는 status는 InvalidResponseError이고 세션을 저장하지 않는다', async () => {
    const h = createAuthHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__unknown-status' });
    await expect(h.repository.socialLoginKakao(INPUT)).rejects.toBeInstanceOf(InvalidResponseError);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
  });

  it('TC-AUTH-012 LOGIN_SUCCESS인데 refreshToken이 없으면 InvalidResponseError이고 세션을 저장하지 않는다', async () => {
    const h = createAuthHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__login-success-missing-token' });
    await expect(h.repository.socialLoginKakao(INPUT)).rejects.toBeInstanceOf(InvalidResponseError);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.storage.writes).toEqual([]);
  });

  it('TC-AUTH-020 401 UNAUTHORIZED는 갱신을 시도하지 않고 오류로 끝난다', async () => {
    const h = createAuthHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__unauthorized' });
    await expect(h.repository.socialLoginKakao(INPUT)).rejects.toMatchObject({
      status: 401,
      errorCode: 'UNAUTHORIZED',
    });
    expect(h.transport.requests).toHaveLength(1);
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
  });

  it.each([
    ['TC-AUTH-021', 'auth/social-login__forbidden-banned', '차단된 소셜 계정입니다.'],
    [
      'TC-AUTH-022',
      'auth/social-login__forbidden-withdrawn-banned',
      '탈퇴한 차단 소셜 계정입니다.',
    ],
  ])(
    '%s 403 FORBIDDEN은 서버 message를 담은 HttpError이고 재시도하지 않는다',
    async (_id, fixture, message) => {
      const h = createAuthHarness();
      h.routes({ 'POST /auth/social-login': fixture });
      const error = await h.repository.socialLoginKakao(INPUT).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ status: 403, errorCode: 'FORBIDDEN', serverMessage: message });
      expect(h.transport.requests).toHaveLength(1);
    },
  );

  it('TC-AUTH-023 400 BUSINESS_ERROR는 HttpError 400으로 올라온다', async () => {
    const h = createAuthHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__bad-request-authcode' });
    await expect(h.repository.socialLoginKakao(INPUT)).rejects.toMatchObject({
      status: 400,
      errorCode: 'BUSINESS_ERROR',
    });
  });

  it('TC-AUTH-024 500은 요청 정확히 1회(자동 재시도 금지)', async () => {
    const h = createAuthHarness();
    h.routes({ 'POST /auth/social-login': 'auth/social-login__internal-error' });
    await expect(h.repository.socialLoginKakao(INPUT)).rejects.toMatchObject({ status: 500 });
    expect(h.transport.requests).toHaveLength(1);
    expect(h.sleeper.calls).toEqual([]);
  });

  it('TC-AUTH-025 연결 실패·타임아웃은 NetworkError(TimeoutError)이고 요청은 1회뿐이다', async () => {
    for (const [failure, type] of [
      [networkFailure(), NetworkError],
      [timeoutFailure(), TimeoutError],
    ] as const) {
      const h = createAuthHarness();
      h.transport.script(failure);
      await expect(h.repository.socialLoginKakao(INPUT)).rejects.toBeInstanceOf(type);
      expect(h.transport.requests).toHaveLength(1);
    }
  });

  it('TC-AUTH-026 502 HTML 응답은 크래시 없이 status 502 HttpError(errorCode 없음)로 분류된다', async () => {
    const h = createAuthHarness();
    h.transport.script(fixtureResponse('common/error__bad-gateway-html'));
    await expect(h.repository.socialLoginKakao(INPUT)).rejects.toMatchObject({
      status: 502,
      errorCode: null,
    });
    expect(h.transport.requests).toHaveLength(1);
  });

  it('TC-AUTH-031 signal이 취소되면 늦게 온 LOGIN_SUCCESS를 저장하지 않고 CancelledError로 끝난다', async () => {
    const h = createAuthHarness();
    const controller = new AbortController();
    h.transport.respond(async () => {
      controller.abort();
      return fixtureResponse('auth/social-login__login-success');
    });
    await expect(h.repository.socialLoginKakao(INPUT, controller.signal)).rejects.toBeInstanceOf(
      CancelledError,
    );
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.cache.clearCalls).toBe(0);
  });
});

describe('AuthRepository 게스트', () => {
  it('REQ-AUTH-019 게스트 진입은 서버를 부르지 않고 인증 자격 대신 게스트 플래그를 저장한다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    await h.repository.enterGuest();
    expect(h.transport.requests).toHaveLength(0);
    expect(await h.sessionStore.load()).toEqual({ kind: 'guest' });
  });

  it('REQ-AUTH-020 게스트 플래그 저장이 실패하면 오류를 던진다', async () => {
    const h = createAuthHarness();
    h.storage.failNextWrite = true;
    await expect(h.repository.enterGuest()).rejects.toThrow();
  });

  it('TC-AUTH-033 게스트에서 로그인으로 가면 게스트 플래그를 지우고 서버를 부르지 않는다', async () => {
    const h = createAuthHarness();
    await h.sessionStore.enterGuest();
    await h.repository.leaveGuest();
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.transport.requests).toHaveLength(0);
  });
});

describe('AuthRepository.logout', () => {
  it('TC-AUTH-035 로컬 토큰·캐시를 먼저 지운 뒤 POST /auth/logout {refreshToken}을 보낸다', async () => {
    const h = createAuthHarness();
    await h.signIn({ refreshToken: 'refresh-1' });
    let storedWhenSent = -1;
    let cacheClearedWhenSent = -1;
    h.transport.respond(() => {
      storedWhenSent = h.storage.data.size;
      cacheClearedWhenSent = h.cache.clearCalls;
      return fixtureResponse('auth/logout__no-content');
    });

    await h.repository.logout();

    expect(storedWhenSent).toBe(0);
    expect(cacheClearedWhenSent).toBe(1);
    expect(h.push.resetCalls).toBe(1);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
  });

  it('TC-AUTH-037 요청은 POST /auth/logout 바디 {refreshToken}뿐이고 Authorization이 없으며 204를 성공으로 읽는다', async () => {
    const h = createAuthHarness();
    await h.signIn({ refreshToken: 'refresh-1' });
    h.routes({ 'POST /auth/logout': 'auth/logout__no-content' });

    await expect(h.repository.logout()).resolves.toBeUndefined();

    expect(h.transport.requests).toHaveLength(1);
    const [request] = h.transport.requests;
    expect(request.method).toBe('POST');
    expect(bodyOf(request)).toEqual({ refreshToken: 'refresh-1' });
    expect(hasHeader(request.headers, 'authorization')).toBe(false);
  });

  it.each([
    ['네트워크 오류', () => networkFailure()],
    ['500', () => fixtureResponse('auth/logout__internal-error')],
    ['401', () => unauthorized()],
  ])(
    'TC-AUTH-036 로그아웃 요청이 %s로 실패해도 무시하고 세션은 이미 지워져 있다(재시도·갱신 없음)',
    async (_name, failure) => {
      const h = createAuthHarness();
      await h.signIn();
      h.transport.script(failure());

      await expect(h.repository.logout()).resolves.toBeUndefined();

      expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
      expect(h.transport.requests).toHaveLength(1);
      expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(0);
      expect(h.emitted).toEqual([]);
    },
  );

  it('TC-AUTH-038 refresh token이 없는 세션(게스트·없음)은 서버를 부르지 않고 로컬만 정리한다', async () => {
    const h = createAuthHarness();
    await h.sessionStore.enterGuest();
    await h.repository.logout();
    expect(h.transport.requests).toHaveLength(0);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.cache.clearCalls).toBe(1);
  });

  it('TC-AUTH-039 로그아웃 중 푸시 기기 해제 같은 다른 API는 부르지 않는다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    h.routes({ 'POST /auth/logout': 'auth/logout__no-content' });
    await h.repository.logout();
    expect(h.transport.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/v1/auth/logout',
    ]);
  });

  it('TC-AUTH-041 로그아웃하면 등록된 사용자 캐시를 모두 비우고 푸시 등록 캐시도 비운다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    h.routes({ 'POST /auth/logout': 'auth/logout__no-content' });
    await h.repository.logout();
    expect(h.cache.clearCalls).toBe(1);
    expect(h.push.resetCalls).toBe(1);
  });
});

describe('AuthRepository.withdraw', () => {
  it('TC-AUTH-043 TC-AUTH-046 DELETE /users/me는 본문 없이 나가고 204일 때만 세션·캐시를 지운다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    let storedWhenSent = 0;
    h.transport.respond(() => {
      storedWhenSent = h.storage.data.size;
      return fixtureResponse('auth/users-me__delete-no-content');
    });

    await h.repository.withdraw();

    const [request] = h.transport.requests;
    expect(request.method).toBe('DELETE');
    expect(new URL(request.url).pathname).toBe('/api/v1/users/me');
    expect(request.body).toBeUndefined();
    expect(storedWhenSent).toBeGreaterThan(0); // 요청 전에는 지우지 않는다
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.cache.clearCalls).toBe(1);
    expect(h.push.resetCalls).toBe(1);
  });

  it.each([
    ['500', () => fixtureResponse('auth/users-me__delete-internal-error')],
    ['네트워크 오류', () => networkFailure()],
    ['타임아웃', () => timeoutFailure()],
  ])('TC-AUTH-044 %s로 실패하면 오류를 던지고 세션·캐시를 그대로 둔다', async (_name, failure) => {
    const h = createAuthHarness();
    const credentials = await h.signIn();
    h.transport.script(failure());

    await expect(h.repository.withdraw()).rejects.toThrow();

    expect(await h.sessionStore.load()).toEqual({ kind: 'authenticated', credentials });
    expect(h.cache.clearCalls).toBe(0);
    expect(h.push.resetCalls).toBe(0);
  });

  it('TC-AUTH-045 401이면 refresh 후 원 요청을 1회 재전송하고 204면 성공으로 정리한다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    h.transport.script(unauthorized(), refreshOk(), noContent());

    await h.repository.withdraw();

    expect(h.transport.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'DELETE /api/v1/users/me',
      'POST /api/v1/auth/refresh',
      'DELETE /api/v1/users/me',
    ]);
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
  });

  it('TC-AUTH-045 재전송도 401이면 오류를 던지고 세션은 유지한다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    h.transport.script(unauthorized(), refreshOk(), unauthorized());
    await expect(h.repository.withdraw()).rejects.toThrow();
    expect((await h.sessionStore.load()).kind).toBe('authenticated');
  });

  it('TC-AUTH-047 탈퇴는 DELETE /users/me 한 건만 보낸다(카카오 연결 해제 호출 없음)', async () => {
    const h = createAuthHarness();
    await h.signIn();
    h.routes({ 'DELETE /users/me': 'auth/users-me__delete-no-content' });
    await h.repository.withdraw();
    expect(h.transport.requests).toHaveLength(1);
  });
});

const flush = async () => {
  for (let i = 0; i < 30; i += 1) await Promise.resolve();
};

describe('AuthRepository 로그아웃 경쟁·응답 모양', () => {
  it('REQ-AUTH-030 TC-AUTH-042 갱신 응답을 기다리는 중 로그아웃하면 풀려도 세션은 none이고 session-expired 이벤트도 없다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    const gate = deferred<void>();
    h.transport.respond(async (request) => {
      const path = new URL(request.url).pathname;
      if (path.endsWith('/auth/refresh')) {
        await gate.promise;
        return refreshOk();
      }
      if (path.endsWith('/auth/logout')) return noContent();
      return unauthorized();
    });

    const inFlight = h.api
      .requestVoid({ method: 'DELETE', path: '/users/me' })
      .catch((error: unknown) => error);
    await flush();
    expect(h.transport.requestsTo('POST', '/auth/refresh')).toHaveLength(1);

    await h.repository.logout();
    gate.resolve();
    await inFlight;
    await flush();

    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.emitted).toEqual([]);
  });

  it('로컬 정리 단계 하나가 실패해도 나머지를 계속 시도하고 첫 오류를 던진다', async () => {
    const h = createAuthHarness();
    await h.signIn();
    h.cache.clearAll = () => {
      throw new Error('cache boom');
    };
    await expect(h.repository.clearLocalSession()).rejects.toThrow('cache boom');
    expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    expect(h.push.resetCalls).toBe(1);
  });

  it.each([
    ['null', 'null'],
    ['배열', '[]'],
    ['문자열', '"LOGIN_SUCCESS"'],
    ['숫자', '42'],
  ])(
    'TC-AUTH-011 social-login 응답 본문이 %s이면 InvalidResponseError이고 세션을 저장하지 않는다',
    async (_name, body) => {
      const h = createAuthHarness();
      h.transport.script({
        status: 200,
        headers: { 'content-type': 'application/json' },
        bodyText: body,
      });
      await expect(h.repository.socialLoginKakao(INPUT)).rejects.toBeInstanceOf(
        InvalidResponseError,
      );
      expect(await h.sessionStore.load()).toEqual({ kind: 'none' });
    },
  );
});
