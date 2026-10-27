import type { SessionEvents } from '../../core/auth/SessionEvents';
import type { SessionStore } from '../../core/auth/SessionStore';
import type { UserCaches } from '../../core/auth/UserCaches';
import { ApiError, isCancellation } from '../../core/net/errors';
import type { Logger } from '../../core/net/Logger';
import type { ToastController } from '../../core/ui/ToastController';
import { t } from '../../copy/ko';
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

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

/** 설정 화면(다음 PR)이 쓸 로그아웃·탈퇴(D-16). 진행 중 중복 호출은 같은 작업을 돌려준다(REQ-AUTH-040). */
export class AccountService {
  private logoutFlight: Promise<void> | null = null;
  private withdrawFlight: Promise<WithdrawOutcome> | null = null;

  constructor(private readonly deps: AccountServiceDeps) {}

  /** 로컬 세션·캐시를 먼저 지우고 POST /auth/logout을 보낸다. 실패는 무시. 끝나면 sessionEvents.emit('logout'). refresh token이 없으면 서버 호출 없이 로컬만. */
  logout(): Promise<void> {
    this.logoutFlight ??= this.doLogout().finally(() => {
      this.logoutFlight = null;
    });
    return this.logoutFlight;
  }

  /** DELETE /users/me가 204일 때만 로컬 세션·캐시를 지우고 emit('withdrawn'). 실패는 세션 유지 + 토스트 auth.withdraw.error. 취소는 토스트 없음. */
  withdraw(signal?: AbortSignal): Promise<WithdrawOutcome> {
    this.withdrawFlight ??= this.doWithdraw(signal).finally(() => {
      this.withdrawFlight = null;
    });
    return this.withdrawFlight;
  }

  private async doLogout(): Promise<void> {
    const { authApi, store, sessionEvents, logger } = this.deps;
    let refreshToken: string | null = null;
    try {
      refreshToken = (await store.read()).tokens?.refreshToken ?? null;
    } catch (error) {
      logger?.log('warn', 'logout: failed to read session', { error: errorName(error) });
    }
    await this.clearLocal();
    if (refreshToken) {
      try {
        await authApi.logout(refreshToken);
      } catch (error) {
        logger?.log('warn', 'logout request failed (ignored)', { error: errorName(error), status: error instanceof ApiError ? error.status : undefined });
      }
    }
    sessionEvents.emit('logout');
  }

  private async doWithdraw(signal?: AbortSignal): Promise<WithdrawOutcome> {
    const { authApi, toast, sessionEvents, logger } = this.deps;
    try {
      await authApi.deleteAccount(signal);
    } catch (error) {
      if (isCancellation(error)) return { kind: 'cancelled' };
      logger?.log('warn', 'withdraw failed', { error: errorName(error), status: error instanceof ApiError ? error.status : undefined });
      // 재인증 필요는 갱신 계층이 세션을 정리하고 로그인으로 보낸다. 실패 토스트는 보이지 않는다.
      const reauth = error instanceof ApiError && error.status === 401 && error.errorCode === 'REAUTHENTICATION_REQUIRED';
      if (!reauth) toast.show(t('auth.withdraw.error'));
      return { kind: 'failed' };
    }
    await this.clearLocal();
    sessionEvents.emit('withdrawn');
    return { kind: 'done' };
  }

  private async clearLocal(): Promise<void> {
    try {
      await this.deps.store.clear();
    } catch (error) {
      this.deps.logger?.log('warn', 'failed to clear session', { error: errorName(error) });
    }
    await this.deps.userCaches.clearAll();
  }
}
