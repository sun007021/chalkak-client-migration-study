import type { SessionStore } from '../../core/auth/SessionStore';
import type { UserCaches } from '../../core/auth/UserCaches';
import type { IdGenerator } from '../../core/ids';
import { ApiError, ConfigError, InvalidResponseError, NetworkError, isCancellation } from '../../core/net/errors';
import type { Logger } from '../../core/net/Logger';
import { ViewModel } from '../../core/state/ViewModel';
import { t } from '../../copy/ko';
import type { CopyKey } from '../../copy/ko';
import type { AuthApi, SocialLoginResult } from './AuthApi';
import type { SignupDraft } from './SignupDraft';
import { SocialLoginCancelledError, SocialLoginConfigError, SocialLoginFailedError } from './SocialLoginClient';
import type { KakaoCredential, ResumeKakaoRedirect, SocialLoginClient } from './SocialLoginClient';

export interface LoginError {
  /** 메시지마다 고유. 같은 문구가 연달아 나와도 다르다(REQ-AUTH-017). */
  id: string;
  message: string;
}

export interface LoginState {
  /** none: 대기, kakao: SDK/리다이렉트 진행, server: social-login 요청, guest: 게스트 플래그 저장. none이 아니면 두 버튼 비활성. */
  busy: 'none' | 'kakao' | 'server' | 'guest';
  error: LoginError | null;
}

export type LoginOutcome =
  | { kind: 'home' }
  /** SIGN_UP_REQUIRED. idToken·rawNonce는 SignupDraft(메모리)에 있다. */
  | { kind: 'terms' }
  /** 이동 없음(취소, 오류, 이미 진행 중). */
  | { kind: 'stay' }
  /** dispose 뒤에 끝났다. 세션도 오류도 남기지 않았다. */
  | { kind: 'cancelled' };

export interface LoginViewModelDeps {
  client: SocialLoginClient;
  resume?: ResumeKakaoRedirect;
  authApi: AuthApi;
  store: SessionStore;
  signupDraft: SignupDraft;
  userCaches: UserCaches;
  ids: IdGenerator;
  logger?: Logger;
}

const STAY: LoginOutcome = { kind: 'stay' };
const CANCELLED: LoginOutcome = { kind: 'cancelled' };
const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'unknown');

export class LoginViewModel extends ViewModel<LoginState> {
  private closed = false;
  private readonly abort = new AbortController();

  constructor(private readonly deps: LoginViewModelDeps) {
    super({ busy: 'none', error: null });
  }

  /** 카카오 인증 → social-login. 진행 중이면 아무것도 하지 않고 stay. */
  loginWithKakao(): Promise<LoginOutcome> {
    return this.run((signal) => this.deps.client.login(signal));
  }

  /** 콜백 라우트에서 호출: resume(url)로 credential을 복원해 social-login을 이어 간다. */
  resumeKakaoRedirect(callbackUrl: string): Promise<LoginOutcome> {
    const { resume } = this.deps;
    return this.run(() => (resume ? resume(callbackUrl) : Promise.reject(new SocialLoginFailedError('no resume handler'))));
  }

  /** 서버 호출 없이 자격 증명을 지우고 게스트 플래그를 저장한다. */
  async browseAsGuest(): Promise<LoginOutcome> {
    if (this.closed || this.state.busy !== 'none') return STAY;
    this.setState({ busy: 'guest', error: null });
    try {
      await this.deps.userCaches.clearAll();
      await this.deps.store.write({ userId: null, tokens: null, isGuest: true });
    } catch (error) {
      this.deps.logger?.log('warn', 'guest flag save failed', { error: errorName(error) });
      if (this.closed) return CANCELLED;
      this.fail(t('auth.login.error.guest'));
      return STAY;
    }
    if (this.closed) return CANCELLED;
    this.deps.signupDraft.clear();
    this.setState({ busy: 'none' });
    return { kind: 'home' };
  }

  dismissError(): void {
    this.setState({ error: null });
  }

  /** 진행 중 요청을 취소하고 이후 결과를 버린다. */
  override dispose(): void {
    this.closed = true;
    this.abort.abort();
    super.dispose();
  }

  private async run(obtain: (signal: AbortSignal) => Promise<KakaoCredential>): Promise<LoginOutcome> {
    if (this.closed || this.state.busy !== 'none') return STAY;
    this.setState({ busy: 'kakao', error: null });
    let credential: KakaoCredential;
    try {
      credential = await obtain(this.abort.signal);
    } catch (error) {
      if (this.closed) return CANCELLED;
      return this.failKakao(error);
    }
    if (this.closed) return CANCELLED;
    return this.submit(credential);
  }

  private failKakao(error: unknown): LoginOutcome {
    if (error instanceof SocialLoginCancelledError) {
      this.setState({ busy: 'none', error: null });
      return STAY;
    }
    this.deps.logger?.log('warn', 'kakao authentication failed', { error: errorName(error) });
    this.fail(error instanceof SocialLoginConfigError ? t('auth.login.error.config') : t('auth.login.error.kakao-failed'));
    return STAY;
  }

  private async submit(credential: KakaoCredential): Promise<LoginOutcome> {
    const { authApi, signupDraft, userCaches, store, logger } = this.deps;
    this.setState({ busy: 'server' });
    let result: SocialLoginResult;
    try {
      result = await authApi.socialLogin(credential, this.abort.signal);
    } catch (error) {
      if (this.closed || isCancellation(error)) return CANCELLED;
      logger?.log('warn', 'social login failed', { error: errorName(error), status: error instanceof ApiError ? error.status : undefined });
      this.fail(this.messageFor(error));
      return STAY;
    }
    if (this.closed) return CANCELLED;
    if (result.kind === 'sign_up_required') {
      signupDraft.set(credential);
      this.setState({ busy: 'none' });
      return { kind: 'terms' };
    }
    try {
      await userCaches.clearAll(); // 새 세션을 쓰기 전에 이전 계정의 캐시를 비운다(TC-AUTH-058)
      if (this.closed) return CANCELLED;
      await store.write({ userId: result.userId, tokens: result.tokens, isGuest: false });
    } catch (error) {
      logger?.log('error', 'session save failed', { error: errorName(error) });
      if (this.closed) return CANCELLED;
      this.fail(t('auth.login.error.generic'));
      return STAY;
    }
    signupDraft.clear();
    this.setState({ busy: 'none' });
    return { kind: 'home' };
  }

  private messageFor(error: unknown): string {
    if (error instanceof NetworkError) return t('auth.login.error.network');
    if (error instanceof InvalidResponseError) return t('auth.login.error.invalid-response');
    if (error instanceof ConfigError) return t('common.error.config');
    if (error instanceof ApiError) {
      if (error.status === 401) return t('auth.login.error.kakao-account');
      if (error.status === 403 && error.message) return error.message; // 정지 회원 안내는 서버 문구 그대로(D-08)
    }
    return t('auth.login.error.generic' satisfies CopyKey);
  }

  private fail(message: string): void {
    this.setState({ busy: 'none', error: { id: this.deps.ids.next(), message } });
  }
}
