import type { SessionStore, StoredSession } from './SessionStore';

/** 세션 DB 배치(Q-03 임시안). 테스트가 손상·부분 레코드를 직접 심을 때도 이 상수를 쓴다. */
export const SESSION_DB_NAME = 'chalkak-session';
export const SESSION_DB_VERSION = 1;
export const SESSION_STORE_NAME = 'session';
/** 레코드는 이 키 하나. 값: { userId, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, guest }. access token은 레코드에 없다. */
export const SESSION_RECORD_KEY = 'current';

export interface IndexedDbSessionStoreDeps {
  /** 기본 globalThis.indexedDB. 테스트는 fake-indexeddb의 IDBFactory를 넣는다. */
  indexedDB?: IDBFactory;
  dbName?: string;
}

/**
 * Web SessionStore(Q-03 임시안). access token은 이 인스턴스의 메모리에만 두고, 나머지는 IndexedDB 레코드 하나에 둔다.
 * updateIf/clearIf는 readwrite 트랜잭션 하나 안에서 읽고 비교하고 쓴다(탭 여러 개가 같은 DB를 쓴다).
 * 다시 불러온 탭처럼 메모리에 access token이 없으면 read()는 accessToken '' + accessTokenExpiresAt 0(= 만료)을 돌려준다.
 */
export class IndexedDbSessionStore implements SessionStore {
  constructor(_deps: IndexedDbSessionStoreDeps = {}) {}
  async read(): Promise<StoredSession> {
    throw new Error('not implemented');
  }
  async write(_session: StoredSession): Promise<void> {
    throw new Error('not implemented');
  }
  async clear(): Promise<void> {
    throw new Error('not implemented');
  }
  async updateIf(_expectedRefreshToken: string, _next: StoredSession): Promise<boolean> {
    throw new Error('not implemented');
  }
  async clearIf(_expectedRefreshToken: string): Promise<boolean> {
    throw new Error('not implemented');
  }
}
