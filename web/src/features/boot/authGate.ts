import type { SessionStore } from '../../core/auth/SessionStore';
import type { Logger } from '../../core/net/Logger';
import type { Clock } from '../../core/time/Clock';

export type SessionMode = 'member' | 'guest';

export type AuthGateDecision = { destination: 'login' } | { destination: 'home'; mode: SessionMode };

/**
 * 인증 게이트(REQ-BOOT-015~020). 저장된 세션을 읽어 판정한다.
 * - userId + 만료 전(now < refreshTokenExpiresAt) refresh token → home/member (게스트 플래그가 있어도 member, access 만료는 무관)
 * - 위가 아니고 게스트 플래그 → home/guest
 * - 아니면 login. refresh 만료·불완전 세션(userId만 있고 토큰 없음)·읽기 실패(손상)는 저장소를 clear()한 뒤 login.
 *   세션 없음(빈 저장소)은 clear하지 않는다.
 */
export function resolveAuthGate(_deps: { store: SessionStore; clock: Clock; logger?: Logger }): Promise<AuthGateDecision> {
  throw new Error('not implemented');
}
