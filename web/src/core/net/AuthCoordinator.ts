import type { RefreshLock } from '../auth/RefreshLock';
import { EMPTY_SESSION } from '../auth/SessionStore';
import type { AuthTokens, SessionStore, StoredSession } from '../auth/SessionStore';
import type { Clock } from '../time/Clock';
import { SessionChangedError } from './errors';
import type { TokenRefresher } from './TokenRefresher';

/** 요청을 보내기 직전의 인증 상태. 401 처리 때 "세션이 그 사이 바뀌었는지" 판정하는 기준이다. */
export interface AuthContext {
  /** 헤더에 붙일 값('Bearer …'). 게스트·만료·access 없음이면 null. */
  authorization: string | null;
  /** 요청 시점의 userId. 계정 전환 감지에 쓴다. */
  userId: string | null;
  /** 요청 시점에 저장돼 있던 access token(만료로 헤더를 생략했어도 값은 기록). 없으면 null. */
  accessTokenAtRequest: string | null;
  /** 요청 시점에 저장돼 있던 refresh token. 다른 탭·요청이 이미 갱신했는지 판정한다. 없으면 null. */
  refreshTokenAtRequest: string | null;
  /** 요청 시점에 만료되지 않은 refresh token이 있었는가(= 갱신 대상 자격, REQ-NET-018). */
  canRefresh: boolean;
}

export type AfterUnauthorized =
  /** 원 요청을 1회 재전송해도 된다(새 토큰은 저장 완료). */
  | { kind: 'retry' }
  /** 세션을 지웠고 onSessionExpired를 불렀다(이미 지워져 있었으면 부르지 않는다). */
  | { kind: 'reauthentication_required' }
  /** refresh가 일시 실패했거나(세션 유지) 세션이 바뀌었다(SessionChangedError). 그 요청만 error로 실패. */
  | { kind: 'failed'; error: unknown }
  /** 갱신 대상이 아님(게스트, 이미 로그아웃 등). 그대로 오류를 돌려준다. */
  | { kind: 'not_applicable' };

export interface AuthCoordinatorDeps {
  store: SessionStore;
  refresher: TokenRefresher;
  clock: Clock;
  /** 여러 탭이 같은 refresh token을 두 번 보내지 않도록 refresh 구간을 직렬화한다. */
  lock: RefreshLock;
  /** 세션을 지운 직후 1회 호출(로그인 화면 이동 이벤트). */
  onSessionExpired: () => void;
}

const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

