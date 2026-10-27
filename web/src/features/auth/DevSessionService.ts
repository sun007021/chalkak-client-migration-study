import type { SessionStore } from '../../core/auth/SessionStore';
import type { UserCaches } from '../../core/auth/UserCaches';
import type { TokenRefresher } from '../../core/net/TokenRefresher';

export type DevSessionResult =
  | { kind: 'ok' }
  /** refreshToken 또는 userId가 비어 있다. 요청을 보내지 않는다. */
  | { kind: 'invalid_input' }
  /** refresh가 REAUTHENTICATION_REQUIRED로 거절됨. */
  | { kind: 'rejected' }
  /** 네트워크 오류·5xx 등. */
  | { kind: 'failed' };

/** 개발 빌드 전용: 붙여 넣은 refresh token으로 POST /auth/refresh를 불러 받은 토큰을 세션으로 저장한다(Q-02 우회). */
export class DevSessionService {
  constructor(_deps: { refresher: TokenRefresher; store: SessionStore; userCaches: UserCaches }) {}
  inject(_input: { refreshToken: string; userId: string }): Promise<DevSessionResult> {
    throw new Error('not implemented');
  }
}
