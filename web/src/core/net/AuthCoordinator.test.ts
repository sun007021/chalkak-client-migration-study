import { AuthCoordinator } from './AuthCoordinator';
import { InProcessRefreshLock, type RefreshLock } from '../auth/RefreshLock';
import { SessionChangedError } from './errors';
import type { RefreshResult, TokenRefresher } from './TokenRefresher';
import { FakeSessionStore } from '../../test/FakeSessionStore';
import { EMPTY_SESSION, type StoredSession } from '../auth/SessionStore';
import { FakeClock, flushAsync } from '../../test/FakeClock';
import { track } from '../../test/track';
import { ME, NOW, OTHER_USER, guestSession, memberSession, tokens } from '../../test/fixtures';

/** 호출을 기록하고 resolve 시점을 테스트가 정하는 Fake. */
class FakeRefresher implements TokenRefresher {
  readonly calls: string[] = [];
  private waiters: ((r: RefreshResult) => void)[] = [];
  private immediate: RefreshResult | null = null;

  respondWith(result: RefreshResult): this {
    this.immediate = result;
    return this;
  }
  resolveAll(result: RefreshResult): void {
    this.waiters.splice(0).forEach((w) => w(result));
  }
  refresh(refreshToken: string): Promise<RefreshResult> {
    this.calls.push(refreshToken);
    if (this.immediate) return Promise.resolve(this.immediate);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

const NEW_TOKENS = tokens({ accessToken: 'fixture-access-token-2', refreshToken: 'fixture-refresh-token-2' });
const success: RefreshResult = { kind: 'success', tokens: NEW_TOKENS };

function setup(initial: StoredSession = memberSession()) {
  const clock = new FakeClock(NOW);
  const store = new FakeSessionStore(initial);
  const refresher = new FakeRefresher();
  const expired = { count: 0 };
  const lock = new InProcessRefreshLock();
  const makeAuth = (l: RefreshLock = lock) => new AuthCoordinator({ store, refresher, clock, lock: l, onSessionExpired: () => (expired.count += 1) });
  return { clock, store, refresher, expired, lock, makeAuth, auth: makeAuth() };
}

describe('prepare (Authorization 헤더 결정)', () => {
  it('REQ-NET-017 만료 전 access token은 Bearer로 붙인다', async () => {
    const { auth } = setup();
    expect(await auth.prepare()).toEqual({ authorization: 'Bearer fixture-access-token-1', userId: ME, accessTokenAtRequest: 'fixture-access-token-1', refreshTokenAtRequest: 'fixture-refresh-token-1', canRefresh: true });
  });

  it('TC-NET-014 TC-AUTH-054 만료된 access token은 헤더에서 빼지만 갱신 자격(canRefresh)은 유지한다', async () => {
    const { auth } = setup(memberSession({ accessTokenExpiresAt: NOW - 1 }));
    expect(await auth.prepare()).toEqual({ authorization: null, userId: ME, accessTokenAtRequest: 'fixture-access-token-1', refreshTokenAtRequest: 'fixture-refresh-token-1', canRefresh: true });
  });

  it('TC-NET-014 TC-AUTH-054 만료 시각 정각(now == expiresAt)도 만료로 본다', async () => {
    const { auth } = setup(memberSession({ accessTokenExpiresAt: NOW }));
    expect((await auth.prepare()).authorization).toBeNull();
  });

  it('TC-NET-013 게스트(토큰 없음)는 헤더도 갱신 자격도 없다', async () => {
    const { auth } = setup(guestSession);
    expect(await auth.prepare()).toEqual({ authorization: null, userId: null, accessTokenAtRequest: null, refreshTokenAtRequest: null, canRefresh: false });
    const empty = setup(EMPTY_SESSION);
    expect((await empty.auth.prepare()).canRefresh).toBe(false);
  });

  it('REQ-NET-018 refresh token도 만료됐으면 갱신 자격이 없다', async () => {
    const { auth } = setup(memberSession({ refreshTokenExpiresAt: NOW - 1 }));
    expect((await auth.prepare()).canRefresh).toBe(false);
  });

  it('TC-TIME-028 기기 시계가 하루 빨라 만료로 오판해 헤더를 생략해도 401 → refresh로 복구된다', async () => {
    const { auth, refresher, store, clock } = setup();
    clock.setWallClock(NOW + 86_400_000); // 기기 시계가 하루 빠름: 로컬 판정은 만료
    const ctx = await auth.prepare();
    expect(ctx.authorization).toBeNull();
    refresher.respondWith(success);
    expect(await auth.handleUnauthorized(ctx)).toEqual({ kind: 'retry' });
    expect((await store.read()).tokens?.accessToken).toBe('fixture-access-token-2');
  });
});

describe('handleUnauthorized', () => {
  it('TC-NET-012 TC-NET-022 refresh 성공 시 새 토큰 4종을 저장한 뒤에야 retry를 돌려준다', async () => {
    const { auth, refresher, store } = setup();
    const ctx = await auth.prepare();
    const outcome = track(auth.handleUnauthorized(ctx));
    await flushAsync();
    expect(outcome.state).toBe('pending');
    expect(refresher.calls).toEqual(['fixture-refresh-token-1']);
    refresher.resolveAll(success);
    await flushAsync();
    expect(outcome.value).toEqual({ kind: 'retry' });
    expect(store.writes).toHaveLength(1);
    expect((await store.read()).tokens).toEqual(NEW_TOKENS);
    expect((await store.read()).userId).toBe(ME);
  });

  it('TC-NET-013 갱신 자격이 없으면(게스트) refresh하지 않고 세션도 지우지 않는다', async () => {
    const { auth, refresher, store, expired } = setup(guestSession);
    const ctx = await auth.prepare();
    expect(await auth.handleUnauthorized(ctx)).toEqual({ kind: 'not_applicable' });
    expect(refresher.calls).toHaveLength(0);
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
    expect((await store.read()).isGuest).toBe(true);
  });

  it('TC-NET-015 TC-NET-029 동시에 여러 요청이 401이면 refresh는 정확히 1건이고 모두 retry를 받는다', async () => {
    const { auth, refresher } = setup();
    const ctxs = await Promise.all([auth.prepare(), auth.prepare(), auth.prepare()]);
    const outcomes = ctxs.map((c) => track(auth.handleUnauthorized(c)));
    await flushAsync();
    expect(refresher.calls).toEqual(['fixture-refresh-token-1']);
    refresher.resolveAll(success);
    await flushAsync();
    expect(outcomes.map((o) => o.value)).toEqual([{ kind: 'retry' }, { kind: 'retry' }, { kind: 'retry' }]);
    expect(refresher.calls).toHaveLength(1);
  });

  it('TC-NET-015 첫 갱신이 끝난 뒤 새 토큰으로 보낸 요청이 다시 401이면 새 refresh token으로 새 refresh를 시작할 수 있다', async () => {
    const { auth, refresher } = setup();
    refresher.respondWith(success);
    await auth.handleUnauthorized(await auth.prepare());
    const ctx2 = await auth.prepare();
    expect(ctx2.accessTokenAtRequest).toBe('fixture-access-token-2');
    await auth.handleUnauthorized(ctx2);
    expect(refresher.calls).toEqual(['fixture-refresh-token-1', 'fixture-refresh-token-2']); // 같은 refresh token을 두 번 보내지 않는다
  });

  it('TC-NET-016 401을 받은 사이 다른 요청이 이미 토큰을 갱신했으면 refresh 없이 retry다', async () => {
    const { auth, refresher, store } = setup();
    const ctx = await auth.prepare(); // access-1로 요청이 나감
    await store.write({ userId: ME, tokens: NEW_TOKENS, isGuest: false }); // 그 사이 다른 요청이 갱신 완료
    expect(await auth.handleUnauthorized(ctx)).toEqual({ kind: 'retry' });
    expect(refresher.calls).toHaveLength(0);
  });

  it('TC-NET-016 만료로 헤더를 생략했던 요청도 그 사이 토큰이 바뀌었으면 refresh 없이 retry다', async () => {
    const { auth, refresher, store } = setup(memberSession({ accessTokenExpiresAt: NOW - 1 }));
    const ctx = await auth.prepare();
    await store.write({ userId: ME, tokens: NEW_TOKENS, isGuest: false });
    expect(await auth.handleUnauthorized(ctx)).toEqual({ kind: 'retry' });
    expect(refresher.calls).toHaveLength(0);
  });

  it('TC-NET-021 refresh가 REAUTHENTICATION_REQUIRED면 세션을 지우고 onSessionExpired를 1번 부른다', async () => {
    const { auth, refresher, store, expired } = setup();
    refresher.respondWith({ kind: 'reauthentication_required' });
    expect(await auth.handleUnauthorized(await auth.prepare())).toEqual({ kind: 'reauthentication_required' });
    expect(store.clearCount).toBe(1);
    expect(expired.count).toBe(1);
  });

  it('TC-NET-021 동시 요청이 함께 기다리다 REAUTH를 받아도 세션 삭제·이벤트는 1번이다', async () => {
    const { auth, refresher, store, expired } = setup();
    const ctx = await auth.prepare();
    const a = track(auth.handleUnauthorized(ctx));
    const b = track(auth.handleUnauthorized(ctx));
    await flushAsync();
    refresher.resolveAll({ kind: 'reauthentication_required' });
    await flushAsync();
    expect(a.value).toEqual({ kind: 'reauthentication_required' });
    expect(b.value).toEqual({ kind: 'reauthentication_required' });
    expect(store.clearCount).toBe(1);
    expect(expired.count).toBe(1);
  });

  it('TC-NET-023 TC-NET-024 TC-NET-025 TC-NET-026 refresh 일시 실패면 failed(error)이고 세션은 그대로이며 로그아웃 이벤트도 없다', async () => {
    const { auth, refresher, store, expired } = setup();
    const error = new Error('boom');
    refresher.respondWith({ kind: 'transient_failure', error });
    expect(await auth.handleUnauthorized(await auth.prepare())).toEqual({ kind: 'failed', error });
    expect(store.clearCount).toBe(0);
    expect(store.writes).toHaveLength(0);
    expect(expired.count).toBe(0);
    expect((await store.read()).tokens?.refreshToken).toBe('fixture-refresh-token-1');
  });

  it('TC-NET-023 일시 실패 뒤 다음 401은 새 refresh를 시도할 수 있다(자동 재시도는 없지만 영구 차단도 아니다)', async () => {
    const { auth, refresher } = setup();
    refresher.respondWith({ kind: 'transient_failure', error: new Error('x') });
    await auth.handleUnauthorized(await auth.prepare());
    refresher.respondWith(success);
    expect(await auth.handleUnauthorized(await auth.prepare())).toEqual({ kind: 'retry' });
    expect(refresher.calls).toHaveLength(2);
  });

  it('TC-NET-027 refresh 도중 로그아웃되면 새 토큰을 저장하지 않고 세션을 되살리지 않는다', async () => {
    const { auth, refresher, store } = setup();
    const outcome = track(auth.handleUnauthorized(await auth.prepare()));
    await flushAsync();
    await store.clear(); // 사용자가 로그아웃
    refresher.resolveAll(success);
    await flushAsync();
    expect(store.writes).toHaveLength(0);
    expect(await store.read()).toEqual(EMPTY_SESSION);
    expect(outcome.value).toEqual({ kind: 'failed', error: expect.any(SessionChangedError) });
  });

  it('TC-NET-027 TC-NET-057 refresh 도중 다른 계정으로 전환되면 이전 계정의 토큰을 저장하지 않는다', async () => {
    const { auth, refresher, store } = setup();
    const outcome = track(auth.handleUnauthorized(await auth.prepare()));
    await flushAsync();
    const other = memberSession({ accessToken: 'b-access', refreshToken: 'b-refresh' });
    await store.write({ ...other, userId: OTHER_USER });
    store.writes.length = 0;
    refresher.resolveAll(success);
    await flushAsync();
    expect(store.writes).toHaveLength(0);
    expect((await store.read()).userId).toBe(OTHER_USER);
    expect((await store.read()).tokens?.accessToken).toBe('b-access');
    expect(outcome.value).toEqual({ kind: 'failed', error: expect.any(SessionChangedError) });
  });

  it('TC-NET-028 한 요청이 취소돼도 refresh는 계속되어 다른 대기 요청이 retry를 받는다', async () => {
    const { auth, refresher } = setup();
    const ctx = await auth.prepare();
    const cancelled = new AbortController();
    const a = track(auth.handleUnauthorized(ctx, cancelled.signal));
    const b = track(auth.handleUnauthorized(ctx));
    await flushAsync();
    cancelled.abort();
    await flushAsync();
    expect(a.state).toBe('rejected');
    expect((a.error as DOMException).name).toBe('AbortError');
    expect(b.state).toBe('pending');
    refresher.resolveAll(success);
    await flushAsync();
    expect(b.value).toEqual({ kind: 'retry' });
    expect(refresher.calls).toHaveLength(1);
  });
});

describe('handleReauthenticationRequired (일반 API가 받은 401 REAUTHENTICATION_REQUIRED)', () => {
  it('TC-NET-020 refresh를 부르지 않고 세션을 지운 뒤 onSessionExpired를 부른다', async () => {
    const { auth, refresher, store, expired } = setup();
    const ctx = await auth.prepare();
    expect(await auth.handleReauthenticationRequired(ctx)).toEqual({ kind: 'reauthentication_required' });
    expect(refresher.calls).toHaveLength(0);
    expect(store.clearCount).toBe(1);
    expect(expired.count).toBe(1);
  });

  it('TC-NET-019 늦게 도착한 REAUTH인데 그 사이 토큰이 이미 갱신됐으면 세션을 지우지 않고 retry다', async () => {
    const { auth, store, expired } = setup();
    const ctx = await auth.prepare();
    await store.write({ userId: ME, tokens: NEW_TOKENS, isGuest: false });
    expect(await auth.handleReauthenticationRequired(ctx)).toEqual({ kind: 'retry' });
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
  });
});

describe('세션이 바뀐 요청 (계정 전환, 다른 요청·탭의 갱신)', () => {
  it('TC-NET-057 TC-AUTH-042 요청 뒤 다른 계정으로 전환됐으면 refresh도 retry도 하지 않고 SessionChangedError로 실패한다', async () => {
    const { auth, refresher, store } = setup();
    const ctx = await auth.prepare();
    await store.write({ ...memberSession({ accessToken: 'b-access', refreshToken: 'b-refresh' }), userId: OTHER_USER });
    const outcome = await auth.handleUnauthorized(ctx);
    expect(outcome).toEqual({ kind: 'failed', error: expect.any(SessionChangedError) });
    expect(refresher.calls).toHaveLength(0);
  });

  it('TC-NET-057 REAUTH를 받은 요청도 다른 계정으로 전환됐으면 그 계정의 세션을 지우지 않는다', async () => {
    const { auth, store, expired } = setup();
    const ctx = await auth.prepare();
    await store.write({ ...memberSession({ accessToken: 'b-access', refreshToken: 'b-refresh' }), userId: OTHER_USER });
    expect(await auth.handleReauthenticationRequired(ctx)).toEqual({ kind: 'failed', error: expect.any(SessionChangedError) });
    expect(store.clearCount).toBe(0);
    expect(expired.count).toBe(0);
  });

  it('TC-NET-016 401을 처리하는 동안 다른 refresh가 끝나 refresh token이 바뀌었으면 네트워크 없이 retry다(옛 token을 다시 보내지 않는다)', async () => {
    const { auth, refresher, store } = setup();
    const ctx = await auth.prepare();
    // access token 문자열은 같고 refresh token만 회전된 경우도 "바뀜"으로 본다.
    await store.write({ userId: ME, tokens: tokens({ refreshToken: 'fixture-refresh-token-2' }), isGuest: false });
    expect(await auth.handleUnauthorized(ctx)).toEqual({ kind: 'retry' });
    expect(refresher.calls).toHaveLength(0);
  });

  it('TC-NET-015 락을 기다리는 사이 앞선 refresh가 끝나면 뒤 요청은 refresh 없이 retry다(서로 다른 ctx 상태)', async () => {
    const { auth, refresher } = setup();
    const staleCtx = await auth.prepare();
    const first = track(auth.handleUnauthorized(staleCtx));
    await flushAsync();
    // 첫 refresh가 진행되는 동안 같은 옛 토큰으로 보낸 요청이 또 401을 받는다.
    const second = track(auth.handleUnauthorized({ ...staleCtx }));
    refresher.resolveAll(success);
    await flushAsync();
    expect([first.value, second.value]).toEqual([{ kind: 'retry' }, { kind: 'retry' }]);
    expect(refresher.calls).toEqual(['fixture-refresh-token-1']);
  });

  it('TC-NET-015 TC-NET-029 두 탭(같은 저장소·같은 락, 별도 AuthCoordinator)이 동시에 401을 받아도 refresh는 1회다', async () => {
    const { makeAuth, refresher } = setup();
    const tabA = makeAuth();
    const tabB = makeAuth();
    const [ctxA, ctxB] = await Promise.all([tabA.prepare(), tabB.prepare()]);
    const a = track(tabA.handleUnauthorized(ctxA));
    const b = track(tabB.handleUnauthorized(ctxB));
    await flushAsync();
    expect(refresher.calls).toEqual(['fixture-refresh-token-1']);
    refresher.resolveAll(success);
    await flushAsync();
    expect([a.value, b.value]).toEqual([{ kind: 'retry' }, { kind: 'retry' }]);
    expect(refresher.calls).toHaveLength(1);
  });

  it('TC-NET-015 refresh는 락 안에서만 실행된다(다른 탭이 락을 쥐고 있으면 기다린다)', async () => {
    const { makeAuth, refresher } = setup();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const lock = new InProcessRefreshLock();
    const auth = makeAuth(lock);
    const other = lock.withLock(() => held); // 다른 탭이 refresh 중
    const outcome = track(auth.handleUnauthorized(await auth.prepare()));
    await flushAsync();
    expect(refresher.calls).toHaveLength(0);
    release();
    await other;
    await flushAsync();
    expect(refresher.calls).toHaveLength(1);
    refresher.resolveAll(success);
    await flushAsync();
    expect(outcome.value).toEqual({ kind: 'retry' });
  });

  it('TC-NET-021 REAUTH 401이 동시에 여러 건 와도 세션 삭제와 onSessionExpired는 1번이다', async () => {
    const { auth, store, expired } = setup();
    const ctx = await auth.prepare();
    const outcomes = await Promise.all([1, 2, 3, 4, 5].map(() => auth.handleReauthenticationRequired({ ...ctx })));
    expect(outcomes.every((o) => o.kind === 'reauthentication_required')).toBe(true);
    expect(store.clearCount).toBe(1);
    expect(expired.count).toBe(1);
  });

  it('저장소 읽기가 실패하면 세션 없음으로 본다(헤더 없음, 갱신 자격 없음)', async () => {
    const { auth, store } = setup();
    store.read = () => Promise.reject(new Error('IndexedDB unavailable'));
    expect(await auth.prepare()).toEqual({ authorization: null, userId: null, accessTokenAtRequest: null, refreshTokenAtRequest: null, canRefresh: false });
  });
});
