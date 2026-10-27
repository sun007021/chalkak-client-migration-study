import { CrossTabSessionSync } from './CrossTabSessionSync';
import { SessionEvents } from './SessionEvents';
import type { SignedOutReason } from './SessionEvents';
import { UserCaches } from './UserCaches';
import { SessionChannelHub } from '../../test/FakeSessionChannel';
import { ME, OTHER_USER } from '../../test/fixtures';

function setup() {
  const hub = new SessionChannelHub();
  const other = hub.open(); // 신호를 보내는 "다른 탭"
  const mine = hub.open(); // 이 탭
  const sessionEvents = new SessionEvents();
  const userCaches = new UserCaches();
  const log: string[] = [];
  const reasons: SignedOutReason[] = [];
  sessionEvents.subscribe((reason) => {
    reasons.push(reason);
    log.push(`emit:${reason}`);
  });
  userCaches.register({ clear: () => void log.push('cache-cleared') });
  const sync = new CrossTabSessionSync({ channel: mine, userCaches, sessionEvents });
  return { other, mine, sync, reasons, log, userCaches, sessionEvents };
}

describe('CrossTabSessionSync (다른 탭의 로그아웃·계정 전환 전파)', () => {
  it('REQ-NAV-022 다른 탭이 로그아웃하면(ME → 없음) 캐시를 비우고 logout을 emit한다', () => {
    const { other, sync, reasons, log } = setup();
    sync.start();
    other.post({ previousUserId: ME, userId: null });
    expect(reasons).toEqual(['logout']);
    expect(log).toContain('cache-cleared');
    expect(log).toContain('emit:logout');
  });

  it('TC-NAV-050 REQ-NAV-022 다른 탭에서 계정이 바뀌면(A → B) 캐시를 비우고 expired를 emit해 이 탭도 로그인으로 보낸다', () => {
    const { other, sync, reasons, log } = setup();
    sync.start();
    other.post({ previousUserId: ME, userId: OTHER_USER });
    expect(reasons).toEqual(['expired']);
    expect(log).toContain('cache-cleared');
  });

  it('다른 탭의 새 로그인(이전 계정 없음 → ME)은 무시한다', () => {
    const { other, sync, reasons, log } = setup();
    sync.start();
    other.post({ previousUserId: null, userId: ME });
    expect(reasons).toEqual([]);
    expect(log).toEqual([]);
  });

  it('같은 계정 신호(이전 = 이후)는 무시한다', () => {
    const { other, sync, reasons } = setup();
    sync.start();
    other.post({ previousUserId: ME, userId: ME });
    expect(reasons).toEqual([]);
  });

  it('신호마다 한 번씩만 emit한다(연속 두 신호는 두 번)', () => {
    const { other, sync, reasons } = setup();
    sync.start();
    other.post({ previousUserId: ME, userId: null });
    other.post({ previousUserId: OTHER_USER, userId: null });
    expect(reasons).toEqual(['logout', 'logout']);
  });

  it('start 전과 중지 뒤에는 반응하지 않고 채널 구독도 남지 않는다', () => {
    const { other, mine, sync, reasons } = setup();
    other.post({ previousUserId: ME, userId: null });
    expect(reasons).toEqual([]);
    const stop = sync.start();
    expect(mine.listenerCount).toBe(1);
    stop();
    expect(mine.listenerCount).toBe(0);
    other.post({ previousUserId: ME, userId: null });
    expect(reasons).toEqual([]);
  });

  it('캐시 하나가 실패해도 emit한다(로그인으로 보내는 일을 막지 않는다)', () => {
    const { other, sync, reasons, userCaches } = setup();
    userCaches.register({
      clear: () => {
        throw new Error('cache failure');
      },
    });
    sync.start();
    other.post({ previousUserId: ME, userId: null });
    expect(reasons).toEqual(['logout']);
  });
});
