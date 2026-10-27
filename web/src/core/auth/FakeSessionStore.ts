import { EMPTY_SESSION, type SessionStore, type StoredSession } from './SessionStore';

/** 테스트용 in-memory SessionStore. 쓰기/삭제 기록을 남긴다. */
export class FakeSessionStore implements SessionStore {
  private current: StoredSession;
  readonly writes: StoredSession[] = [];
  clearCount = 0;

  constructor(initial: StoredSession = EMPTY_SESSION) {
    this.current = structuredClone(initial);
  }

  async read(): Promise<StoredSession> {
    return structuredClone(this.current);
  }

  async write(session: StoredSession): Promise<void> {
    this.current = structuredClone(session);
    this.writes.push(structuredClone(session));
  }

  async clear(): Promise<void> {
    this.current = structuredClone(EMPTY_SESSION);
    this.clearCount += 1;
  }
}
