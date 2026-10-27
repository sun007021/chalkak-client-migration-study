import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbSessionStore } from './IndexedDbSessionStore';
import { FakeSessionChannel } from '../../test/FakeSessionChannel';
import { ME, OTHER_USER, guestSession, memberSession, tokens } from '../../test/fixtures';
import type { StoredSession } from './SessionStore';

function setup() {
  const channel = new FakeSessionChannel();
  const store = new IndexedDbSessionStore({ indexedDB: new IDBFactory(), channel });
  return { channel, store };
}

const other: StoredSession = { userId: OTHER_USER, tokens: tokens({ refreshToken: 'other-refresh-token' }), isGuest: false };

describe('IndexedDbSessionStore → 다른 탭 신호 (BroadcastChannel chalkak-session)', () => {
  it('REQ-NAV-022 빈 저장소에 로그인 세션을 쓰면 { previousUserId: null, userId }를 알린다', async () => {
    const { store, channel } = setup();
    await store.write(memberSession());
    expect(channel.posted).toEqual([{ previousUserId: null, userId: ME }]);
  });

  it('REQ-NAV-022 다른 계정으로 덮어쓰면 { previousUserId: A, userId: B }를 알린다', async () => {
    const { store, channel } = setup();
    await store.write(memberSession());
    await store.write(other);
    expect(channel.posted).toEqual([
      { previousUserId: null, userId: ME },
      { previousUserId: ME, userId: OTHER_USER },
    ]);
  });

  it('REQ-NAV-022 clear()는 { previousUserId: ME, userId: null }을 알린다', async () => {
    const { store, channel } = setup();
    await store.write(memberSession());
    channel.posted.length = 0;
    await store.clear();
    expect(channel.posted).toEqual([{ previousUserId: ME, userId: null }]);
  });

  it('REQ-NAV-022 clearIf가 지웠을 때만 알리고, refresh token이 달라 지우지 못했으면 알리지 않는다', async () => {
    const { store, channel } = setup();
    await store.write(memberSession());
    channel.posted.length = 0;
    expect(await store.clearIf('not-the-refresh-token')).toBe(false);
    expect(channel.posted).toEqual([]);
    expect(await store.clearIf('fixture-refresh-token-1')).toBe(true);
    expect(channel.posted).toEqual([{ previousUserId: ME, userId: null }]);
  });

  it('같은 계정의 토큰 갱신(updateIf)은 알리지 않는다', async () => {
    const { store, channel } = setup();
    await store.write(memberSession());
    channel.posted.length = 0;
    expect(await store.updateIf('fixture-refresh-token-1', memberSession({ refreshToken: 'rotated', accessToken: 'new-access' }))).toBe(true);
    expect(channel.posted).toEqual([]);
  });

  it('계정이 안 바뀐 쓰기·삭제(빈 저장소 clear, 빈 저장소에 게스트 쓰기)는 알리지 않는다', async () => {
    const { store, channel } = setup();
    await store.clear();
    await store.write(guestSession);
    expect(channel.posted).toEqual([]);
  });

  it('read()는 알리지 않는다', async () => {
    const { store, channel } = setup();
    await store.write(memberSession());
    channel.posted.length = 0;
    await store.read();
    expect(channel.posted).toEqual([]);
  });

  it('신호에는 토큰이 없다(userId만)', async () => {
    const { store, channel } = setup();
    await store.write(memberSession());
    await store.clear();
    const serialized = JSON.stringify(channel.posted);
    expect(serialized).not.toContain('fixture-refresh-token-1');
    expect(serialized).not.toContain('fixture-access-token-1');
  });

  it('채널이 던져도 쓰기·삭제는 성공한다', async () => {
    const { store, channel } = setup();
    vi.spyOn(channel, 'post').mockImplementation(() => {
      throw new Error('channel closed');
    });
    await expect(store.write(memberSession())).resolves.toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
    expect((await store.read()).userId).toBeNull();
  });

  it('채널을 주지 않아도(기본) 이전과 똑같이 동작한다', async () => {
    const store = new IndexedDbSessionStore({ indexedDB: new IDBFactory() });
    await store.write(memberSession());
    expect((await store.read()).userId).toBe(ME);
    await store.clear();
    expect((await store.read()).userId).toBeNull();
  });
});
