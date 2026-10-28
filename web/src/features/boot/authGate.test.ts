import { resolveAuthGate } from './authGate';
import { EMPTY_SESSION } from '../../core/auth/SessionStore';
import type { StoredSession } from '../../core/auth/SessionStore';
import { FakeClock } from '../../test/FakeClock';
import { FakeSessionStore } from '../../test/FakeSessionStore';
import { NOW, ME, memberSession, tokens } from '../../test/fixtures';
import { RecordingLogger } from '../../test/RecordingLogger';
import { loadStorageFixture } from '../../test/sessionFixtures';

function setup(session: StoredSession) {
  const store = new FakeSessionStore(session);
  const logger = new RecordingLogger();
  const clock = new FakeClock(NOW);
  const decide = () => resolveAuthGate({ store, clock, logger });
  return { store, logger, clock, decide };
}

describe('인증 게이트 판정', () => {
  it('TC-BOOT-001 저장된 세션도 게스트 플래그도 없으면 로그인이고 저장소를 건드리지 않는다', async () => {
    const fixture = loadStorageFixture('session__empty');
    const { decide, store } = setup(fixture.session);
    expect(fixture.expect.destination).toBe('login');
    expect(await decide()).toEqual({ destination: 'login' });
    expect(store.clearCount).toBe(0);
    expect(store.writes).toHaveLength(0);
  });

  it('TC-BOOT-002 userId와 만료 전 refresh token이 있으면 로그인 없이 홈(회원)이다', async () => {
    const { session } = loadStorageFixture('session__authenticated');
    const { decide, store } = setup(session);
    expect(await decide()).toEqual({ destination: 'home', mode: 'member' });
    expect(store.clearCount).toBe(0);
  });

  it('TC-BOOT-003 게스트 플래그만 있으면 홈(게스트 제한 모드)이고 저장소를 바꾸지 않는다', async () => {
    const { session } = loadStorageFixture('session__guest');
    const { decide, store } = setup(session);
    expect(await decide()).toEqual({ destination: 'home', mode: 'guest' });
    expect(store.clearCount).toBe(0);
    expect(store.writes).toHaveLength(0);
  });

  it('TC-BOOT-004 refresh token 만료 시각이 지났으면 세션을 지우고 로그인이다', async () => {
    const fixture = loadStorageFixture('session__expired-refresh');
    const { decide, store } = setup(fixture.session);
    expect(await decide()).toEqual({ destination: 'login' });
    expect(fixture.expect.storageCleared).toBe(true);
    expect(await store.read()).toEqual(EMPTY_SESSION);
    expect(store.clearCount).toBe(1);
  });

  it.each([
    { label: 'now−1초', offsetMs: -1000, destination: 'login' },
    { label: 'now', offsetMs: 0, destination: 'login' },
    { label: 'now+1초', offsetMs: 1000, destination: 'home' },
  ])('TC-BOOT-005 refresh 만료 시각이 $label이면 $destination (만료 시각 이하는 만료)', async ({ offsetMs, destination }) => {
    const { decide } = setup(memberSession({ refreshTokenExpiresAt: NOW + offsetMs }));
    expect((await decide()).destination).toBe(destination);
  });

  it('TC-BOOT-006 userId만 있고 토큰이 없는 불완전 세션은 지우고 로그인이다', async () => {
    const fixture = loadStorageFixture('session__partial');
    expect(fixture.session).toMatchObject({ userId: ME, tokens: null });
    const { decide, store } = setup(fixture.session);
    expect(await decide()).toEqual({ destination: 'login' });
    expect(store.clearCount).toBe(1);
    expect(await store.read()).toEqual(EMPTY_SESSION);
  });

  it('TC-BOOT-007 저장소를 읽을 수 없으면(손상·복호화 실패) 크래시 없이 정리하고 로그인이다', async () => {
    const fixture = loadStorageFixture('session__corrupted');
    expect(fixture.expect).toMatchObject({ destination: 'login', storageCleared: true, crash: false });
    const { decide, store, logger } = setup(EMPTY_SESSION);
    vi.spyOn(store, 'read').mockRejectedValue(new Error('cannot decrypt'));
    await expect(decide()).resolves.toEqual({ destination: 'login' });
    expect(store.clearCount).toBe(1);
    expect(logger.dump()).not.toContain('fixture-');
  });

  it('TC-BOOT-007 정리(clear)마저 실패해도 던지지 않고 로그인이다', async () => {
    const { decide, store } = setup(EMPTY_SESSION);
    vi.spyOn(store, 'read').mockRejectedValue(new Error('cannot decrypt'));
    vi.spyOn(store, 'clear').mockRejectedValue(new Error('idb gone'));
    await expect(decide()).resolves.toEqual({ destination: 'login' });
  });

  it('TC-BOOT-008 인증 세션과 게스트 플래그가 함께 있으면 인증 세션이 우선(회원 모드)이다', async () => {
    const fixture = loadStorageFixture('session__authenticated-and-guest');
    expect(fixture.session.isGuest).toBe(true);
    const { decide } = setup(fixture.session);
    expect(await decide()).toEqual({ destination: 'home', mode: 'member' });
  });

  it('TC-BOOT-009 access token만 만료됐고 refresh token이 유효하면 로그아웃으로 보지 않고 홈(회원)이다', async () => {
    const fixture = loadStorageFixture('session__access-expired');
    const { decide, store } = setup(fixture.session);
    expect(await decide()).toEqual({ destination: 'home', mode: 'member' });
    expect(store.clearCount).toBe(0);
  });

  it('TC-BOOT-009 복원된 새 탭처럼 access token이 빈 값·만료 0이어도 refresh가 유효하면 홈(회원)이다', async () => {
    const { decide } = setup({ userId: ME, tokens: tokens({ accessToken: '', accessTokenExpiresAt: 0 }), isGuest: false });
    expect(await decide()).toEqual({ destination: 'home', mode: 'member' });
  });
});
