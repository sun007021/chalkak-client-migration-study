import type { SessionStore, StoredSession } from '../../core/auth/SessionStore';
import { errorName } from '../../core/net/errors';
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
export async function resolveAuthGate(deps: { store: SessionStore; clock: Clock; logger?: Logger }): Promise<AuthGateDecision> {
  const { store, clock, logger } = deps;
  const clearQuietly = async (): Promise<void> => {
    try {
      await store.clear();
    } catch (error) {
      logger?.log('warn', 'failed to clear session', { error: errorName(error) });
    }
  };

  let session: StoredSession;
  try {
    session = await store.read();
  } catch (error) {
    logger?.log('warn', 'failed to read session', { error: errorName(error) });
    await clearQuietly();
    return { destination: 'login' };
  }

  const { userId, tokens, isGuest } = session;
  if (userId && tokens && clock.nowMs() < tokens.refreshTokenExpiresAt) return { destination: 'home', mode: 'member' };
  if (isGuest) return { destination: 'home', mode: 'guest' };
  if (userId || tokens) await clearQuietly(); // 만료·불완전 세션
  return { destination: 'login' };
}
