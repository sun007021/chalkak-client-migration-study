import { EMPTY_SESSION } from './SessionStore';
import type { SessionChannel } from './SessionChannel';
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
  /** 계정이 바뀐 쓰기·삭제를 다른 탭에 알린다(SessionChannel 참고). 없으면 알리지 않는다. */
  channel?: SessionChannel;
}

interface Record5 {
  userId: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number | null;
  refreshTokenExpiresAt: number | null;
  guest: boolean;
}

type Parsed = { kind: 'empty' } | { kind: 'corrupt' } | { kind: 'ok'; record: Record5 };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optString = (v: unknown): string | null | 'bad' => (v === undefined || v === null ? null : typeof v === 'string' ? v : 'bad');
const optNumber = (v: unknown): number | null | 'bad' => (v === undefined || v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : 'bad');

/** 저장된 값을 검증한다. 타입이 깨졌거나 토큰 필드가 일부만 있거나 userId와 토큰이 짝이 맞지 않으면 손상. */
function parseRecord(raw: unknown): Parsed {
  if (raw === undefined) return { kind: 'empty' };
  if (!isObject(raw)) return { kind: 'corrupt' };
  const userId = optString(raw.userId);
  const refreshToken = optString(raw.refreshToken);
  const accessTokenExpiresAt = optNumber(raw.accessTokenExpiresAt);
  const refreshTokenExpiresAt = optNumber(raw.refreshTokenExpiresAt);
  const guest = raw.guest === undefined ? false : raw.guest;
  if (userId === 'bad' || refreshToken === 'bad' || accessTokenExpiresAt === 'bad' || refreshTokenExpiresAt === 'bad' || typeof guest !== 'boolean') {
    return { kind: 'corrupt' };
  }
  const tokenFields = [refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt];
  const present = tokenFields.filter((v) => v !== null).length;
  if (present !== 0 && present !== 3) return { kind: 'corrupt' };
  const hasTokens = present === 3 && refreshToken !== '';
  if (present === 3 && !hasTokens) return { kind: 'corrupt' };
  if (hasTokens !== (userId !== null && userId !== '')) return { kind: 'corrupt' };
  if (!hasTokens && !guest) return { kind: 'empty' };
  return { kind: 'ok', record: { userId, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, guest } };
}

function toRecord(session: StoredSession): Record5 {
  return {
    userId: session.userId,
    refreshToken: session.tokens?.refreshToken ?? null,
    accessTokenExpiresAt: session.tokens?.accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt: session.tokens?.refreshTokenExpiresAt ?? null,
    guest: session.isGuest,
  };
}

/**
 * Web SessionStore(Q-03 임시안). access token은 이 인스턴스의 메모리에만 두고, 나머지는 IndexedDB 레코드 하나에 둔다.
 * updateIf/clearIf는 readwrite 트랜잭션 하나 안에서 읽고 비교하고 쓴다(탭 여러 개가 같은 DB를 쓴다).
 * 다시 불러온 탭처럼 메모리에 access token이 없으면 read()는 accessToken '' + accessTokenExpiresAt 0(= 만료)을 돌려준다.
 */
