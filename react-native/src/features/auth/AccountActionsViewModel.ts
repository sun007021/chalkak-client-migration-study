import { Observable } from '../../core/state/Observable';
import { CancelledError } from '../../core/http/ApiError';
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
    },
  ) {
    super({ pending: 'none' });
  }

  private screenGone = false;

  /** 로컬 정리 후 로그인 화면. 중복 호출은 무시한다. */
  async confirmLogout(): Promise<void> {
    if (!this.begin('logout')) return;
    try {
      await this.deps.authRepository.logout();
    } finally {
      this.end();
    }
    this.deps.navigator.toLogin();
  }

  /** 204면 로그인 화면, 실패면 세션 유지 + 토스트 auth.withdraw.error. 화면이 사라진 뒤의 실패는 토스트하지 않는다. */
  async confirmWithdraw(): Promise<void> {
    if (!this.begin('withdraw')) return;
    try {
      await this.deps.authRepository.withdraw();
    } catch (error) {
      this.end();
      if (!this.screenGone && !(error instanceof CancelledError)) {
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
