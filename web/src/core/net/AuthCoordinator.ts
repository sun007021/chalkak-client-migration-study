import type { SessionStore } from '../auth/SessionStore';
import type { Clock } from '../time/Clock';
import type { TokenRefresher } from './TokenRefresher';

/** 요청을 보내기 직전의 인증 상태. 401 처리 때 "토큰이 그 사이 바뀌었는지" 판정하는 기준이다. */
export interface AuthContext {
  /** 헤더에 붙일 값('Bearer …'). 게스트·만료·access 없음이면 null. */
  authorization: string | null;
  /** 요청 시점에 저장돼 있던 access token(만료로 헤더를 생략했어도 값은 기록). 없으면 null. */
  accessTokenAtRequest: string | null;
  /** 요청 시점에 만료되지 않은 refresh token이 있었는가(= 갱신 대상 자격, REQ-NET-018). */
  canRefresh: boolean;
}

export type AfterUnauthorized =
  /** 원 요청을 1회 재전송해도 된다(새 토큰은 저장 완료). */
  | { kind: 'retry' }
  /** 세션을 지웠고 onSessionExpired를 불렀다. */
  | { kind: 'reauthentication_required' }
  /** refresh가 일시 실패. 세션 유지, 그 요청만 error로 실패. */
  | { kind: 'failed'; error: unknown }
  /** 갱신 대상이 아님(게스트 등). 그대로 오류를 돌려준다. */
  | { kind: 'not_applicable' };

export interface AuthCoordinatorDeps {
  store: SessionStore;
  refresher: TokenRefresher;
  clock: Clock;
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

/** 토큰 헤더 결정과 401 single-flight 갱신(D-17). refresh를 호출하는 곳은 여기뿐이다. */
export class AuthCoordinator {
  private inflight: Promise<AfterUnauthorized> | null = null;

  constructor(private readonly deps: AuthCoordinatorDeps) {}

  /** access가 있고 (clock.nowMs() 기준) 만료 전이면 Authorization을 만든다. */
  async prepare(): Promise<AuthContext> {
    const { tokens } = await this.deps.store.read();
    if (!tokens) return { authorization: null, accessTokenAtRequest: null, canRefresh: false };
    const now = this.deps.clock.nowMs();
    return {
      authorization: now < tokens.accessTokenExpiresAt ? `Bearer ${tokens.accessToken}` : null,
      accessTokenAtRequest: tokens.accessToken,
      canRefresh: now < tokens.refreshTokenExpiresAt,
    };
  }

  /** UNAUTHORIZED(401)을 받았을 때. signal은 이 요청만의 취소이며 진행 중 refresh 자체는 취소하지 않는다. */
  handleUnauthorized(ctx: AuthContext, signal?: AbortSignal): Promise<AfterUnauthorized> {
    if (!ctx.canRefresh) return Promise.resolve({ kind: 'not_applicable' });
    if (!this.inflight) {
      const flight: Promise<AfterUnauthorized> = this.refreshOnce(ctx).finally(() => {
        if (this.inflight === flight) this.inflight = null;
      });
      this.inflight = flight;
    }
    return waitFor(this.inflight, signal);
  }

  /** 401 REAUTHENTICATION_REQUIRED를 일반 API에서 받았을 때. 그 사이 토큰이 바뀌었으면 retry, 아니면 세션 삭제. refresh는 부르지 않는다. */
  async handleReauthenticationRequired(ctx: AuthContext): Promise<AfterUnauthorized> {
    const { tokens } = await this.deps.store.read();
    if (tokens && tokens.accessToken !== ctx.accessTokenAtRequest) return { kind: 'retry' };
    if (tokens) await this.expireSession();
    return { kind: 'reauthentication_required' };
  }

  private async refreshOnce(ctx: AuthContext): Promise<AfterUnauthorized> {
    const { store, refresher } = this.deps;
    const started = await store.read();
    if (!started.tokens) return { kind: 'not_applicable' };
    if (started.tokens.accessToken !== ctx.accessTokenAtRequest) return { kind: 'retry' };

    const result = await refresher.refresh(started.tokens.refreshToken);
    if (result.kind === 'transient_failure') return { kind: 'failed', error: result.error };

    // 갱신 도중 로그아웃·계정 전환이 있었으면 결과를 버린다(D-17).
    const current = await store.read();
    const unchanged = current.userId === started.userId && current.tokens?.refreshToken === started.tokens.refreshToken;
    if (!unchanged) return { kind: 'failed', error: new Error('session changed during token refresh') };

    if (result.kind === 'reauthentication_required') {
      await this.expireSession();
      return { kind: 'reauthentication_required' };
    }
    await store.write({ ...current, tokens: result.tokens });
    return { kind: 'retry' };
  }

  private async expireSession(): Promise<void> {
    await this.deps.store.clear();
    this.deps.onSessionExpired();
  }
}