/** 이 요청만의 signal로 공유 promise 기다림을 끝낸다(공유 promise 자체는 계속 진행). */
function waitFor<T>(shared: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return shared;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

const tokensChangedSince = (ctx: AuthContext, tokens: AuthTokens): boolean =>
  tokens.accessToken !== ctx.accessTokenAtRequest || tokens.refreshToken !== ctx.refreshTokenAtRequest;

/**
 * 토큰 헤더 결정과 401 갱신(D-17). refresh를 호출하는 곳은 여기뿐이다.
 * refresh는 락 안에서 "저장소 재읽기 → (토큰이 바뀌었으면 네트워크 없이 retry) → refresh → 비교 후 쓰기"로 처리한다.
 */
export class AuthCoordinator {
  /** 같은 세션 상태에서 시작한 401들은 하나의 flight를 공유한다. 키는 userId + 요청 시점 refresh token. */
  private readonly flights = new Map<string, Promise<AfterUnauthorized>>();

  constructor(private readonly deps: AuthCoordinatorDeps) {}

  /** access가 있고 (clock.nowMs() 기준) 만료 전이면 Authorization을 만든다. */
  async prepare(): Promise<AuthContext> {
    const { userId, tokens } = await this.readSession();
    if (!tokens) return { authorization: null, userId, accessTokenAtRequest: null, refreshTokenAtRequest: null, canRefresh: false };
    const now = this.deps.clock.nowMs();
    return {
      authorization: now < tokens.accessTokenExpiresAt ? `Bearer ${tokens.accessToken}` : null,
      userId,
      accessTokenAtRequest: tokens.accessToken,
      refreshTokenAtRequest: tokens.refreshToken,
      canRefresh: now < tokens.refreshTokenExpiresAt,
    };
  }

  /** UNAUTHORIZED(401)을 받았을 때. signal은 이 요청만의 취소이며 진행 중 refresh 자체는 취소하지 않는다. */
  handleUnauthorized(ctx: AuthContext, signal?: AbortSignal): Promise<AfterUnauthorized> {
    if (!ctx.canRefresh) return Promise.resolve({ kind: 'not_applicable' });
    const key = `${ctx.userId ?? ''}|${ctx.refreshTokenAtRequest ?? ''}`;
    let flight = this.flights.get(key);
    if (!flight) {
      const started: Promise<AfterUnauthorized> = this.deps.lock.withLock(() => this.refreshOnce(ctx)).finally(() => {
        if (this.flights.get(key) === started) this.flights.delete(key);
      });
      this.flights.set(key, started);
      flight = started;
    }
    return waitFor(flight, signal);
  }

  /** 401 REAUTHENTICATION_REQUIRED를 일반 API에서 받았을 때. 그 사이 토큰이 바뀌었으면 retry, 아니면 세션 삭제. refresh는 부르지 않는다. */
  handleReauthenticationRequired(ctx: AuthContext): Promise<AfterUnauthorized> {
    return this.deps.lock.withLock(async () => {
      const session = await this.readSession();
      if (!session.tokens) return { kind: 'reauthentication_required' }; // 이미 지워졌다(동시에 온 다른 401이 처리함)
      if (session.userId !== ctx.userId) return { kind: 'failed', error: new SessionChangedError('account switched') };
      if (tokensChangedSince(ctx, session.tokens)) return { kind: 'retry' };
      return this.expireIfCurrent(session.tokens.refreshToken);
    });
  }

  private async refreshOnce(ctx: AuthContext): Promise<AfterUnauthorized> {
    const { refresher, store } = this.deps;
    // 락을 잡은 직후, refresh를 보내기 직전에 다시 읽는다: 그 사이 다른 요청·탭이 갱신했다면 같은 refresh token을 또 보내지 않는다.
    const session = await this.readSession();
    const { tokens } = session;
    if (!tokens) return { kind: 'not_applicable' };
    if (session.userId !== ctx.userId) return { kind: 'failed', error: new SessionChangedError('account switched') };
    if (tokensChangedSince(ctx, tokens)) return { kind: 'retry' };

    const result = await refresher.refresh(tokens.refreshToken);
    if (result.kind === 'transient_failure') return { kind: 'failed', error: result.error };
    // 갱신 도중 로그아웃·계정 전환·다른 탭의 갱신이 있었으면 결과를 버린다(D-17). 비교와 쓰기는 저장소가 원자적으로 한다.
    if (result.kind === 'reauthentication_required') return this.expireIfCurrent(tokens.refreshToken);
    const saved = await store.updateIf(tokens.refreshToken, { ...session, tokens: result.tokens });
    return saved ? { kind: 'retry' } : { kind: 'failed', error: new SessionChangedError('session changed during token refresh') };
  }

  private async expireIfCurrent(refreshToken: string): Promise<AfterUnauthorized> {
    const cleared = await this.deps.store.clearIf(refreshToken);
    if (!cleared) return { kind: 'failed', error: new SessionChangedError('session changed before expiry') };
    this.deps.onSessionExpired();
    return { kind: 'reauthentication_required' };
  }

  /** 저장소 읽기 실패는 세션 없음으로 본다. */
  private async readSession(): Promise<StoredSession> {
    try {
      return await this.deps.store.read();
    } catch {
      return EMPTY_SESSION;
    }
  }
}
