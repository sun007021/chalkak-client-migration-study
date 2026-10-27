import type { SessionStore } from '../../core/auth/SessionStore';
import type { UserCaches } from '../../core/auth/UserCaches';
import type { IdGenerator } from '../../core/ids';
import type { Logger } from '../../core/net/Logger';
import { ViewModel } from '../../core/state/ViewModel';
import type { AuthApi } from './AuthApi';
import type { SignupDraft } from './SignupDraft';
import type { ResumeKakaoRedirect, SocialLoginClient } from './SocialLoginClient';

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

export class LoginViewModel extends ViewModel<LoginState> {
  constructor(_deps: LoginViewModelDeps) {
    super({ busy: 'none', error: null });
  }
  /** 카카오 인증 → social-login. 진행 중이면 아무것도 하지 않고 stay. */
  loginWithKakao(): Promise<LoginOutcome> {
    throw new Error('not implemented');
  }
  /** 콜백 라우트에서 호출: resume(url)로 credential을 복원해 social-login을 이어 간다. */
  resumeKakaoRedirect(_callbackUrl: string): Promise<LoginOutcome> {
    throw new Error('not implemented');
  }
  /** 서버 호출 없이 자격 증명을 지우고 게스트 플래그를 저장한다. */
  browseAsGuest(): Promise<LoginOutcome> {
    throw new Error('not implemented');
  }
  dismissError(): void {
    throw new Error('not implemented');
  }
  /** 진행 중 요청을 취소하고 이후 결과를 버린다. */
  override dispose(): void {
    throw new Error('not implemented');
  }
}
