import type { Clock } from '../time/Clock';
import type { SessionCredentials, SessionStore } from '../session/SessionStore';
import type { AuthSessionEvents } from './AuthSessionEvents';
import type { NetworkLogger } from './NetworkLogger';

export type RefreshTokenResponse = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
};

/** POST /auth/refresh 한 번. 인증 헤더·자동 재시도 없음. 실패는 HttpError/NetworkError/InvalidResponseError로 던진다. */
export interface RefreshEndpoint {
  refresh(refreshToken: string): Promise<RefreshTokenResponse>;
}

export type RefreshOutcome =
  | { kind: 'refreshed'; credentials: SessionCredentials }
  /** 갱신 도중 로그아웃·계정 전환이 있어 결과를 저장하지 않았다. */
  | { kind: 'session-changed' };

export type TokenRefresherDeps = {
  sessionStore: SessionStore;
  endpoint: RefreshEndpoint;
  clock: Clock;
  events: AuthSessionEvents;
  logger: NetworkLogger;
};

/**
 * 갱신 single-flight. 같은 refresh token으로는 동시에 하나만 보내고 결과를 공유한다.
 * REAUTHENTICATION_REQUIRED면 (세션이 아직 그 refresh token이면) 세션을 지우고 이벤트를 한 번 발행한 뒤
 * ReauthenticationRequiredError를 던진다. 네트워크·5xx·400·응답 누락은 세션을 건드리지 않고 그대로 던진다.
 */
export class TokenRefresher {
  constructor(private readonly deps: TokenRefresherDeps) {}

  refresh(_refreshToken: string): Promise<RefreshOutcome> {
    void this.deps;
    throw new Error('not implemented');
  }
}
