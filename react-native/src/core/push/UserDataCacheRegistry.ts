import type { UserDataCache } from './UserDataCache';

/**
 * 나중에 생기고 사라지는 사용자별 캐시(소유자가 만들고 버리는 ViewModel)를 등록하는 UserDataCache.
 * AuthRepository는 생성 시점에 캐시 목록이 고정되므로, 이 레지스트리 하나만 목록에 넣고 캐시는 여기에 등록한다.
 * 한 캐시가 실패해도 나머지를 비우고, 끝에서 첫 오류를 던진다.
 */
export class UserDataCacheRegistry implements UserDataCache {
  private readonly caches = new Set<UserDataCache>();

  /** 등록하고 해제 함수를 돌려준다(캐시를 버릴 때 반드시 해제). */
  register(cache: UserDataCache): () => void {
    this.caches.add(cache);
    return () => {
      this.caches.delete(cache);
    };
  }

  async clearAll(): Promise<void> {
    const errors: unknown[] = [];
    for (const cache of [...this.caches]) {
      try {
        await cache.clearAll();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) throw errors[0];
  }
}
