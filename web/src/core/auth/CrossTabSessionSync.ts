import type { SessionEvents } from './SessionEvents';
import type { SessionChannel } from './SessionChannel';
import type { UserCaches } from './UserCaches';

/**
 * 다른 탭의 로그아웃·계정 전환을 이 탭에 전파한다(REQ-NAV-022의 Web 확장).
 * previousUserId가 null이 아니고 userId와 다르면: userCaches.clearAll()을 시작하고 sessionEvents를 emit한다
 * (userId가 null이면 'logout', 다른 계정이면 'expired'). 라우터가 SessionEvents를 받아 /login으로 replace 이동한다.
 * previousUserId가 null인 신호(다른 탭의 새 로그인)는 무시한다. 서버 호출은 하지 않는다.
 */
export class CrossTabSessionSync {
  constructor(_deps: { channel: SessionChannel; userCaches: UserCaches; sessionEvents: SessionEvents }) {}

  /** 구독을 시작하고 중지 함수를 돌려준다. */
  start(): () => void {
    throw new Error('not implemented');
  }
}
