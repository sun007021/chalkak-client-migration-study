import type { SessionEvents } from '../../core/auth/SessionEvents';
import type { SessionStore } from '../../core/auth/SessionStore';
import type { UserCaches } from '../../core/auth/UserCaches';
import type { Logger } from '../../core/net/Logger';
import type { ToastController } from '../../core/ui/ToastController';
import type { AuthApi } from './AuthApi';

export type WithdrawOutcome =
  | { kind: 'done' }
  /** 실패(세션 유지, 토스트 표시) 또는 취소(토스트 없음). */
  | { kind: 'failed' }
  | { kind: 'cancelled' };

export interface AccountServiceDeps {
  authApi: AuthApi;
  store: SessionStore;
  userCaches: UserCaches;
  toast: ToastController;
  sessionEvents: SessionEvents;
  logger?: Logger;
}

/** 설정 화면(다음 PR)이 쓸 로그아웃·탈퇴(D-16). 진행 중 중복 호출은 같은 작업을 돌려준다(REQ-AUTH-040). */
export class AccountService {
  constructor(_deps: AccountServiceDeps) {}
  /** 로컬 세션·캐시를 먼저 지우고 POST /auth/logout을 보낸다. 실패는 무시. 끝나면 sessionEvents.emit('logout'). refresh token이 없으면 서버 호출 없이 로컬만. */
  logout(): Promise<void> {
    throw new Error('not implemented');
  }
  /** DELETE /users/me가 204일 때만 로컬 세션·캐시를 지우고 emit('withdrawn'). 실패는 세션 유지 + 토스트 auth.withdraw.error. 취소는 토스트 없음. */
  withdraw(_signal?: AbortSignal): Promise<WithdrawOutcome> {
    throw new Error('not implemented');
  }
}
