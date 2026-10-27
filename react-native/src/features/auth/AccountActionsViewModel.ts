import { Observable } from '../../core/state/Observable';
import type { ToastPresenter } from '../../core/toast/ToastPresenter';
import type { AuthRepository } from '../../data/auth/AuthRepository';
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

  /** 로컬 정리 후 로그인 화면. 중복 호출은 무시한다. */
  confirmLogout(): Promise<void> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** 204면 로그인 화면, 실패면 세션 유지 + 토스트 auth.withdraw.error. 화면이 사라진 뒤의 실패는 토스트하지 않는다. */
  confirmWithdraw(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 게스트 "로그인" 버튼. 게스트 플래그를 지우고 로그인 화면으로 간다. */
  loginFromGuest(): Promise<void> {
    throw new Error('not implemented');
  }
}
