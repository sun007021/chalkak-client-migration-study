import { ApiError, InvalidResponseError, NetworkError, SessionChangedError, isCancellation } from './errors';
import { d } from './decode';
import { emptyResponse, jsonResponse, networkFailure, type Responder } from '../../test/fakeFetch';
import { makeApiEnv } from '../../test/apiEnv';
import { track } from '../../test/track';
import { ME, errorBodies, guestSession, memberSession, refreshSuccessBody, NOW, tokens } from '../../test/fixtures';
import { flushAsync } from '../../test/FakeClock';

const ok = d.object({ id: d.string() });
const body = { id: 'ok' };

/** Bearer 토큰별로 응답을 정하는 responder. */
function byToken(map: Record<string, Response | (() => Response)>, fallback: () => Response = () => jsonResponse(401, errorBodies.unauthorized)): Responder {
  return (req) => {
    const h = req.headers['authorization'];
    const key = h ? h.replace('Bearer ', '') : '(none)';
    const hit = map[key];
    if (!hit) return fallback();
    return typeof hit === 'function' ? hit() : hit.clone();
  };
}

describe('401 갱신', () => {
  it('TC-NET-012 TC-NET-059 401 UNAUTHORIZED면 refresh 1회 후 새 토큰으로 원 요청을 정확히 1회 재전송하고 성공을 돌려준다', async () => {
    const { ff, client, clock, store } = makeApiEnv(memberSession());
    ff.route('GET /notifications', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.value).toEqual(body);
    const sent = ff.callsTo('GET /notifications');
    expect(sent.map((c) => c.headers['authorization'])).toEqual(['Bearer fixture-access-token-1', 'Bearer fixture-access-token-2']);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(JSON.parse(ff.callsTo('POST /auth/refresh')[0]!.body as string)).toEqual({ refreshToken: 'fixture-refresh-token-1' });
    const saved = (await store.read()).tokens!;
    expect([saved.accessToken, saved.refreshToken]).toEqual(['fixture-access-token-2', 'fixture-refresh-token-2']);
  });

  it('TC-NET-022 새 토큰은 저장이 끝난 뒤에야 원 요청이 재전송된다', async () => {
    const { ff, client, clock, store } = makeApiEnv(memberSession());
    let storedWhenRetried: string | undefined;
    ff.route('GET /notifications', (req) => {
      if (req.headers['authorization'] === 'Bearer fixture-access-token-2') {
        return store.read().then((s) => {
          storedWhenRetried = s.tokens?.accessToken;
          return jsonResponse(200, body);
        });
      }
      return jsonResponse(401, errorBodies.unauthorized);
    });
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(storedWhenRetried).toBe('fixture-access-token-2');
  });

  it('TC-NET-013 토큰 없이 보낸 게스트 요청의 401은 refresh하지 않고 세션도 지우지 않는다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(guestSession);
    ff.route('GET /posts', () => jsonResponse(401, errorBodies.unauthorized));
    const result = track(client().request({ method: 'GET', path: '/posts' }, ok));
    await clock.advance(0);
    expect(result.error).toMatchObject({ status: 401, errorCode: 'UNAUTHORIZED' });
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    expect(ff.callsTo('GET /posts')).toHaveLength(1);
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
  });

  it('TC-NET-014 만료된 access token은 Authorization 없이 보내고 서버 401을 받아 갱신 경로로 간다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession({ accessTokenExpiresAt: NOW - 1_000 }));
    ff.route('GET /notifications', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    const sent = ff.callsTo('GET /notifications');
    expect(sent[0]!.headers['authorization']).toBeUndefined();
    expect(sent[1]!.headers['authorization']).toBe('Bearer fixture-access-token-2');
    expect(result.value).toEqual(body);
  });

  it('TC-TIME-028 기기 시계가 하루 빨라 만료로 오판해도 401 → refresh로 정상 복구된다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    clock.setWallClock(NOW + 86_400_000);
    ff.route('GET /notifications', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.value).toEqual(body);
    expect(ff.callsTo('GET /notifications')[0]!.headers['authorization']).toBeUndefined();
  });

  it('TC-NET-015 TC-NET-029 동시 401 세 건은 refresh 1건이고 원 요청은 각각 새 토큰으로 1회씩만 재전송된다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    ff.route('GET /a', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('GET /b', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('GET /c', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('POST /auth/refresh', async () => {
      await clock.sleep(300);
      return jsonResponse(200, refreshSuccessBody);
    });
    const c = client();
    const rs = ['a', 'b', 'c'].map((p) => track(c.request({ method: 'GET', path: `/${p}` }, ok)));
    await clock.advance(300);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    for (const p of ['a', 'b', 'c']) {
      expect(ff.callsTo(`GET /${p}`).map((x) => x.headers['authorization'])).toEqual(['Bearer fixture-access-token-1', 'Bearer fixture-access-token-2']);
    }
    expect(rs.map((r) => r.state)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
  });

  it('TC-NET-016 401을 받는 사이 다른 요청이 이미 토큰을 갱신했으면 refresh 없이 새 토큰으로 재시도한다', async () => {
    const { ff, client, clock, store } = makeApiEnv(memberSession());
    let first = true;
    ff.route('GET /notifications', async (req) => {
      if (req.headers['authorization'] === 'Bearer fixture-access-token-2') return jsonResponse(200, body);
      if (first) {
        first = false;
        await store.write({ userId: ME, tokens: tokens({ accessToken: 'fixture-access-token-2', refreshToken: 'fixture-refresh-token-2' }), isGuest: false });
      }
      return jsonResponse(401, errorBodies.unauthorized);
    });
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.value).toEqual(body);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-NET-017 REQ-NET-023 재전송한 요청이 다시 401이면 더 보내지 않고 ApiError를 던지며 세션은 지우지 않는다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.unauthorized));
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(10_000);
    expect(ff.callsTo('GET /notifications')).toHaveLength(2);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(result.error).toMatchObject({ name: 'ApiError', status: 401, errorCode: 'UNAUTHORIZED' });
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
  });

  it('TC-NET-018 재전송한 요청이 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 이벤트를 1번 낸다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /notifications', byToken({ 'fixture-access-token-2': jsonResponse(401, errorBodies.reauth) }));
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.error).toMatchObject({ status: 401, errorCode: 'REAUTHENTICATION_REQUIRED' });
    expect(store.clearCount).toBe(1);
    expect(expired.count).toBe(1);
    expect(ff.callsTo('GET /notifications')).toHaveLength(2);
  });

  it('TC-NET-019 늦게 도착한 REAUTH인데 그 사이 토큰이 갱신됐으면 새 토큰으로 1회 재시도하고 세션은 지우지 않는다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    let first = true;
    ff.route('GET /notifications', async (req) => {
      if (req.headers['authorization'] === 'Bearer fixture-access-token-2') return jsonResponse(200, body);
      if (first) {
        first = false;
        await store.write({ userId: ME, tokens: tokens({ accessToken: 'fixture-access-token-2', refreshToken: 'fixture-refresh-token-2' }), isGuest: false });
      }
      return jsonResponse(401, errorBodies.reauth);
    });
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.value).toEqual(body);
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
  });

  it('TC-NET-020 일반 API가 401 REAUTHENTICATION_REQUIRED면 refresh 없이 세션을 지우고 로그인 이벤트를 낸다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.reauth));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.error).toMatchObject({ status: 401, errorCode: 'REAUTHENTICATION_REQUIRED' });
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    expect(ff.callsTo('GET /notifications')).toHaveLength(1);
    expect(store.clearCount).toBe(1);
    expect(expired.count).toBe(1);
  });

  it('TC-NET-021 refresh 요청 자체가 REAUTHENTICATION_REQUIRED면 세션을 지우고 요청은 REAUTH ApiError로 실패한다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.unauthorized));
    ff.route('POST /auth/refresh', () => jsonResponse(401, errorBodies.reauth));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.error).toMatchObject({ status: 401, errorCode: 'REAUTHENTICATION_REQUIRED' });
    expect(store.clearCount).toBe(1);
    expect(expired.count).toBe(1);
    expect(ff.callsTo('GET /notifications')).toHaveLength(1);
  });

  it('TC-NET-023 refresh가 네트워크 오류면 그 요청만 NetworkError로 실패하고 로그아웃하지 않으며 refresh를 재시도하지 않는다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.unauthorized));
    ff.route('POST /auth/refresh', networkFailure);
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(30_000);
    expect(result.error).toBeInstanceOf(NetworkError);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
    expect((await store.read()).tokens?.refreshToken).toBe('fixture-refresh-token-1');
  });

  it('TC-NET-024 refresh가 5xx면 그 요청만 실패하고 세션을 유지한다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.unauthorized));
    ff.route('POST /auth/refresh', () => jsonResponse(500, errorBodies.internal500));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(30_000);
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
  });

  it('TC-NET-025 refresh 응답에 토큰 필드가 빠졌으면 기존 세션을 덮어쓰지 않는다', async () => {
    const { ff, client, clock, store } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.unauthorized));
    ff.route('POST /auth/refresh', () => jsonResponse(200, { accessToken: 'only-access', expiresIn: 900 }));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(InvalidResponseError);
    expect(store.writes).toHaveLength(0);
    expect((await store.read()).tokens?.accessToken).toBe('fixture-access-token-1');
  });

  it('TC-NET-026 refresh가 400이어도 로그아웃하지 않고 요청만 실패시킨다', async () => {
    const { ff, client, clock, store, expired } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.unauthorized));
    ff.route('POST /auth/refresh', () => jsonResponse(400, errorBodies.business400));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(result.error).toBeInstanceOf(ApiError);
    expect(result.error).toMatchObject({ status: 400, errorCode: 'BUSINESS_ERROR' });
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
  });

  it('TC-NET-027 refresh 도중 로그아웃되면 새 토큰을 저장하지 않고 세션을 되살리지 않으며 원 요청을 재전송하지 않는다', async () => {
    const { ff, client, clock, store } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => jsonResponse(401, errorBodies.unauthorized));
    ff.route('POST /auth/refresh', async () => {
      await clock.sleep(500);
      return jsonResponse(200, refreshSuccessBody);
    });
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(100);
    await store.clear();
    await clock.advance(500);
    expect(result.error).toBeInstanceOf(SessionChangedError);
    expect(store.writes).toHaveLength(0);
    expect((await store.read()).tokens).toBeNull();
    expect(ff.callsTo('GET /notifications')).toHaveLength(1);
  });

  it('TC-NET-028 refresh 중 한 요청이 취소돼도 AbortError만 받고 다른 요청은 같은 refresh로 성공한다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    ff.route('GET /a', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('GET /b', byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('POST /auth/refresh', async () => {
      await clock.sleep(300);
      return jsonResponse(200, refreshSuccessBody);
    });
    const ctrl = new AbortController();
    const c = client();
    const a = track(c.request({ method: 'GET', path: '/a', signal: ctrl.signal }, ok));
    const b = track(c.request({ method: 'GET', path: '/b' }, ok));
    await clock.advance(100);
    ctrl.abort();
    await flushAsync();
    expect(isCancellation(a.error)).toBe(true);
    await clock.advance(300);
    expect(b.value).toEqual(body);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
    expect(ff.callsTo('GET /a')).toHaveLength(1); // 취소된 요청은 재전송하지 않는다
  });

  it.each(['/posts', '/topics'])('TC-NET-030 토큰을 보낸 비로그인 허용 API(GET %s)도 만료 토큰 401이면 갱신 후 재전송한다', async (path) => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    ff.route(`GET ${path}`, byToken({ 'fixture-access-token-2': jsonResponse(200, body) }));
    ff.route('POST /auth/refresh', () => jsonResponse(200, refreshSuccessBody));
    const result = track(client().request({ method: 'GET', path }, ok));
    await clock.advance(0);
    expect(result.value).toEqual(body);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(1);
  });

  it('TC-NET-031 GET /banners는 Authorization을 붙이지 않고 401이 와도 갱신하지 않는다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    ff.route('GET /banners', () => jsonResponse(401, errorBodies.unauthorized));
    const result = track(client().request({ method: 'GET', path: '/banners' }, ok));
    await clock.advance(0);
    expect(ff.calls[0]!.headers['authorization']).toBeUndefined();
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    expect(result.error).toMatchObject({ status: 401 });
  });

  it('REQ-NET-025 /auth/social-* 의 401 UNAUTHORIZED는 갱신하지 않고 그대로 ApiError로 던진다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    ff.route('POST /auth/social-login', () => jsonResponse(401, errorBodies.unauthorized));
    const result = track(client().requestVoid({ method: 'POST', path: '/auth/social-login', body: {} }));
    await clock.advance(0);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    expect(result.error).toMatchObject({ status: 401, errorCode: 'UNAUTHORIZED' });
  });

  it('REQ-NET-018 errorCode가 UNAUTHORIZED가 아닌 401(본문 없음)은 갱신 대상이 아니다', async () => {
    const { ff, client, clock } = makeApiEnv(memberSession());
    ff.route('GET /notifications', () => emptyResponse(401));
    const result = track(client().request({ method: 'GET', path: '/notifications' }, ok));
    await clock.advance(0);
    expect(ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    expect(result.error).toBeInstanceOf(ApiError);
  });
});
