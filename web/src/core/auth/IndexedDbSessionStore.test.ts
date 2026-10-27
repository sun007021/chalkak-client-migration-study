import { IDBFactory } from 'fake-indexeddb';
import { EMPTY_SESSION } from './SessionStore';
import { IndexedDbSessionStore, SESSION_DB_NAME, SESSION_DB_VERSION, SESSION_RECORD_KEY, SESSION_STORE_NAME } from './IndexedDbSessionStore';
import { ME, OTHER_USER, guestSession, memberSession, tokens } from '../../test/fixtures';
import { loadStorageFixture } from '../../test/sessionFixtures';

/** 같은 DB를 보는 "탭" 여러 개를 흉내 낸다. */
const newTab = (indexedDB: IDBFactory) => new IndexedDbSessionStore({ indexedDB });

function openRaw(indexedDB: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SESSION_DB_NAME, SESSION_DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SESSION_STORE_NAME)) req.result.createObjectStore(SESSION_STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function rawRecords(indexedDB: IDBFactory): Promise<unknown[]> {
  const db = await openRaw(indexedDB);
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const req = db.transaction(SESSION_STORE_NAME, 'readonly').objectStore(SESSION_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function putRaw(indexedDB: IDBFactory, value: unknown): Promise<void> {
  const db = await openRaw(indexedDB);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SESSION_STORE_NAME, 'readwrite');
    tx.objectStore(SESSION_STORE_NAME).put(value, SESSION_RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

let idb: IDBFactory;
beforeEach(() => {
  idb = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
});

describe('IndexedDbSessionStore 왕복', () => {
  it('TC-AUTH-052 비어 있으면 EMPTY_SESSION을 돌려준다', async () => {
    expect(await newTab(idb).read()).toEqual(EMPTY_SESSION);
  });

  it('TC-AUTH-052 userId, access, access 만료, refresh, refresh 만료, 게스트 플래그 6종이 같은 인스턴스에서 그대로 복원된다', async () => {
    const store = newTab(idb);
    await store.write(memberSession());
    expect(await store.read()).toEqual(memberSession());
  });

  it('TC-AUTH-052 게스트 세션도 왕복된다', async () => {
    const store = newTab(idb);
    await store.write(guestSession);
    expect(await store.read()).toEqual(guestSession);
  });

  it('TC-AUTH-060 페이지를 새로 불러오면(새 인스턴스) userId·refresh token·refresh 만료·게스트 플래그는 IndexedDB에서 복원되고 access token은 비어 만료로 읽힌다', async () => {
    await newTab(idb).write({ ...memberSession(), isGuest: true });
    const reloaded = await newTab(idb).read();
    expect(reloaded.userId).toBe(ME);
    expect(reloaded.isGuest).toBe(true);
    expect(reloaded.tokens).toEqual({
      accessToken: '',
      accessTokenExpiresAt: 0,
      refreshToken: memberSession().tokens!.refreshToken,
      refreshTokenExpiresAt: memberSession().tokens!.refreshTokenExpiresAt,
    });
  });

  it('TC-AUTH-060 TC-AUTH-053 access token은 IndexedDB 레코드와 localStorage·sessionStorage 어디에도 없다(평문 저장소에 토큰 없음)', async () => {
    const store = newTab(idb);
    await store.write(memberSession());
    const dump = JSON.stringify(await rawRecords(idb));
    expect(dump).not.toContain('fixture-access-token-1');
    expect(dump).toContain('fixture-refresh-token-1'); // refresh는 IndexedDB 임시안(Q-03)
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('TC-AUTH-052 레코드는 키 하나(session/current)에 userId, refreshToken, 두 만료 시각, guest만 담는다(REQ-AUTH-023)', async () => {
    await newTab(idb).write(memberSession());
    const [record] = await rawRecords(idb);
    expect(Object.keys(record as object).sort()).toEqual(['accessTokenExpiresAt', 'guest', 'refreshToken', 'refreshTokenExpiresAt', 'userId']);
  });

  it('write는 기존 값을 통째로 바꾼다(게스트 전환 시 토큰이 남지 않는다)', async () => {
    const store = newTab(idb);
    await store.write(memberSession());
    await store.write(guestSession);
    expect(await store.read()).toEqual(guestSession);
    expect(JSON.stringify(await rawRecords(idb))).not.toContain('fixture-refresh-token-1');
  });

  it('clear는 게스트 플래그까지 모두 지운다', async () => {
    const store = newTab(idb);
    await store.write({ ...memberSession(), isGuest: true });
    await store.clear();
    expect(await store.read()).toEqual(EMPTY_SESSION);
    expect(await newTab(idb).read()).toEqual(EMPTY_SESSION);
  });
});

describe('IndexedDbSessionStore 비교-후-쓰기(트랜잭션 원자성)', () => {
  it('updateIf: refresh token이 같으면 새 세션으로 바꾸고 true', async () => {
    const store = newTab(idb);
    await store.write(memberSession());
    const next = memberSession({ accessToken: 'fixture-access-token-2', refreshToken: 'fixture-refresh-token-2' });
    expect(await store.updateIf('fixture-refresh-token-1', next)).toBe(true);
    expect(await store.read()).toEqual(next);
  });

  it('updateIf: 다르면 false이고 아무것도 쓰지 않는다', async () => {
    const store = newTab(idb);
    await store.write(memberSession());
    expect(await store.updateIf('stale-refresh-token', memberSession({ refreshToken: 'x' }))).toBe(false);
    expect(await store.read()).toEqual(memberSession());
  });

  it('updateIf: 저장된 세션이 없으면(로그아웃됨) false이고 되살리지 않는다', async () => {
    const store = newTab(idb);
    expect(await store.updateIf('fixture-refresh-token-1', memberSession())).toBe(false);
    expect(await store.read()).toEqual(EMPTY_SESSION);
  });

  it('REQ-AUTH-027 같은 refresh token을 기대한 updateIf 두 건이 (다른 탭 포함) 동시에 와도 정확히 하나만 true이다', async () => {
    const tabA = newTab(idb);
    const tabB = newTab(idb);
    await tabA.write(memberSession());
    const [a, b] = await Promise.all([
      tabA.updateIf('fixture-refresh-token-1', memberSession({ refreshToken: 'from-a' })),
      tabB.updateIf('fixture-refresh-token-1', memberSession({ refreshToken: 'from-b' })),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const winner = a ? 'from-a' : 'from-b';
    expect((await newTab(idb).read()).tokens?.refreshToken).toBe(winner);
  });

  it('clearIf: 같으면 지우고 true, 다르면 false이고 그대로 둔다(그 사이 다른 탭이 갱신함)', async () => {
    const store = newTab(idb);
    await store.write(memberSession());
    expect(await store.clearIf('other')).toBe(false);
    expect(await store.read()).toEqual(memberSession());
    expect(await store.clearIf('fixture-refresh-token-1')).toBe(true);
    expect(await store.read()).toEqual(EMPTY_SESSION);
  });

  it('clearIf가 다른 계정으로 바뀐 세션을 지우지 않는다', async () => {
    const store = newTab(idb);
    await store.write({ userId: OTHER_USER, tokens: tokens({ refreshToken: 'b-refresh' }), isGuest: false });
    expect(await store.clearIf('fixture-refresh-token-1')).toBe(false);
    expect((await store.read()).userId).toBe(OTHER_USER);
  });

  it('다른 탭이 refresh token을 갱신했으면 이 탭의 메모리 access token은 더 이상 유효하지 않아 비어서 읽힌다', async () => {
    const tabA = newTab(idb);
    const tabB = newTab(idb);
    await tabA.write(memberSession());
    await tabB.updateIf('fixture-refresh-token-1', memberSession({ accessToken: 'b-access', refreshToken: 'b-refresh' }));
    const seenByA = await tabA.read();
    expect(seenByA.tokens?.refreshToken).toBe('b-refresh');
    expect(seenByA.tokens?.accessToken).toBe(''); // 옛 access token을 새 refresh와 짝지어 내놓지 않는다
    expect(seenByA.tokens?.accessTokenExpiresAt).toBe(0);
  });
});

describe('IndexedDbSessionStore 손상·불완전 레코드', () => {
  it('TC-BOOT-007 읽을 수 없는 값은 크래시 없이 세션 없음으로 읽고 레코드를 정리한다', async () => {
    const fixture = loadStorageFixture('session__corrupted');
    expect(fixture.expect).toMatchObject({ destination: 'login', storageCleared: true, crash: false });
    await putRaw(idb, '!!undecryptable-ciphertext!!');
    const store = newTab(idb);
    await expect(store.read()).resolves.toEqual(EMPTY_SESSION);
    expect(await rawRecords(idb)).toEqual([]);
  });

  it('TC-BOOT-007 필드 타입이 깨진 객체도 세션 없음으로 읽고 정리한다', async () => {
    await putRaw(idb, { userId: ME, refreshToken: 42, accessTokenExpiresAt: 'x', refreshTokenExpiresAt: null, guest: 'yes' });
    await expect(newTab(idb).read()).resolves.toEqual(EMPTY_SESSION);
    expect(await rawRecords(idb)).toEqual([]);
  });

  it('TC-BOOT-006 userId만 있고 토큰 필드가 없는 불완전 레코드는 세션 없음으로 읽고 정리한다', async () => {
    const fixture = loadStorageFixture('session__partial');
    expect(fixture.expect).toMatchObject({ destination: 'login', storageCleared: true });
    await putRaw(idb, fixture.idbRecord);
    await expect(newTab(idb).read()).resolves.toEqual(EMPTY_SESSION);
    expect(await rawRecords(idb)).toEqual([]);
  });

  it('TC-BOOT-008 인증 세션과 게스트 플래그가 함께 저장된 레코드는 둘 다 그대로 읽힌다(우선순위는 인증 게이트가 정한다)', async () => {
    const fixture = loadStorageFixture('session__authenticated-and-guest');
    await putRaw(idb, fixture.idbRecord);
    const session = await newTab(idb).read();
    expect(session.userId).toBe(ME);
    expect(session.isGuest).toBe(true);
    expect(session.tokens?.refreshToken).toBe('fixture-refresh-token-1');
  });
});
