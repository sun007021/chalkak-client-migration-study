import { Observable } from '../../core/state/Observable';
import { CancelledError, ReauthenticationRequiredError } from '../../core/http/ApiError';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { AuthRepository } from '../../data/auth/AuthRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from './AuthFlowNavigator';

export type AccountActionsState = {
  /** 요청 진행 중에는 해당 버튼을 비활성화한다. */
  pending: 'none' | 'logout' | 'withdraw';
};

/**
 * 설정 화면의 로그아웃·탈퇴 실행부. 확인 대화상자는 화면이 먼저 보이고, 사용자가 확정한 뒤 이 메서드를 부른다.
 * 설정 화면 PR이 이 ViewModel을 쓴다.
 */
export class AccountActionsViewModel extends Observable<AccountActionsState> {
  constructor(
    private readonly deps: {
      authRepository: AuthRepository;
      navigator: AuthFlowNavigator;
      toast: ToastPresenter;
      /** 로컬 정리 실패 같은 사용자에게 보이지 않는 오류를 남긴다. 기본은 console.error. */
      reportError?: (message: string, error: unknown) => void;
    },
  ) {
    super({ pending: 'none' });
  }

  private screenGone = false;

  /**
   * 로컬 정리가 끝나면 서버 응답을 기다리지 않고 바로 로그인 화면으로 간다. 서버 폐기는 백그라운드로 보낸다.
   * 로컬 정리가 실패해도 사용자는 로그아웃된 것으로 보고 로그인으로 보낸다(오류는 reportError로만 남긴다).
   * 중복 호출은 무시한다.
   */
  async confirmLogout(): Promise<void> {
    if (!this.begin('logout')) return;
    const { authRepository, navigator } = this.deps;
    let refreshToken: string | null = null;
    try {
      refreshToken = await authRepository.clearLocalSession();
    } catch (error) {
      (this.deps.reportError ?? defaultReportError)('logout: local cleanup failed', error);
    } finally {
      this.end();
    }
    navigator.toLogin();
    if (refreshToken !== null) void authRepository.revokeRefreshToken(refreshToken);
  }

  /** 204면 로그인 화면, 실패면 세션 유지 + 토스트 auth.withdraw.error. 화면이 사라진 뒤의 실패와 세션 만료는 토스트하지 않는다. */
  async confirmWithdraw(): Promise<void> {
    if (!this.begin('withdraw')) return;
    try {
      await this.deps.authRepository.withdraw();
    } catch (error) {
      this.end();
      // 세션 만료(REAUTHENTICATION_REQUIRED)는 session-expired 이벤트가 로그인으로 보내므로 실패 토스트를 띄우지 않는다.
      const silent =
        error instanceof CancelledError || error instanceof ReauthenticationRequiredError;
      if (!this.screenGone && !silent) {
        this.deps.toast.show(t('auth.withdraw.error'));
      }
      return;
    }
    this.end();
    // 세션은 이미 지워졌으므로 화면이 사라졌어도 로그인으로 보낸다.
    this.deps.navigator.toLogin();
  }

  /** 게스트 "로그인" 버튼. 게스트 플래그를 지우고 로그인 화면으로 간다. */
  async loginFromGuest(): Promise<void> {
    await this.deps.authRepository.leaveGuest();
    this.deps.navigator.toLogin();
  }

  override dispose(): void {
    this.screenGone = true;
    super.dispose();
  }

  private begin(action: 'logout' | 'withdraw'): boolean {
    if (this.getSnapshot().pending !== 'none') return false;
    this.setState({ pending: action });
    return true;
  }

  private end(): void {
    this.setState({ pending: 'none' });
  }
}

function defaultReportError(message: string, error: unknown): void {
  console.error(`[AccountActions] ${message}`, error);
}
