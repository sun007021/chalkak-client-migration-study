import { SessionWriter } from './SessionWriter';
import { UserCaches } from './UserCaches';
import { FakeSessionStore } from '../../test/FakeSessionStore';
import { memberSession } from '../../test/fixtures';

describe('SessionWriter', () => {
  it('TC-AUTH-058 새 세션을 쓰기 전에 사용자 캐시를 모두 비운다', async () => {
    const store = new FakeSessionStore();
    const caches = new UserCaches();
    const order: string[] = [];
    caches.register({ clear: () => void order.push(`cleared(writes=${store.writes.length})`) });
    await new SessionWriter({ store, userCaches: caches }).replace(memberSession());
    expect(order).toEqual(['cleared(writes=0)']);
    expect(await store.read()).toEqual(memberSession());
  });

  it('저장이 실패하면 던진다', async () => {
    const store = new FakeSessionStore();
    vi.spyOn(store, 'write').mockRejectedValue(new Error('idb'));
    await expect(new SessionWriter({ store, userCaches: new UserCaches() }).replace(memberSession())).rejects.toThrow('idb');
  });
});
