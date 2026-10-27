import { AccountService } from './AccountService';
import { AuthApi } from './AuthApi';
import { SessionEvents } from '../../core/auth/SessionEvents';
import type { SignedOutReason } from '../../core/auth/SessionEvents';
import { UserCaches } from '../../core/auth/UserCaches';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';
import { ToastController } from '../../core/ui/ToastController';
import { t } from '../../copy/ko';
import { makeApiEnv } from '../../test/apiEnv';
import { flushAsync } from '../../test/FakeClock';
import { networkFailure } from '../../test/fakeFetch';
import { guestSession, loadFixture, memberSession } from '../../test/fixtures';
import { SequentialIdGenerator } from '../../test/sequentialIds';
import type { StoredSession } from '../../core/auth/SessionStore';

function setup(session: StoredSession = memberSession()) {
  const env = makeApiEnv(session);
  const toast = new ToastController({ clock: env.clock, ids: new SequentialIdGenerator() });
  // 재시도 대기를 넘기려고 시계를 크게 돌리면 2.5초 토스트가 만료되므로, 띄운 문구를 따로 기록한다.
  const shownToasts: string[] = [];
  const show = toast.show.bind(toast);
  toast.show = (message: string) => {
    shownToasts.push(message);
    show(message);
  };
  const events = new SessionEvents();
  const reasons: SignedOutReason[] = [];
  events.subscribe((r) => reasons.push(r));
  const caches = new UserCaches();
  const cacheClears = { count: 0 };
  caches.register({ clear: () => void (cacheClears.count += 1) });
  const authApi = new AuthApi({ api: env.client(), clock: env.clock });
  const service = new AccountService({ authApi, store: env.store, userCaches: caches, toast, sessionEvents: events, logger: env.logger });
  const fixture = (path: string) => () => loadFixture(path).toResponse();
  return { ...env, toast, shownToasts, reasons, cacheClears, service, fixture };
}

const toastMessage = (toast: ToastController) => toast.state.toast?.message ?? null;

