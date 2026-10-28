import { Observable } from '../../core/state/Observable';
import type { PendingSignUp } from '../../data/auth/AuthRepository';
import type { BootViewModel } from '../boot/BootViewModel';
import type { SignUpFlowViewModel } from './SignUpFlowViewModel';

export type SignUpFlowOwnerState = {
  /** BootViewModel의 phase가 'sign-up'인 동안에만 값이 있다. */
  flow: SignUpFlowViewModel | null;
};

/**
 * 가입 흐름 ViewModel의 소유자(LoginViewModelOwner와 같은 규칙). phase가 'sign-up'에 들어갈 때(pendingSignUp과 함께)
 * 만들고 start()를 한 번 부르며, 떠나거나 pendingSignUp이 다른 값으로 바뀌면 dispose하고 새로 만든다.
 */
export class SignUpFlowOwner extends Observable<SignUpFlowOwnerState> {
  private readonly unsubscribe: () => void;
  private currentPending: PendingSignUp | null = null;

  constructor(
    private readonly boot: BootViewModel,
    private readonly create: (pending: PendingSignUp) => SignUpFlowViewModel,
  ) {
    super({ flow: null });
    this.sync();
    this.unsubscribe = boot.subscribe(() => this.sync());
  }

  override dispose(): void {
    this.unsubscribe();
    this.getSnapshot().flow?.dispose();
    super.dispose();
  }

  private sync(): void {
    const { phase, pendingSignUp } = this.boot.getSnapshot();
    const wanted = phase === 'sign-up' ? pendingSignUp : null;
    const { flow } = this.getSnapshot();
    if (wanted !== null && flow !== null && isSamePending(wanted, this.currentPending)) return;
    if (wanted === null && flow === null) return;

    flow?.dispose();
    if (wanted === null) {
      this.currentPending = null;
      this.setState({ flow: null });
      return;
    }
    const created = this.create(wanted);
    this.currentPending = wanted;
    created.start();
    this.setState({ flow: created });
  }
}

const isSamePending = (a: PendingSignUp, b: PendingSignUp | null): boolean =>
  b !== null && a.idToken === b.idToken && a.rawNonce === b.rawNonce;
