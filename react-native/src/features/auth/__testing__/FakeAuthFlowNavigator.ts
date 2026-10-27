import type { PendingSignUp } from '../../../data/auth/AuthRepository';
import type { AuthFlowNavigator, MainMode } from '../AuthFlowNavigator';

export class FakeAuthFlowNavigator implements AuthFlowNavigator {
  readonly calls: string[] = [];
  lastPending: PendingSignUp | null = null;

  toMain(mode: MainMode): void {
    this.calls.push(`main:${mode}`);
  }

  toSignUp(pending: PendingSignUp): void {
    this.calls.push('sign-up');
    this.lastPending = pending;
  }

  toLogin(): void {
    this.calls.push('login');
  }
}