export class IndexedDbSessionStore implements SessionStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  /** 이 탭이 마지막으로 쓴 access token과 그 짝인 refresh token. refresh token이 다르면 쓰지 않는다. */
  private memory: { refreshToken: string; accessToken: string } | null = null;

  constructor(private readonly deps: IndexedDbSessionStoreDeps = {}) {}

  async read(): Promise<StoredSession> {
    const raw = await this.transact<unknown>('readonly', (store, done) => {
      const req = store.get(SESSION_RECORD_KEY);
      req.onsuccess = () => done(req.result);
    });
    const parsed = parseRecord(raw);
    if (parsed.kind === 'corrupt') {
      await this.deleteIfCorrupt().catch(() => undefined);
      this.memory = null;
      return EMPTY_SESSION;
    }
    if (parsed.kind === 'empty') return EMPTY_SESSION;
    return this.toSession(parsed.record);
  }

  async write(session: StoredSession): Promise<void> {
    await this.transact<void>('readwrite', (store, done) => {
      store.put(toRecord(session), SESSION_RECORD_KEY);
      done(undefined);
    });
    this.remember(session);
  }

  async clear(): Promise<void> {
    await this.transact<void>('readwrite', (store, done) => {
      store.delete(SESSION_RECORD_KEY);
      done(undefined);
    });
    this.memory = null;
  }

  async updateIf(expectedRefreshToken: string, next: StoredSession): Promise<boolean> {
    const ok = await this.transact<boolean>('readwrite', (store, done) => {
      const req = store.get(SESSION_RECORD_KEY);
      req.onsuccess = () => {
        const parsed = parseRecord(req.result);
        if (parsed.kind !== 'ok' || parsed.record.refreshToken !== expectedRefreshToken) return done(false);
        store.put(toRecord(next), SESSION_RECORD_KEY);
        done(true);
      };
    });
    if (ok) this.remember(next);
    return ok;
  }

  async clearIf(expectedRefreshToken: string): Promise<boolean> {
    const ok = await this.transact<boolean>('readwrite', (store, done) => {
      const req = store.get(SESSION_RECORD_KEY);
      req.onsuccess = () => {
        const parsed = parseRecord(req.result);
        if (parsed.kind !== 'ok' || parsed.record.refreshToken !== expectedRefreshToken) return done(false);
        store.delete(SESSION_RECORD_KEY);
        done(true);
      };
    });
    if (ok) this.memory = null;
    return ok;
  }

  private remember(session: StoredSession): void {
    this.memory = session.tokens ? { refreshToken: session.tokens.refreshToken, accessToken: session.tokens.accessToken } : null;
  }

  private toSession(record: Record5): StoredSession {
    if (record.refreshToken === null) return { userId: null, tokens: null, isGuest: record.guest };
    const mine = this.memory?.refreshToken === record.refreshToken ? this.memory : null;
    return {
      userId: record.userId,
      tokens: {
        accessToken: mine?.accessToken ?? '',
        accessTokenExpiresAt: mine ? (record.accessTokenExpiresAt ?? 0) : 0,
        refreshToken: record.refreshToken,
        refreshTokenExpiresAt: record.refreshTokenExpiresAt ?? 0,
      },
      isGuest: record.guest,
    };
  }

  private deleteIfCorrupt(): Promise<void> {
    return this.transact<void>('readwrite', (store, done) => {
      const req = store.get(SESSION_RECORD_KEY);
      req.onsuccess = () => {
        if (parseRecord(req.result).kind === 'corrupt') store.delete(SESSION_RECORD_KEY);
        done(undefined);
      };
    });
  }

  private openDb(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const factory = this.deps.indexedDB ?? globalThis.indexedDB;
      if (!factory) {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req = factory.open(this.deps.dbName ?? SESSION_DB_NAME, SESSION_DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(SESSION_STORE_NAME)) req.result.createObjectStore(SESSION_STORE_NAME);
      };
      req.onsuccess = () => {
        const db = req.result;
        const forget = () => {
          this.dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          forget();
        };
        db.onclose = forget; // 브라우저가 연결을 닫았다(저장소 정리 등). 다음 호출에서 다시 연다.
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    });
    this.dbPromise.catch(() => {
      this.dbPromise = null;
    });
    return this.dbPromise;
  }

  /**
   * 트랜잭션 하나를 열어 body를 실행하고 트랜잭션이 끝나면(complete) body가 넘긴 값으로 이행한다.
   * 연결이 닫혀 있어 InvalidStateError가 나면 한 번만 다시 열어 재시도한다.
   */
  private async transact<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
    try {
      return await this.transactOnce(mode, body);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error;
      this.dbPromise = null;
      return this.transactOnce(mode, body);
    }
  }

  private async transactOnce<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
    const db = await this.openDb();
    return new Promise<T>((resolve, reject) => {
      let result: T;
      const tx = db.transaction(SESSION_STORE_NAME, mode);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      body(tx.objectStore(SESSION_STORE_NAME), (value) => {
        result = value;
      });
    });
  }
}
