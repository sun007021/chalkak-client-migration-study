export interface UserCache {
  /** 사용자별 캐시(홈, 기록, 알림, 좋아요, 미읽음, 사인, 푸시 설정 등)를 비운다. */
  clear(): void | Promise<void>;
}

/** 기능별 사용자 캐시를 한 곳에 모아 로그아웃·탈퇴·계정 전환 때 한꺼번에 비운다(TC-AUTH-041, TC-AUTH-058). */
export class UserCaches {
  private readonly caches = new Set<UserCache>();

  register(cache: UserCache): () => void {
    this.caches.add(cache);
    return () => {
      this.caches.delete(cache);
    };
  }

  /** 등록된 모든 캐시를 비운다. 하나가 실패해도 나머지는 비우고, 호출자에게는 던지지 않는다. */
  async clearAll(): Promise<void> {
    const runs = [...this.caches].map(async (cache) => {
      try {
        await cache.clear();
      } catch {
        // 실패한 캐시가 있어도 나머지를 비운다.
      }
    });
    await Promise.all(runs);
  }
}
