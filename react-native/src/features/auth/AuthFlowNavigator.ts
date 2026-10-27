import type { PendingSignUp } from '../../data/auth/AuthRepository';

export type MainMode = 'member' | 'guest';

/** 인증 흐름이 화면을 바꾸는 유일한 통로. BootViewModel이 구현하고 테스트는 Fake를 쓴다. */
export interface AuthFlowNavigator {
  toMain(mode: MainMode): void;
  toSignUp(pending: PendingSignUp): void;
  toLogin(): void;
}
