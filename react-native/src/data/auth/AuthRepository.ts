import type { ApiClient } from '../../core/http/ApiClient';
import type { PushRegistrar } from '../../core/push/PushRegistrar';
import type { UserDataCache } from '../../core/push/UserDataCache';
import {
  credentialsFromTokenResponse,
  type TokenResponse,
} from '../../core/session/SessionCredentials';
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
  async socialLoginKakao(input: PendingSignUp, signal?: AbortSignal): Promise<SocialLoginOutcome> {
    const { api, sessionStore, clock } = this.deps;
    const response = await api.requestJson(
      {
        method: 'POST',
        path: '/auth/social-login',
        body: { provider: 'KAKAO', idToken: input.idToken, rawNonce: input.rawNonce },
        signal,
      },
      decodeSocialLogin,
    );
    if (response.status === 'SIGN_UP_REQUIRED') {
      return {
        kind: 'sign-up-required',
        pending: { idToken: input.idToken, rawNonce: input.rawNonce },
      };
    }
    // 이전 계정의 캐시가 새 세션에 섞이지 않도록 저장보다 먼저 비운다.
    await this.clearUserData();
    await sessionStore.saveAuthenticated(
      credentialsFromTokenResponse(response.userId, response, clock.now()),
    );
    return { kind: 'logged-in', userId: response.userId };
  }

  /** 서버 호출 없이 인증 자격을 지우고 게스트 플래그를 저장한다. 저장 실패는 throw. */
  enterGuest(): Promise<void> {
    return this.deps.sessionStore.enterGuest();
  }

  /** 게스트 플래그를 지운다(설정의 "로그인" 버튼). 서버 호출 없음. */
  leaveGuest(): Promise<void> {
    return this.deps.sessionStore.clear();
  }

  /** 로컬 세션·캐시·푸시 등록 캐시를 먼저 지운 뒤 POST /auth/logout {refreshToken}. 요청 실패는 무시한다. 재시도 없음. */
  async logout(): Promise<void> {
    const { api, sessionStore } = this.deps;
    const state = await sessionStore.load();
    await sessionStore.clear();
    await this.clearUserData();
    this.deps.pushRegistrar.resetRegistrationCache();
    if (state.kind !== 'authenticated') return;
    try {
      await api.requestVoid({
        method: 'POST',
        path: '/auth/logout',
        body: { refreshToken: state.credentials.refreshToken },
      });
    } catch {
      // 서버 폐기는 최선 노력이다. 로컬은 이미 로그아웃됐다.
    }
  }

  /** DELETE /users/me. 204일 때만 로컬 세션·캐시를 정리한다. 실패는 throw하고 세션은 그대로다. */
  async withdraw(): Promise<void> {
    const { api, sessionStore } = this.deps;
    await api.requestVoid({ method: 'DELETE', path: '/users/me' });
    await sessionStore.clear();
    await this.clearUserData();
    this.deps.pushRegistrar.resetRegistrationCache();
  }

  private async clearUserData(): Promise<void> {
    for (const cache of this.deps.caches) await cache.clearAll();
  }
}

type SocialLoginResponse =
  { status: 'SIGN_UP_REQUIRED' } | ({ status: 'LOGIN_SUCCESS'; userId: string } & TokenResponse);

function decodeSocialLogin(raw: unknown): SocialLoginResponse {
  const o = raw as Record<string, unknown>;
  if (o.status === 'SIGN_UP_REQUIRED') return { status: 'SIGN_UP_REQUIRED' };
  if (o.status !== 'LOGIN_SUCCESS') throw new Error('unknown status');
  const { userId, accessToken, refreshToken, expiresIn, refreshTokenExpiresIn } = o;
  if (
    !isNonEmptyString(userId) ||
    !isNonEmptyString(accessToken) ||
    !isNonEmptyString(refreshToken) ||
    !isPositiveNumber(expiresIn) ||
    !isPositiveNumber(refreshTokenExpiresIn)
  ) {
    throw new Error('missing login fields');
  }
  return {
    status: 'LOGIN_SUCCESS',
    userId,
    accessToken,
    refreshToken,
    expiresIn,
    refreshTokenExpiresIn,
  };
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isPositiveNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;
