import type { SessionStore, StoredSession } from './SessionStore';
import type { UserCaches } from './UserCaches';

/** 세션을 바꾸는 유일한 경로: 이전 사용자의 캐시를 먼저 비우고(TC-AUTH-058) 새 세션을 쓴다. 저장 실패는 던진다. */
export class SessionWriter {
  constructor(private readonly deps: { store: SessionStore; userCaches: UserCaches }) {}

  async replace(session: StoredSession): Promise<void> {
    await this.deps.userCaches.clearAll();
    await this.deps.store.write(session);
  }
}
