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

/** 토큰 헤더 결정과 401 single-flight 갱신(D-17). refresh를 호출하는 곳은 여기뿐이다. */
export class AuthCoordinator {
  constructor(_deps: AuthCoordinatorDeps) {}

  /** access가 있고 (clock.nowMs() 기준) 만료 전이면 Authorization을 만든다. */
  prepare(): Promise<AuthContext> {
    throw new Error('not implemented');
  }

  /** UNAUTHORIZED(401)을 받았을 때. signal은 이 요청만의 취소이며 진행 중 refresh 자체는 취소하지 않는다. */
  handleUnauthorized(_ctx: AuthContext, _signal?: AbortSignal): Promise<AfterUnauthorized> {
    throw new Error('not implemented');
  }

  /** 401 REAUTHENTICATION_REQUIRED를 일반 API에서 받았을 때. 그 사이 토큰이 바뀌었으면 retry, 아니면 세션 삭제. refresh는 부르지 않는다. */
  handleReauthenticationRequired(_ctx: AuthContext): Promise<AfterUnauthorized> {
    throw new Error('not implemented');
  }
}
