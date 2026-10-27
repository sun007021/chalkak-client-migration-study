import type { ApiClient } from '../../core/http/ApiClient';
import type { PushRegistrar } from '../../core/push/PushRegistrar';
import type { UserDataCache } from '../../core/push/UserDataCache';
import type { SessionStore } from '../../core/session/SessionStore';
import type { Clock } from '../../core/time/Clock';

/** 가입 흐름(다음 PR)이 쓰는 값. 가입이 끝나거나 취소될 때까지 메모리에만 둔다. */
export type PendingSignUp = { idToken: string; rawNonce: string };

export type SocialLoginOutcome =
  { kind: 'logged-in'; userId: string } | { kind: 'sign-up-required'; pending: PendingSignUp };

export type AuthRepositoryDeps = {
  api: ApiClient;
  sessionStore: SessionStore;
  clock: Clock;
  caches: readonly UserDataCache[];
  pushRegistrar: PushRegistrar;
};

/**
 * 인증 API와 세션 저장. 실패는 ApiError 하위 클래스를 그대로 던진다(문구 변환은 LoginErrorMapper).
 * 로그아웃은 네트워크 실패를 삼키고, 탈퇴는 204일 때만 정리한다.
 */
export class AuthRepository {
  constructor(private readonly deps: AuthRepositoryDeps) {}

  /** POST /auth/social-login {provider:"KAKAO", idToken, rawNonce}. LOGIN_SUCCESS면 캐시를 비우고 세션 저장(게스트 플래그 제거). */
  socialLoginKakao(_input: PendingSignUp, _signal?: AbortSignal): Promise<SocialLoginOutcome> {
    void this.deps;
    throw new Error('not implemented');
  }

  /** 서버 호출 없이 인증 자격을 지우고 게스트 플래그를 저장한다. 저장 실패는 throw. */
  enterGuest(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 게스트 플래그를 지운다(설정의 "로그인" 버튼). 서버 호출 없음. */
  leaveGuest(): Promise<void> {
    throw new Error('not implemented');
  }

  /** 로컬 세션·캐시·푸시 등록 캐시를 먼저 지운 뒤 POST /auth/logout {refreshToken}. 요청 실패는 무시한다. 재시도 없음. */
  logout(): Promise<void> {
    throw new Error('not implemented');
  }

  /** DELETE /users/me. 204일 때만 로컬 세션·캐시를 정리한다. 실패는 throw하고 세션은 그대로다. */
  withdraw(): Promise<void> {
    throw new Error('not implemented');
  }
}
