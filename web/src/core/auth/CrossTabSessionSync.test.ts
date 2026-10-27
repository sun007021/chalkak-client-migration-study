import { CrossTabSessionSync } from './CrossTabSessionSync';
import type { PageShowTarget, VisibilityTarget } from './CrossTabSessionSync';
import { EMPTY_SESSION } from './SessionStore';
import type { StoredSession } from './SessionStore';
import { SessionEvents } from './SessionEvents';
import type { SignedOutReason } from './SessionEvents';
import { UserCaches } from './UserCaches';
import { FakeSessionStore } from '../../test/FakeSessionStore';
import { SessionChannelHub } from '../../test/FakeSessionChannel';
import { ME, OTHER_USER, guestSession, memberSession } from '../../test/fixtures';

class FakeDocument implements VisibilityTarget {
  visibilityState = 'visible';
  private readonly listeners = new Set<() => void>();
  addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  set(state: string): void {
    this.visibilityState = state;
    [...this.listeners].forEach((l) => l());
  }
}

class FakeWindow implements PageShowTarget {
  private readonly listeners = new Set<(event: { persisted?: boolean }) => void>();
  addEventListener(_type: 'pageshow', listener: (event: { persisted?: boolean }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'pageshow', listener: (event: { persisted?: boolean }) => void): void {
    this.listeners.delete(listener);
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
  pageshow(persisted: boolean): void {
    [...this.listeners].forEach((l) => l({ persisted }));
  }
}

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

function setup(initial: StoredSession = memberSession()) {
  const hub = new SessionChannelHub();
  const other = hub.open(); // 신호를 보내는 "다른 탭"
  const mine = hub.open(); // 이 탭
  const store = new FakeSessionStore(initial);
  const sessionEvents = new SessionEvents();
  const userCaches = new UserCaches();
  const document = new FakeDocument();
  const window = new FakeWindow();
  const log: string[] = [];
  const reasons: SignedOutReason[] = [];
  sessionEvents.subscribe((reason) => {
    reasons.push(reason);
    log.push(`emit:${reason}`);
  });
  userCaches.register({ clear: () => void log.push('cache-cleared') });
  const sync = new CrossTabSessionSync({ channel: mine, store, userCaches, sessionEvents, document, window });
  return { other, mine, sync, store, reasons, log, userCaches, document, window };
}

describe('CrossTabSessionSync (다른 탭의 계정 변경 전파)', () => {
  it('REQ-NAV-022 다른 탭이 로그아웃하면(회원 → 없음) 캐시를 먼저 비우고 changed를 emit한다', async () => {
    const { other, sync, reasons, log } = setup();
    sync.start();
    other.post({ previousUserId: ME, userId: null });
    await flush();
    expect(reasons).toEqual(['changed']);
    expect(log).toEqual(['cache-cleared', 'emit:changed']);
  });

  it('TC-NAV-050 REQ-NAV-022 다른 탭에서 계정이 바뀌면(A → B) 캐시를 비우고 changed를 emit한다', async () => {
    const { other, sync, reasons, log } = setup();
    sync.start();
    other.post({ previousUserId: ME, userId: OTHER_USER });
    await flush();
    expect(reasons).toEqual(['changed']);
    expect(log).toContain('cache-cleared');
  });

  it('게스트(비로그인) 탭은 다른 탭의 새 로그인(알던 userId 없음 → ME)에도 changed를 emit한다: 부팅 게이트가 다시 판정한다', async () => {
    const { other, sync, reasons } = setup(guestSession);
    sync.start();
    other.post({ previousUserId: null, userId: ME });
    await flush();
    expect(reasons).toEqual(['changed']);
  });

  it('이 탭이 이미 알고 있는 userId와 같은 신호는 무시한다', async () => {
    const { other, sync, reasons, log } = setup();
    sync.start();
    other.post({ previousUserId: OTHER_USER, userId: ME });
    await flush();
    expect(reasons).toEqual([]);
    expect(log).toEqual([]);
  });

  it('게스트 탭은 로그아웃 신호(→ null)를 무시한다(알던 userId가 이미 null)', async () => {
    const { other, sync, reasons } = setup(guestSession);
    sync.start();
    other.post({ previousUserId: ME, userId: null });
    await flush();
    expect(reasons).toEqual([]);
  });

  it('게스트 탭 B: 다른 탭 로그인(changed) 뒤에 다른 탭이 로그아웃하면 다시 changed다(known이 갱신된다)', async () => {
    const { other, sync, reasons } = setup(guestSession);
    sync.start();
    other.post({ previousUserId: null, userId: ME });
    await flush();
    other.post({ previousUserId: ME, userId: null });
    await flush();
    expect(reasons).toEqual(['changed', 'changed']);
  });

  it('이 탭이 직접 로그인했다면(noteLocalUser) 같은 계정의 신호는 무시하고, 다른 탭의 로그아웃에는 반응한다', async () => {
    const { other, sync, reasons } = setup(EMPTY_SESSION);
    sync.start();
    sync.noteLocalUser(ME);
    other.post({ previousUserId: null, userId: ME });
    await flush();
    expect(reasons).toEqual([]);
    other.post({ previousUserId: ME, userId: null });
    await flush();
    expect(reasons).toEqual(['changed']);
  });

  it('신호가 연달아 와도 하나씩 순서대로 처리한다(A → B → 없음)', async () => {
    const { other, sync, reasons } = setup();
    sync.start();
    other.post({ previousUserId: ME, userId: OTHER_USER });
    other.post({ previousUserId: OTHER_USER, userId: null });
    await flush();
    expect(reasons).toEqual(['changed', 'changed']);
  });

  it('start 전과 중지 뒤에는 반응하지 않고 채널·문서·창 구독도 남지 않는다', async () => {
    const { other, mine, sync, reasons, document, window } = setup();
    other.post({ previousUserId: ME, userId: null });
    await flush();
    expect(reasons).toEqual([]);
    const stop = sync.start();
    expect(mine.listenerCount).toBe(1);
    expect(document.listenerCount).toBe(1);
    expect(window.listenerCount).toBe(1);
    stop();
    expect(mine.listenerCount).toBe(0);
    expect(document.listenerCount).toBe(0);
    expect(window.listenerCount).toBe(0);
    other.post({ previousUserId: ME, userId: null });
    await flush();
    expect(reasons).toEqual([]);
  });

  it('캐시 하나가 실패해도 emit한다(이동을 막지 않는다)', async () => {
    const { other, sync, reasons, userCaches } = setup();
    userCaches.register({
      clear: () => {
        throw new Error('cache failure');
      },
    });
    sync.start();
    other.post({ previousUserId: ME, userId: null });
    await flush();
    expect(reasons).toEqual(['changed']);
  });
});

describe('CrossTabSessionSync: 놓친 신호 복구', () => {
  it('REQ-NAV-022 문서가 다시 보일 때 저장소를 읽어 계정이 달라졌으면 changed를 emit한다', async () => {
    const { sync, store, document, reasons } = setup();
    sync.start();
    await flush();
    await store.clear(); // 숨겨진 동안 다른 탭이 로그아웃했지만 신호를 놓쳤다
    document.set('hidden');
    await flush();
    expect(reasons).toEqual([]); // 숨겨지는 것만으로는 읽지 않는다
    document.set('visible');
    await flush();
    expect(reasons).toEqual(['changed']);
  });

  it('REQ-NAV-022 bfcache에서 복원되는 pageshow(persisted)에서도 같은 비교를 한다. persisted가 아니면 하지 않는다', async () => {
    const { sync, store, window, reasons } = setup();
    sync.start();
    await flush();
    await store.write({ userId: OTHER_USER, tokens: memberSession().tokens, isGuest: false });
    window.pageshow(false);
    await flush();
    expect(reasons).toEqual([]);
    window.pageshow(true);
    await flush();
    expect(reasons).toEqual(['changed']);
  });

  it('저장소의 계정이 그대로면 아무 일도 없다', async () => {
    const { sync, document, window, reasons } = setup();
    sync.start();
    await flush();
    document.set('visible');
    window.pageshow(true);
    await flush();
    expect(reasons).toEqual([]);
  });

  it('저장소 읽기가 실패해도 던지지 않고 무시한다', async () => {
    const { sync, store, document, reasons } = setup();
    sync.start();
    await flush();
    store.read = () => Promise.reject(new Error('idb down'));
    document.set('visible');
    await flush();
    expect(reasons).toEqual([]);
  });
});
