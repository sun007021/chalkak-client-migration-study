import { UserCaches } from './UserCaches';

describe('UserCaches', () => {
  it('TC-AUTH-041 등록된 모든 사용자 캐시(홈, 기록, 알림, 좋아요, 미읽음, 사인, 푸시 설정 자리)를 한 번에 비운다', async () => {
    const caches = new UserCaches();
    const cleared: string[] = [];
    for (const name of ['home', 'record', 'notifications', 'likes', 'unread', 'signature', 'push-settings']) {
      caches.register({ clear: () => void cleared.push(name) });
    }
    await caches.clearAll();
    expect(cleared).toEqual(['home', 'record', 'notifications', 'likes', 'unread', 'signature', 'push-settings']);
  });

  it('비동기 clear도 모두 끝날 때까지 기다린다', async () => {
    const caches = new UserCaches();
    let done = false;
    caches.register({ clear: () => Promise.resolve().then(() => void (done = true)) });
    await caches.clearAll();
    expect(done).toBe(true);
  });

  it('하나가 실패해도 나머지는 비우고 호출자에게 던지지 않는다', async () => {
    const caches = new UserCaches();
    const cleared: string[] = [];
    caches.register({
      clear: () => {
        throw new Error('boom');
      },
    });
    caches.register({ clear: () => void cleared.push('after') });
    await expect(caches.clearAll()).resolves.toBeUndefined();
    expect(cleared).toEqual(['after']);
  });

  it('등록 해제한 캐시는 비우지 않는다', async () => {
    const caches = new UserCaches();
    const cleared: string[] = [];
    const off = caches.register({ clear: () => void cleared.push('a') });
    off();
    await caches.clearAll();
    expect(cleared).toEqual([]);
  });
});
