import type { ApiBaseUrl } from '../config/apiBaseUrl';
import type { AuthTokens } from '../auth/SessionStore';
import type { Clock } from '../time/Clock';
import type { Logger } from './Logger';

export type RefreshResult =
  | { kind: 'success'; tokens: AuthTokens }
  | { kind: 'reauthentication_required' }
  /** 네트워크 오류·타임아웃·5xx·응답 해석 불가·400(클라이언트 버그). 세션은 유지하고 그 요청만 실패시킨다. */
  | { kind: 'transient_failure'; error: unknown };

export interface TokenRefresher {
  /** 던지지 않는다. 자동 재시도하지 않는다(REQ-NET-022). */
  refresh(refreshToken: string): Promise<RefreshResult>;
}

export interface HttpTokenRefresherDeps {
  fetch: typeof fetch;
  clock: Clock;
  baseUrl: ApiBaseUrl;
  logger?: Logger;
}

/** POST /auth/refresh {refreshToken}. Authorization 없음, 재시도 없음. 만료 시각은 clock.nowMs() + expiresIn초. */
export class HttpTokenRefresher implements TokenRefresher {
  constructor(_deps: HttpTokenRefresherDeps) {}
  refresh(_refreshToken: string): Promise<RefreshResult> {
    throw new Error('not implemented');
  }
}
