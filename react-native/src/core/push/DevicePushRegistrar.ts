import type { ApiClient } from '../http/ApiClient';
import { ReauthenticationRequiredError } from '../http/ApiError';
import type { NetworkLogger } from '../http/NetworkLogger';
import type { TokenRefresher } from '../http/TokenRefresher';
import type { AppVisibility } from '../lifecycle/AppVisibility';
import type { SessionStore } from '../session/SessionStore';
import { hasSessionId } from './JwtSessionId';
import type { PushRegistrar } from './PushRegistrar';
import type { PushTokenProvider } from './PushTokenProvider';

export type DevicePushRegistrarDeps = {
  api: ApiClient;
  sessionStore: SessionStore;
  tokenRefresher: TokenRefresher;
  tokens: PushTokenProvider;
  visibility: AppVisibility;
  /** 없으면 실패를 기록하지 않는다. 토큰 원문은 기록하지 않는다(REQ-PUSH-018). */
  logger?: NetworkLogger;
};

/**
 * 푸시 기기 등록(`PUT /push-devices/current {fcmToken}`). registerDevice는 절대 reject하지 않는다:
 * 실패는 로그인 상태를 건드리지 않고 다음 트리거(앱 시작, 포그라운드, 토큰 변경)에 다시 시도한다(REQ-PUSH-012).
 * 호출은 한 줄로 직렬화되고, 같은 프로세스에서 성공한 (userId, 토큰) 쌍은 다시 보내지 않는다.
 */
export class DevicePushRegistrar implements PushRegistrar {
  private tail: Promise<void> = Promise.resolve();
  private registered: { userId: string; token: string } | null = null;

  constructor(private readonly deps: DevicePushRegistrarDeps) {}

  registerDevice(): Promise<void> {
    const run = this.tail.then(() => this.attempt());
    this.tail = run;
    return run;
  }

  /** 지금까지 걸린 등록이 모두 끝나면 resolve. */
  settled(): Promise<void> {
    return this.tail;
  }

  resetRegistrationCache(): void {
    this.registered = null;
  }

  /** 토큰 갱신과 포그라운드 복귀에 등록을 건다. 반환 함수로 해제한다. */
  start(): () => void {
    const stopTokens = this.deps.tokens.subscribe(() => void this.registerDevice());
    const stopVisibility = this.deps.visibility.subscribe((state) => {
      if (state === 'foreground') void this.registerDevice();
    });
    return () => {
      stopTokens();
      stopVisibility();
    };
  }

  private async attempt(): Promise<void> {
    try {
      await this.register();
    } catch (error) {
      // 등록 실패는 사용자에게 보이지 않는다. 오류 종류만 남기고 다음 트리거에 맡긴다.
      this.deps.logger?.log({
        level: 'warn',
        event: 'push.register.failed',
        detail: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  private async register(): Promise<void> {
    const { sessionStore, tokens, api } = this.deps;
    const session = await sessionStore.load();
    if (session.kind !== 'authenticated') return;
    const { userId } = session.credentials;
    const token = await tokens.getToken();
    if (token === null || token.trim() === '') return;
    if (this.registered?.userId === userId && this.registered.token === token) return;

    const generation = sessionStore.generation();
    if (!(await this.ensureSessionId(session.credentials))) return;

    await api.requestVoid({
      method: 'PUT',
      path: '/push-devices/current',
      body: { fcmToken: token },
    });
    // 요청 중 로그아웃·계정 전환이 있었으면 성공을 기록하지 않는다.
    if (sessionStore.generation() === generation) this.registered = { userId, token };
  }

  /** 액세스 토큰에 session_id가 없으면 한 번 갱신한다. 갱신해도 없거나 세션이 바뀌었으면 false. */
  private async ensureSessionId(credentials: {
    userId: string;
    accessToken: string;
    refreshToken: string;
  }): Promise<boolean> {
    if (hasSessionId(credentials.accessToken)) return true;
    try {
      const outcome = await this.deps.tokenRefresher.refresh(
        credentials.refreshToken,
        credentials.userId,
      );
      return outcome.kind === 'refreshed' && hasSessionId(outcome.credentials.accessToken);
    } catch (error) {
      // 갱신 거절(REAUTH)은 TokenRefresher가 세션을 지우고 로그인 이벤트를 냈다. 그 밖의 실패는 다음 트리거에 다시 한다.
      if (error instanceof ReauthenticationRequiredError) return false;
      throw error;
    }
  }
}
