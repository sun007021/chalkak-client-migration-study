import type { Clock } from '../time/Clock';
import type { SessionCredentials, SessionStore } from '../session/SessionStore';
import { refreshedTokensFromResponse } from '../session/SessionCredentials';
import { AuthenticationRequiredError, HttpError, ReauthenticationRequiredError } from './ApiError';
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

export type ExpireOutcome = 'expired' | 'session-changed';

/**
 * 갱신 single-flight. 같은 refresh token으로는 동시에 하나만 보내고 결과를 공유한다.
 * REAUTHENTICATION_REQUIRED면 (세션이 아직 그 refresh token이면) 세션을 지우고 이벤트를 한 번 발행한 뒤
 * ReauthenticationRequiredError를 던진다. 네트워크·5xx·400·응답 누락은 세션을 건드리지 않고 그대로 던진다.
 *
 * 경합 방어: flight에 들어와 실제로 보내기 직전에 저장소를 다시 읽는다. 호출자가 옛 세션을 읽은 사이
 * 다른 flight가 이미 토큰을 회전시켰다면 옛 refresh token을 다시 보내지 않고(서버가 재사용으로 보고
 * 세션 전체를 폐기한다) 네트워크 없이 저장된 새 세션을 돌려준다.
 */
export class TokenRefresher {
  private readonly inflight = new Map<string, Promise<RefreshOutcome>>();
  private readonly expiring = new Map<string, Promise<ExpireOutcome>>();

  constructor(private readonly deps: TokenRefresherDeps) {}

  /** `userId`는 호출자가 요청을 보낼 때의 계정. 다른 계정으로 바뀌었으면 session-changed. */
  refresh(refreshToken: string, userId: string): Promise<RefreshOutcome> {
    const existing = this.inflight.get(refreshToken);
    if (existing) return existing;
    const flight: Promise<RefreshOutcome> = this.run(refreshToken, userId).finally(() => {
      if (this.inflight.get(refreshToken) === flight) this.inflight.delete(refreshToken);
    });
    this.inflight.set(refreshToken, flight);
    return flight;
  }

  /**
   * 세션이 아직 그 refresh token이면 지우고 로그인 이벤트를 낸다. 같은 token의 동시 호출은 한 작업을 공유해
   * 모두 같은 결과('expired')를 받고 이벤트는 한 번만 나간다. 이미 바뀌었으면 'session-changed'.
   */
  expire(refreshToken: string): Promise<ExpireOutcome> {
    const existing = this.expiring.get(refreshToken);
    if (existing) return existing;
    const flight: Promise<ExpireOutcome> = this.doExpire(refreshToken).finally(() => {
      if (this.expiring.get(refreshToken) === flight) this.expiring.delete(refreshToken);
    });
    this.expiring.set(refreshToken, flight);
    return flight;
  }

  /** 보안 저장소 읽기 실패로 세션을 버렸을 때: 로그인 이벤트를 낸다. 인증 상태였던 요청이 한 번씩 호출한다. */
  notifySessionLost(): void {
    this.deps.logger.log({ level: 'error', event: 'auth.session-lost' });
    this.deps.events.emit({ type: 'session-expired' });
  }

  private async doExpire(refreshToken: string): Promise<ExpireOutcome> {
    const cleared = await this.deps.sessionStore.clearIfCurrent(refreshToken);
    if (!cleared) return 'session-changed';
    this.deps.logger.log({ level: 'warn', event: 'auth.session-expired' });
    this.deps.events.emit({ type: 'session-expired' });
    return 'expired';
  }

  private async run(refreshToken: string, userId: string): Promise<RefreshOutcome> {
    const { sessionStore, endpoint, clock, logger } = this.deps;

    const before = await sessionStore.load();
    if (before.kind !== 'authenticated' || before.credentials.userId !== userId) {
      return { kind: 'session-changed' };
    }
    if (before.credentials.refreshToken !== refreshToken) {
      logger.log({ level: 'debug', event: 'auth.refresh.already-rotated' });
      return { kind: 'refreshed', credentials: before.credentials };
    }

    let response: RefreshTokenResponse;
    try {
      response = await endpoint.refresh(refreshToken);
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.status === 401 &&
        error.errorCode === 'REAUTHENTICATION_REQUIRED'
      ) {
        if ((await this.expire(refreshToken)) === 'session-changed') {
          return { kind: 'session-changed' };
        }
        throw new ReauthenticationRequiredError('reauthentication required');
      }
      const unauthorized = error instanceof HttpError && error.status === 401;
      logger.log({
        level: 'error',
        event: 'auth.refresh.failed',
        status: error instanceof HttpError ? error.status : undefined,
        errorCode: error instanceof HttpError ? (error.errorCode ?? undefined) : undefined,
        detail: error instanceof Error ? error.name : undefined,
      });
      // refresh 응답이 REAUTH 아닌 401이면 세션은 유지하고 "인증 필요"로 통일한다(REQ-NET-023과 같은 처리).
      if (unauthorized) throw new AuthenticationRequiredError('refresh unauthorized');
      throw error;
    }

    const replaced = await sessionStore.replaceTokensIfCurrent(
      refreshToken,
      refreshedTokensFromResponse(response, clock.now()),
    );
    if (!replaced) return { kind: 'session-changed' };
    const after = await sessionStore.load();
    if (after.kind !== 'authenticated' || after.credentials.userId !== userId) {
      return { kind: 'session-changed' };
    }
    return { kind: 'refreshed', credentials: after.credentials };
  }
}