describe('AccountService.logout', () => {
  it('TC-AUTH-035 로컬 토큰·캐시를 먼저 지운 뒤 POST /auth/logout {refreshToken}을 보내고, 끝나면 로그인으로 보낸다', async () => {
    const s = setup();
    const atRequest: { storeCleared: boolean; cachesCleared: number; reasons: number }[] = [];
    s.ff.route('POST /auth/logout', () => {
      atRequest.push({ storeCleared: s.store.clearCount === 1, cachesCleared: s.cacheClears.count, reasons: s.reasons.length });
      return loadFixture('auth/logout__no-content.json').toResponse();
    });
    await s.service.logout();
    expect(atRequest).toEqual([{ storeCleared: true, cachesCleared: 1, reasons: 0 }]);
    const [call] = s.ff.callsTo('POST /auth/logout');
    expect(JSON.parse(call!.body as string)).toEqual({ refreshToken: 'fixture-refresh-token-1' });
    expect(call!.headers['authorization']).toBeUndefined();
    expect(await s.store.read()).toEqual(EMPTY_SESSION);
    expect(s.reasons).toEqual(['logout']);
  });

  it('TC-AUTH-036 로그아웃 요청이 500, 401, 네트워크 오류로 실패해도 무시하고 로그인으로 가며 토큰은 이미 지워져 있다', async () => {
    const responders = [
      () => loadFixture('auth/logout__internal-error.json').toResponse(),
      () => loadFixture('common/error__unauthorized-token-invalid.json').toResponse(),
      networkFailure,
    ];
    for (const responder of responders) {
      const s = setup();
      s.ff.route('POST /auth/logout', responder);
      const done = s.service.logout();
      await s.clock.advance(60_000);
      await expect(done).resolves.toBeUndefined();
      expect(await s.store.read()).toEqual(EMPTY_SESSION);
      expect(s.reasons).toEqual(['logout']);
      expect(toastMessage(s.toast)).toBeNull();
      expect(s.ff.callsTo('POST /auth/logout')).toHaveLength(1);
      expect(s.ff.callsTo('POST /auth/refresh')).toHaveLength(0);
    }
  });

  it('TC-AUTH-038 refresh token이 없는 세션(게스트)은 서버 호출 없이 로컬만 정리하고 로그인으로 보낸다', async () => {
    const s = setup(guestSession);
    await s.service.logout();
    expect(s.ff.calls).toHaveLength(0);
    expect(await s.store.read()).toEqual(EMPTY_SESSION);
    expect(s.cacheClears.count).toBe(1);
    expect(s.reasons).toEqual(['logout']);
  });

  it('TC-AUTH-039 로그아웃이 보내는 요청은 POST /auth/logout 하나뿐이다(푸시 기기 해제 API 호출 0건)', async () => {
    const s = setup();
    s.ff.route('POST /auth/logout', s.fixture('auth/logout__no-content.json'));
    await s.service.logout();
    expect(s.ff.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /auth/logout']);
  });

  it('TC-AUTH-040 로그아웃을 연타해도 요청 1회, 로컬 정리 1회, 이동 1회이다', async () => {
    const s = setup();
    s.ff.route('POST /auth/logout', s.fixture('auth/logout__no-content.json'));
    await Promise.all([s.service.logout(), s.service.logout(), s.service.logout()]);
    expect(s.ff.callsTo('POST /auth/logout')).toHaveLength(1);
    expect(s.store.clearCount).toBe(1);
    expect(s.cacheClears.count).toBe(1);
    expect(s.reasons).toEqual(['logout']);
  });

  it('TC-AUTH-041 로그아웃하면 등록된 사용자 캐시를 모두 비운다', async () => {
    const s = setup();
    s.ff.route('POST /auth/logout', s.fixture('auth/logout__no-content.json'));
    await s.service.logout();
    expect(s.cacheClears.count).toBe(1);
  });

  it('REQ-AUTH-031 로그에 refresh token이 남지 않는다', async () => {
    const s = setup();
    s.ff.route('POST /auth/logout', s.fixture('auth/logout__internal-error.json'));
    const done = s.service.logout();
    await s.clock.advance(60_000);
    await done;
    expect(s.logger.dump()).not.toContain('fixture-refresh-token-1');
  });
});

describe('AccountService.withdraw', () => {
  it('TC-AUTH-043 TC-AUTH-046 DELETE /users/me가 204일 때만 로컬 세션·캐시를 지우고 로그인으로 보낸다(요청 시점에는 아직 세션이 있다)', async () => {
    const s = setup();
    const atRequest: boolean[] = [];
    s.ff.route('DELETE /users/me', () => {
      atRequest.push(s.store.clearCount === 0 && s.cacheClears.count === 0);
      return loadFixture('auth/users-me__delete-no-content.json').toResponse();
    });
    expect(await s.service.withdraw()).toEqual({ kind: 'done' });
    expect(atRequest).toEqual([true]);
    expect(s.ff.callsTo('DELETE /users/me')[0]!.body).toBeNull();
    expect(await s.store.read()).toEqual(EMPTY_SESSION);
    expect(s.cacheClears.count).toBe(1);
    expect(s.reasons).toEqual(['withdrawn']);
    expect(toastMessage(s.toast)).toBeNull();
  });

  it('TC-AUTH-044 요청이 500이면 세션을 유지하고 토스트 "요청을 처리하지 못했어요. 다시 시도해 주세요."를 보인다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-internal-error.json'));
    const done = s.service.withdraw();
    await s.clock.advance(60_000);
    expect(await done).toEqual({ kind: 'failed' });
    expect(s.shownToasts).toEqual([t('auth.withdraw.error')]);
    expect(s.shownToasts).toEqual(['요청을 처리하지 못했어요. 다시 시도해 주세요.']);
    expect(await s.store.read()).toEqual(memberSession());
    expect(s.cacheClears.count).toBe(0);
    expect(s.reasons).toEqual([]);
    expect(s.ff.callsTo('DELETE /users/me')).toHaveLength(3); // DELETE는 멱등이라 5xx에 2회 재시도(D-21)
  });

  it('TC-AUTH-044 네트워크 오류도 같은 토스트이고 세션을 유지한다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', networkFailure);
    const done = s.service.withdraw();
    await s.clock.advance(60_000);
    expect(await done).toEqual({ kind: 'failed' });
    expect(s.shownToasts).toEqual([t('auth.withdraw.error')]);
    expect(await s.store.read()).toEqual(memberSession());
  });

  it('TC-AUTH-045 401 UNAUTHORIZED면 refresh 후 원 요청을 1회 재전송하고 204면 성공으로 처리한다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-unauthorized.json'), s.fixture('auth/users-me__delete-no-content.json'));
    s.ff.route('POST /auth/refresh', s.fixture('auth/refresh__success.json'));
    expect(await s.service.withdraw()).toEqual({ kind: 'done' });
    expect(s.ff.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /users/me', 'POST /auth/refresh', 'DELETE /users/me']);
    expect(await s.store.read()).toEqual(EMPTY_SESSION);
    expect(s.reasons).toEqual(['withdrawn']);
  });

  it('TC-AUTH-045 갱신이 실패하면 세션을 유지하고 토스트를 보인다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-unauthorized.json'));
    s.ff.route('POST /auth/refresh', s.fixture('auth/refresh__internal-error.json'));
    const done = s.service.withdraw();
    await s.clock.advance(60_000);
    expect(await done).toEqual({ kind: 'failed' });
    expect(await s.store.read()).toEqual(memberSession());
    expect(s.shownToasts).toEqual([t('auth.withdraw.error')]);
  });

  it('REQ-AUTH-028 REAUTHENTICATION_REQUIRED면 세션 정리는 갱신 계층이 하고, 탈퇴 실패 토스트는 보이지 않는다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-unauthorized.json'));
    s.ff.route('POST /auth/refresh', s.fixture('auth/refresh__reauthentication-required.json'));
    const outcome = await s.service.withdraw();
    expect(outcome.kind).toBe('failed');
    expect(s.expired.count).toBe(1);
    expect(toastMessage(s.toast)).toBeNull();
    expect(s.reasons).toEqual([]); // 'withdrawn' 아님
  });

  it('TC-AUTH-047 탈퇴가 보내는 요청은 DELETE /users/me 하나뿐이다(카카오 SDK 연결 해제 호출 0건)', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-no-content.json'));
    await s.service.withdraw();
    expect(s.ff.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['DELETE /users/me']);
    expect(s.ff.calls.some((c) => c.url.includes('kakao'))).toBe(false);
  });

  it('TC-AUTH-048 탈퇴를 연타해도 DELETE는 1회이다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-no-content.json'));
    const results = await Promise.all([s.service.withdraw(), s.service.withdraw(), s.service.withdraw()]);
    expect(s.ff.callsTo('DELETE /users/me')).toHaveLength(1);
    expect(results.every((r) => r.kind === 'done')).toBe(true);
    expect(s.reasons).toEqual(['withdrawn']);
  });

  it('TC-AUTH-049 요청 중 화면을 벗어나(취소) 오류 토스트가 보이지 않고 세션은 유지된다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', () => new Promise<Response>(() => {})); // 응답이 오지 않는다
    const controller = new AbortController();
    const done = s.service.withdraw(controller.signal);
    await flushAsync();
    controller.abort();
    expect(await done).toEqual({ kind: 'cancelled' });
    expect(toastMessage(s.toast)).toBeNull();
    expect(await s.store.read()).toEqual(memberSession());
  });

  it('TC-AUTH-049 204가 이미 도착했다면 이후 취소와 상관없이 로컬 세션은 정리된다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-no-content.json'));
    const controller = new AbortController();
    const done = s.service.withdraw(controller.signal);
    expect(await done).toEqual({ kind: 'done' });
    controller.abort();
    expect(await s.store.read()).toEqual(EMPTY_SESSION);
    expect(toastMessage(s.toast)).toBeNull();
  });

  it('TC-AUTH-041 탈퇴하면 등록된 사용자 캐시를 모두 비운다', async () => {
    const s = setup();
    s.ff.route('DELETE /users/me', s.fixture('auth/users-me__delete-no-content.json'));
    await s.service.withdraw();
    expect(s.cacheClears.count).toBe(1);
  });
});
