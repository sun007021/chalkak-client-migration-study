import type { AnalyticsTracker } from '../../core/analytics/AnalyticsTracker';
import type { NonceGenerator } from '../../core/auth/NonceGenerator';
import type { SocialLoginClient } from '../../core/auth/SocialLoginClient';
import { Observable } from '../../core/state/Observable';
import type { PushRegistrar } from '../../core/push/PushRegistrar';
import type { AuthRepository } from '../../data/auth/AuthRepository';
import { t } from '../../shared/copy';
import type { AuthFlowNavigator } from './AuthFlowNavigator';
import { mapLoginError } from './LoginErrorMapper';

/** `id`는 표시마다 증가해 같은 문구가 연달아 와도 새 오류로 보이게 한다(REQ-AUTH-017). */
export type LoginError = { id: number; message: string };

export type LoginState = {
  /** 카카오 SDK 진행, 서버 로그인, 게스트 저장 중. 두 버튼 비활성 + 진행 표시. */
  busy: boolean;
  error: LoginError | null;
};

export type LoginViewModelDeps = {
  socialLoginClient: SocialLoginClient;
  nonceGenerator: NonceGenerator;
  authRepository: AuthRepository;
  pushRegistrar: PushRegistrar;
  navigator: AuthFlowNavigator;
  analytics: AnalyticsTracker;
};

export class LoginViewModel extends Observable<LoginState> {
  private readonly abortController = new AbortController();
  private nextErrorId = 1;

  constructor(private readonly deps: LoginViewModelDeps) {
    super({ busy: false, error: null });
  }

  /** 화면이 보일 때 `screen_view login`을 보낸다(D-22). */
  onScreenShown(): void {
    this.deps.analytics.screenView('login');
  }

  /** nonce 생성 -> SDK(해시) -> social-login(원문). 진행 중 재호출은 무시한다. */
  async onKakaoPress(): Promise<void> {
    if (this.getSnapshot().busy) return;
    this.setState({ busy: true, error: null });
    try {
      await this.loginWithKakao();
    } catch (error) {
      this.showError(mapLoginError(error));
    } finally {
      this.finish();
    }
  }

  /** 게스트 플래그 저장 -> 메인(게스트). 저장 실패면 로그인 화면에 머물고 auth.login.error.guest. */
  async onGuestPress(): Promise<void> {
    if (this.getSnapshot().busy) return;
    this.setState({ busy: true, error: null });
    try {
      await this.deps.authRepository.enterGuest();
      if (!this.isDisposed()) this.deps.navigator.toMain('guest');
    } catch {
      this.showError(t('auth.login.error.guest'));
    } finally {
      this.finish();
    }
  }

  dismissError(): void {
    if (this.getSnapshot().error === null) return;
    this.setState((prev) => ({ ...prev, error: null }));
  }

  /** 진행 중 요청을 취소한다. 이후 도착한 결과는 세션 저장·이동·오류 표시 모두 하지 않는다. */
  override dispose(): void {
    this.abortController.abort();
    super.dispose();
  }

  private async loginWithKakao(): Promise<void> {
    const { socialLoginClient, nonceGenerator, authRepository, pushRegistrar, navigator } =
      this.deps;
    const { rawNonce, nonceHash } = nonceGenerator.generate();
    const result = await socialLoginClient.login(nonceHash);
    if (this.isDisposed() || result.kind === 'cancelled') return;

    const outcome = await authRepository.socialLoginKakao(
      { idToken: result.idToken, rawNonce },
      this.abortController.signal,
    );
    if (this.isDisposed()) return;

    if (outcome.kind === 'sign-up-required') {
      navigator.toSignUp(outcome.pending);
      return;
    }
    pushRegistrar.registerDevice().catch(() => undefined);
    navigator.toMain('member');
  }

  private isDisposed(): boolean {
    return this.abortController.signal.aborted;
  }

  private showError(message: string | null): void {
    if (message === null || this.isDisposed()) return;
    this.setState((prev) => ({ ...prev, error: { id: this.nextErrorId++, message } }));
  }

  private finish(): void {
    if (this.isDisposed()) return;
    this.setState((prev) => ({ ...prev, busy: false }));
  }
}
