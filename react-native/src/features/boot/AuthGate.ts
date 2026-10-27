import type { SessionStore } from '../../core/session/SessionStore';
import type { Clock } from '../../core/time/Clock';

export type AuthGateDecision =
  { kind: 'signed-out' } | { kind: 'guest' } | { kind: 'authenticated'; userId: string };

/**
 * 저장된 세션을 읽어 목적지를 판정한다. 인증(refresh 미만료)이 게스트 플래그보다 우선.
 * refresh 만료 시각이 now 이하면 만료로 보고 세션을 지운 뒤 signed-out. access 만료만으로는 로그아웃하지 않는다.
 * 읽기 실패·손상·불완전 세션은 signed-out(저장소 정리). 크래시하지 않는다.
 */
export class AuthGate {
  constructor(
    private readonly sessionStore: SessionStore,
    private readonly clock: Clock,
  ) {}

  resolve(): Promise<AuthGateDecision> {
    void this.sessionStore;
    void this.clock;
    throw new Error('not implemented');
  }
}
