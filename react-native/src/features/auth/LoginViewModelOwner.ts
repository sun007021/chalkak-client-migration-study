import { Observable } from '../../core/state/Observable';
import type { BootViewModel } from '../boot/BootViewModel';
import type { LoginViewModel } from './LoginViewModel';

export type LoginViewModelOwnerState = {
  /** phase가 'login'인 동안에만 값이 있다. */
  viewModel: LoginViewModel | null;
};

/**
 * 로그인 ViewModel의 소유자. ViewModel은 화면이 아니라 내비게이션(phase)이 만들고 버린다:
 * phase가 'login'에 들어갈 때 만들고 `screen_view login`을 한 번 보내며, 떠날 때 dispose한다.
 * 화면 effect가 아니라 phase 전환에 묶여 있어 StrictMode 이중 effect나 리렌더에 영향받지 않는다.
 */
export class LoginViewModelOwner extends Observable<LoginViewModelOwnerState> {
  private readonly unsubscribe: () => void;

  constructor(
    private readonly boot: BootViewModel,
    private readonly create: () => LoginViewModel,
  ) {
    super({ viewModel: null });
    this.sync();
    this.unsubscribe = boot.subscribe(() => this.sync());
  }

  override dispose(): void {
    this.unsubscribe();
    this.getSnapshot().viewModel?.dispose();
    super.dispose();
  }

  private sync(): void {
    const { viewModel } = this.getSnapshot();
    const inLogin = this.boot.getSnapshot().phase === 'login';
    if (inLogin && viewModel === null) {
      const created = this.create();
      created.onScreenShown();
      this.setState({ viewModel: created });
    } else if (!inLogin && viewModel !== null) {
      viewModel.dispose();
      this.setState({ viewModel: null });
    }
  }
}
