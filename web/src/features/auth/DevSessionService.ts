import { SessionWriter } from '../../core/auth/SessionWriter';
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

/** 개발 전용(DEV_SESSION_ENABLED가 true인 빌드에서만 번들에 들어간다): 붙여 넣은 refresh token으로 POST /auth/refresh를 불러 받은 토큰을 세션으로 저장한다(Q-02 우회). */
export class DevSessionService {
  private readonly refresher: TokenRefresher;
  private readonly writer: SessionWriter;

  constructor(deps: { refresher: TokenRefresher; store: SessionStore; userCaches: UserCaches }) {
    this.refresher = deps.refresher;
    this.writer = new SessionWriter(deps);
  }


  async inject(input: { refreshToken: string; userId: string }): Promise<DevSessionResult> {
    const refreshToken = input.refreshToken.trim();
    const userId = input.userId.trim();
    if (refreshToken === '' || userId === '') return { kind: 'invalid_input' };
    const result = await this.refresher.refresh(refreshToken);
    if (result.kind === 'reauthentication_required') return { kind: 'rejected' };
    if (result.kind === 'transient_failure') return { kind: 'failed' };
    try {
      await this.writer.replace({ userId, tokens: result.tokens, isGuest: false });
    } catch {
      return { kind: 'failed' };
    }
    return { kind: 'ok' };
  }
}
