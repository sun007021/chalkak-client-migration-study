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
    const response = await this.deps.api.requestJson(
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
    await this.saveIssuedSession(response.userId, response);
    return { kind: 'logged-in', userId: response.userId };
  }

  /**
   * 서버가 발급한 토큰(로그인 성공·가입 완료 응답)을 저장한다: 사용자 캐시를 먼저 비우고 세션을 저장하며 게스트 플래그를 지운다.
   * socialLoginKakao와 SignUpRepository.confirm이 공유한다.
   */
  async saveIssuedSession(userId: string, tokens: TokenResponse): Promise<void> {
    // 이전 계정의 캐시가 새 세션에 섞이지 않도록 저장보다 먼저 비운다.
    await this.clearUserData();
    await this.deps.sessionStore.saveAuthenticated(
      credentialsFromTokenResponse(userId, tokens, this.deps.clock.now()),
    );
  }

  /** 서버 호출 없이 인증 자격을 지우고 게스트 플래그를 저장한다. 저장 실패는 throw. */
  enterGuest(): Promise<void> {
    return this.deps.sessionStore.enterGuest();
  }

  /** 게스트 플래그를 지운다(설정의 "로그인" 버튼). 서버 호출 없음. */
  leaveGuest(): Promise<void> {
    return this.deps.sessionStore.clear();
  }

  /**
   * 로그아웃 전체: 로컬 정리(await) 뒤 서버 폐기(응답까지 await, 실패 무시). 화면은 두 단계를 나눠 부른다:
   * `clearLocalSession()` 직후 로그인으로 이동하고 `revokeRefreshToken()`은 기다리지 않는다.
   */
  async logout(): Promise<void> {
    const refreshToken = await this.clearLocalSession();
    if (refreshToken !== null) await this.revokeRefreshToken(refreshToken);
  }

  /**
   * 로컬 세션·사용자 캐시·푸시 등록 캐시를 지우고, 서버에 폐기할 refresh token(없으면 null)을 돌려준다.
   * 한 단계가 실패해도 나머지는 계속 시도하고, 끝에서 첫 오류를 던진다(호출자는 로그아웃된 것으로 취급한다).
   */
  async clearLocalSession(): Promise<string | null> {
    const { sessionStore, pushRegistrar } = this.deps;
    const state = await sessionStore.load();
    const refreshToken = state.kind === 'authenticated' ? state.credentials.refreshToken : null;
    const errors: unknown[] = [];
    const attempt = async (step: () => Promise<void> | void) => {
      try {
        await step();
      } catch (error) {
        errors.push(error);
      }
    };
    await attempt(() => sessionStore.clear());
    await attempt(() => this.clearUserData());
    await attempt(() => pushRegistrar.resetRegistrationCache());
    if (errors.length > 0) throw errors[0];
    return refreshToken;
  }

  /** POST /auth/logout {refreshToken}. 실패(네트워크·4xx·5xx·취소)는 모두 무시한다. 재시도·갱신 없음. 절대 reject하지 않는다. */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      await this.deps.api.requestVoid({
        method: 'POST',
        path: '/auth/logout',
        body: { refreshToken },
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
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('response is not an object');
  }
  const o = raw as Record<string, unknown>;
  if (o.status === 'SIGN_UP_REQUIRED') return { status: 'SIGN_UP_REQUIRED' };
  if (o.status !== 'LOGIN_SUCCESS') throw new Error('unknown status');
  return { status: 'LOGIN_SUCCESS', ...decodeIssuedTokens(raw) };
}

/** 로그인 성공·가입 완료 응답의 토큰 필드(userId 포함)를 검증한다. 하나라도 빠지면 throw. */
export function decodeIssuedTokens(raw: unknown): { userId: string } & TokenResponse {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('response is not an object');
  }
  const { userId, accessToken, refreshToken, expiresIn, refreshTokenExpiresIn } = raw as Record<
    string,
    unknown
  >;
  if (
    !isNonEmptyString(userId) ||
    !isNonEmptyString(accessToken) ||
    !isNonEmptyString(refreshToken) ||
    !isPositiveNumber(expiresIn) ||
    !isPositiveNumber(refreshTokenExpiresIn)
  ) {
    throw new Error('missing token fields');
  }
  return { userId, accessToken, refreshToken, expiresIn, refreshTokenExpiresIn };
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';
const isPositiveNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;
