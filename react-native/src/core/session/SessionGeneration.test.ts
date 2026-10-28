import { FakeSecureKeyValueStorage } from './__testing__/FakeSecureKeyValueStorage';
import { SecureSessionStore } from './SecureSessionStore';
import type { SessionCredentials } from './SessionStore';

const creds = (userId: string, refreshToken = 'r1'): SessionCredentials => ({
  userId,
  accessToken: 'a',
  accessTokenExpiresAt: new Date(2030, 0, 1),
  refreshToken,
  refreshTokenExpiresAt: new Date(2030, 0, 2),
});

describe('SecureSessionStore.generation', () => {
  it('userId가 바뀌는 저장·삭제에서만 올라가고, 같은 userId의 토큰 교체와 재저장에서는 그대로다', async () => {
    const store = new SecureSessionStore(new FakeSecureKeyValueStorage());
    await store.load();
    const g0 = store.generation();

    await store.saveAuthenticated(creds('u1'));
    const g1 = store.generation();
    expect(g1).toBeGreaterThan(g0);

    await store.replaceTokensIfCurrent('r1', {
      accessToken: 'a2',
      accessTokenExpiresAt: new Date(2031, 0, 1),
      refreshToken: 'r2',
      refreshTokenExpiresAt: new Date(2031, 0, 2),
    });
    await store.saveAuthenticated(creds('u1', 'r3'));
    expect(store.generation()).toBe(g1);

    await store.saveAuthenticated(creds('u2'));
    const g2 = store.generation();
    expect(g2).toBeGreaterThan(g1);

    await store.clear();
    expect(store.generation()).toBeGreaterThan(g2);
  });

  it('load는 저장소를 읽을 뿐 이미 알고 있는 계정이면 세대를 올리지 않는다', async () => {
    const store = new SecureSessionStore(new FakeSecureKeyValueStorage());
    await store.saveAuthenticated(creds('u1'));
    const g = store.generation();
    await store.load();
    await store.load();
    expect(store.generation()).toBe(g);
  });

  it('게스트 전환과 조건부 삭제도 계정이 바뀐 것으로 센다', async () => {
    const store = new SecureSessionStore(new FakeSecureKeyValueStorage());
    await store.saveAuthenticated(creds('u1'));
    const g = store.generation();
    expect(await store.clearIfCurrent('nope')).toBe(false);
    expect(store.generation()).toBe(g);
    expect(await store.clearIfCurrent('r1')).toBe(true);
    expect(store.generation()).toBeGreaterThan(g);
  });
});
