import { SecureSessionStore, SESSION_STORAGE_KEY } from '../../core/session/SecureSessionStore';
import { FakeSecureKeyValueStorage } from '../../core/session/__testing__/FakeSecureKeyValueStorage';
import type { SessionState } from '../../core/session/SessionStore';
import { createNetHarness } from '../../core/http/__testing__/createNetHarness';
import { loadFixture } from '../../core/http/__testing__/loadFixture';
import { FakeClock } from '../../core/time/FakeClock';
import { AuthGate } from './AuthGate';

type StorageFixture = { stored: Record<string, string> };

/** boot/session__*.json 의 stored를 SecureSessionStore가 읽는 저장 형식으로 옮긴다. */
function seedFromFixture(storage: FakeSecureKeyValueStorage, name: string): void {
  const { stored } = loadFixture<StorageFixture>(`boot/${name}`);
  storage.data.set(SESSION_STORAGE_KEY, JSON.stringify({ v: 1, kind: 'authenticated', ...stored }));
}

function setup(now = '2026-10-27T03:00:00Z') {
  const clock = new FakeClock(now);
  const storage = new FakeSecureKeyValueStorage();
  const sessionStore = new SecureSessionStore(storage);
  return { clock, storage, sessionStore, gate: new AuthGate(sessionStore, clock) };
}

describe('AuthGate 판정', () => {
  it('TC-BOOT-001 저장된 세션도 게스트 플래그도 없으면 signed-out이다', async () => {
    const { gate } = setup();
    await expect(gate.resolve()).resolves.toEqual({ kind: 'signed-out' });
  });

  it('TC-BOOT-002 userId와 만료 전 refresh token이 있으면 authenticated다', async () => {
    const { gate, storage } = setup();
    seedFromFixture(storage, 'session__authenticated');
    await expect(gate.resolve()).resolves.toEqual({
      kind: 'authenticated',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('TC-BOOT-003 게스트 플래그만 있으면 guest이고 저장소를 바꾸지 않는다', async () => {
    const { gate, sessionStore, storage } = setup();
    await sessionStore.enterGuest();
    const writes = storage.writes.length;
    await expect(gate.resolve()).resolves.toEqual({ kind: 'guest' });
    expect(storage.writes).toHaveLength(writes);
  });

  it('TC-BOOT-004 refresh token이 만료됐으면 세션을 지우고 signed-out이다', async () => {
    const { gate, storage, sessionStore } = setup('2026-11-27T00:00:00Z');
    seedFromFixture(storage, 'session__authenticated'); // refresh 만료 2026-11-26T03:00:00Z
    await expect(gate.resolve()).resolves.toEqual({ kind: 'signed-out' });
    expect(await sessionStore.load()).toEqual({ kind: 'none' });
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it.each([
    ['now−1초(이미 지남)', -1000, 'signed-out'],
    ['now와 같음(이하는 만료)', 0, 'signed-out'],
    ['now+1초', 1000, 'authenticated'],
  ])('TC-BOOT-005 refresh 만료 시각이 %s이면 %s로 판정한다', async (_label, offsetMs, expected) => {
    const h = createNetHarness();
    const gate = new AuthGate(h.sessionStore, h.clock);
    await h.signIn({ refreshTokenExpiresAt: new Date(h.clock.now().getTime() + offsetMs) });
    expect((await gate.resolve()).kind).toBe(expected);
  });

  it('TC-BOOT-006 userId만 있고 토큰 필드가 없는 불완전 세션은 지우고 signed-out이다', async () => {
    const { gate, storage } = setup();
    const { stored } = loadFixture<StorageFixture>('boot/session__partial');
    storage.data.set(
      SESSION_STORAGE_KEY,
      JSON.stringify({ v: 1, kind: 'authenticated', ...stored }),
    );
    await expect(gate.resolve()).resolves.toEqual({ kind: 'signed-out' });
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('TC-BOOT-007 복호화할 수 없는 저장소(읽기 예외)는 크래시 없이 signed-out이고 정리한다', async () => {
    const { gate, storage } = setup();
    seedFromFixture(storage, 'session__authenticated');
    storage.failNextRead = true;
    await expect(gate.resolve()).resolves.toEqual({ kind: 'signed-out' });
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('TC-BOOT-007 손상된 값(JSON 아님)도 signed-out이고 정리한다', async () => {
    const { gate, storage } = setup();
    storage.data.set(SESSION_STORAGE_KEY, '!!undecryptable-ciphertext!!');
    await expect(gate.resolve()).resolves.toEqual({ kind: 'signed-out' });
    expect(storage.data.has(SESSION_STORAGE_KEY)).toBe(false);
  });

  it('TC-BOOT-008 인증 세션과 게스트 플래그가 같이 있어도(인증 세션이 우선) authenticated다', async () => {
    // SessionStore는 한 번에 한 종류만 저장하므로 load()가 인증 세션을 돌려주는 상황이 곧 "인증 우선"이다.
    const h = createNetHarness();
    await h.sessionStore.enterGuest();
    await h.signIn(); // saveAuthenticated는 게스트 플래그를 지운다
    const decision = await new AuthGate(h.sessionStore, h.clock).resolve();
    expect(decision.kind).toBe('authenticated');
  });

  it('TC-BOOT-009 access token만 만료됐고 refresh가 유효하면 authenticated이며 네트워크 요청이 없다(갱신은 첫 인증 요청에서)', async () => {
    const h = createNetHarness();
    const now = h.clock.now().getTime();
    await h.signIn({ accessTokenExpiresAt: new Date(now - 60_000) });
    const decision = await new AuthGate(h.sessionStore, h.clock).resolve();
    expect(decision.kind).toBe('authenticated');
    expect(h.transport.requests).toHaveLength(0);
  });

  it('TC-BOOT-009 fixture session__access-expired(access 만료)도 authenticated다', async () => {
    const { gate, storage } = setup();
    seedFromFixture(storage, 'session__access-expired');
    await expect(gate.resolve()).resolves.toMatchObject({ kind: 'authenticated' });
  });
});

describe('AuthGate 타입', () => {
  it('SessionState 종류 3가지를 모두 다룬다', () => {
    const kinds: SessionState['kind'][] = ['none', 'guest', 'authenticated'];
    expect(kinds).toHaveLength(3);
  });
});
