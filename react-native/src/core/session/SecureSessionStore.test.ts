import { SESSION_STORAGE_KEY, SecureSessionStore } from './SecureSessionStore';
import type { SessionCredentials } from './SessionStore';
import { FakeSecureKeyValueStorage } from './__testing__/FakeSecureKeyValueStorage';

const NOW = new Date('2026-10-27T00:00:00.000Z');
const credentials = (overrides: Partial<SessionCredentials> = {}): SessionCredentials => ({
  userId: 'user-a',
  accessToken: 'access-1',
  accessTokenExpiresAt: new Date(NOW.getTime() + 900_000),
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: new Date(NOW.getTime() + 2_592_000_000),
  ...overrides,
});
const tokens = (access: string, refresh: string) => ({
  accessToken: access,
  accessTokenExpiresAt: new Date(NOW.getTime() + 900_000),
  refreshToken: refresh,
  refreshTokenExpiresAt: new Date(NOW.getTime() + 2_592_000_000),
});

describe('SecureSessionStore', () => {
  let storage: FakeSecureKeyValueStorage;
  let store: SecureSessionStore;
  beforeEach(() => {
    storage = new FakeSecureKeyValueStorage();
    store = new SecureSessionStore(storage);
  });

  it('저장된 것이 없으면 none이다', async () => {
    expect(await store.load()).toEqual({ kind: 'none' });
  });

  it('TC-AUTH-052 userId, 토큰 2종, 만료 2종이 왕복 저장·복원된다(만료는 Date)', async () => {
    await store.saveAuthenticated(credentials());
    const restored = await new SecureSessionStore(storage).load();
    expect(restored).toEqual({ kind: 'authenticated', credentials: credentials() });
    if (restored.kind === 'authenticated') {
      expect(restored.credentials.accessTokenExpiresAt).toBeInstanceOf(Date);
    }
  });

  it('TC-AUTH-053 REQ-AUTH-023 보안 저장소 어댑터에만 쓰고 저장 키는 SESSION_STORAGE_KEY 하나뿐이다', async () => {
    await store.saveAuthenticated(credentials());
    await store.replaceTokensIfCurrent('refresh-1', tokens('access-2', 'refresh-2'));
    await store.enterGuest();
    expect([...storage.data.keys()]).toEqual([SESSION_STORAGE_KEY]);
    expect(new Set(storage.writes)).toEqual(new Set([SESSION_STORAGE_KEY]));
  });

  it('TC-AUTH-032 enterGuest는 인증 자격을 지우고 게스트 플래그를 저장하며 재시작 후에도 유지된다', async () => {
    await store.saveAuthenticated(credentials());
    await store.enterGuest();
    expect(await new SecureSessionStore(storage).load()).toEqual({ kind: 'guest' });
    expect(JSON.stringify([...storage.data.values()])).not.toContain('access-1');
    expect(JSON.stringify([...storage.data.values()])).not.toContain('refresh-1');
  });

  it('TC-AUTH-034 인증 세션을 저장하면 게스트 플래그가 사라진다', async () => {
    await store.enterGuest();
    await store.saveAuthenticated(credentials());
    expect((await store.load()).kind).toBe('authenticated');
  });

  it('clear는 모든 항목을 지운다', async () => {
    await store.saveAuthenticated(credentials());
    await store.clear();
    expect(await store.load()).toEqual({ kind: 'none' });
    expect(storage.data.size).toBe(0);
  });

  it('게스트 상태도 clear하면 none이 된다', async () => {
    await store.enterGuest();
    await store.clear();
    expect(await store.load()).toEqual({ kind: 'none' });
  });

  describe('replaceTokensIfCurrent', () => {
    it('TC-NET-022 REQ-AUTH-027 현재 refresh token이 같으면 access·refresh를 함께 교체하고 userId는 유지한다', async () => {
      await store.saveAuthenticated(credentials());
      expect(await store.replaceTokensIfCurrent('refresh-1', tokens('access-2', 'refresh-2'))).toBe(
        true,
      );
      expect(await store.load()).toEqual({
        kind: 'authenticated',
        credentials: credentials({ ...tokens('access-2', 'refresh-2') }),
      });
    });

    it('TC-NET-027 로그아웃(세션 없음) 뒤에는 저장하지 않고 되살리지 않는다', async () => {
      await store.saveAuthenticated(credentials());
      await store.clear();
      expect(await store.replaceTokensIfCurrent('refresh-1', tokens('access-2', 'refresh-2'))).toBe(
        false,
      );
      expect(await store.load()).toEqual({ kind: 'none' });
    });

    it('TC-NET-027 계정 전환(다른 refresh token) 뒤에는 새 계정 세션을 덮어쓰지 않는다', async () => {
      await store.saveAuthenticated(
        credentials({ userId: 'user-b', accessToken: 'access-b', refreshToken: 'refresh-b' }),
      );
      expect(await store.replaceTokensIfCurrent('refresh-1', tokens('access-2', 'refresh-2'))).toBe(
        false,
      );
      const state = await store.load();
      expect(state.kind === 'authenticated' && state.credentials.userId).toBe('user-b');
    });

    it('게스트 상태에서는 교체하지 않는다', async () => {
      await store.enterGuest();
      expect(await store.replaceTokensIfCurrent('refresh-1', tokens('a', 'r'))).toBe(false);
      expect(await store.load()).toEqual({ kind: 'guest' });
    });

    it('TC-NET-029 같은 expected로 동시에 교체하면 한쪽만 성공한다(직렬화)', async () => {
      storage.latencyTicks = 3;
      await store.saveAuthenticated(credentials());
      const results = await Promise.all([
        store.replaceTokensIfCurrent('refresh-1', tokens('access-2', 'refresh-2')),
        store.replaceTokensIfCurrent('refresh-1', tokens('access-3', 'refresh-3')),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('REQ-AUTH-027 쓰기가 실패하면 이전 세션이 그대로 남고 reject한다(부분 저장 없음)', async () => {
      await store.saveAuthenticated(credentials());
      storage.failNextWrite = true;
      await expect(
        store.replaceTokensIfCurrent('refresh-1', tokens('access-2', 'refresh-2')),
      ).rejects.toThrow();
      expect(await store.load()).toEqual({ kind: 'authenticated', credentials: credentials() });
    });
  });

  describe('clearIfCurrent', () => {
    it('refresh token이 같으면 지우고 true', async () => {
      await store.saveAuthenticated(credentials());
      expect(await store.clearIfCurrent('refresh-1')).toBe(true);
      expect(await store.load()).toEqual({ kind: 'none' });
    });

    it('TC-NET-021 계정이 바뀌었으면(refresh token 다름) 지우지 않고 false', async () => {
      await store.saveAuthenticated(credentials({ refreshToken: 'refresh-b', userId: 'user-b' }));
      expect(await store.clearIfCurrent('refresh-1')).toBe(false);
      expect((await store.load()).kind).toBe('authenticated');
    });

    it('이미 지워졌으면 false(이벤트 중복 방지)', async () => {
      expect(await store.clearIfCurrent('refresh-1')).toBe(false);
    });
  });

  describe('손상된 저장소', () => {
    it.each([
      ['JSON 아님', 'not json'],
      ['필수 필드 누락', JSON.stringify({ v: 1, userId: 'u', accessToken: 'a' })],
      [
        '날짜 파싱 불가',
        JSON.stringify({
          v: 1,
          userId: 'u',
          accessToken: 'a',
          accessTokenExpiresAt: 'x',
          refreshToken: 'r',
          refreshTokenExpiresAt: 'y',
        }),
      ],
      ['알 수 없는 형태', '[]'],
    ])('%s이면 크래시 없이 none으로 읽는다', async (_n, value) => {
      storage.data.set(SESSION_STORAGE_KEY, value);
      expect(await store.load()).toEqual({ kind: 'none' });
    });
  });

  describe('읽기 예외', () => {
    it('REQ-AUTH-023 보안 저장소 읽기가 예외를 던져도 크래시 없이 none으로 읽고 항목을 지운다', async () => {
      await store.saveAuthenticated(credentials());
      storage.failNextRead = true;
      expect(await store.load()).toEqual({ kind: 'none' });
      expect(storage.data.size).toBe(0);
      expect(await store.load()).toEqual({ kind: 'none' });
    });

    it('REQ-AUTH-023 읽기 예외는 replaceTokensIfCurrent·clearIfCurrent에서도 false로 끝난다', async () => {
      await store.saveAuthenticated(credentials());
      storage.failNextRead = true;
      expect(await store.replaceTokensIfCurrent('refresh-1', tokens('a', 'r'))).toBe(false);
      await store.saveAuthenticated(credentials());
      storage.failNextRead = true;
      expect(await store.clearIfCurrent('refresh-1')).toBe(false);
    });
  });

  describe('값 크기 경고', () => {
    it('2KB를 넘는 세션은 저장은 하되 경고를 남긴다', async () => {
      const warn = jest.fn();
      const big = new SecureSessionStore(storage, warn);
      await big.saveAuthenticated(credentials({ accessToken: 'x'.repeat(3000) }));
      expect(warn).toHaveBeenCalledTimes(1);
      expect((await big.load()).kind).toBe('authenticated');
    });

    it('일반 크기 세션은 경고하지 않는다', async () => {
      const warn = jest.fn();
      await new SecureSessionStore(storage, warn).saveAuthenticated(credentials());
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
