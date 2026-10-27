import type { RefreshLock } from '../core/auth/RefreshLock';
import type { SessionEvents } from '../core/auth/SessionEvents';
import type { SessionStore } from '../core/auth/SessionStore';
import type { UserCaches } from '../core/auth/UserCaches';
import type { AnalyticsReporter } from '../core/analytics/AnalyticsReporter';
import type { AnalyticsTracker } from '../core/analytics/AnalyticsTracker';
import type { IdGenerator } from '../core/ids';
import type { ApiClient } from '../core/net/ApiClient';
import type { AuthCoordinator } from '../core/net/AuthCoordinator';
import type { Logger } from '../core/net/Logger';
import type { Clock } from '../core/time/Clock';
import type { ToastController } from '../core/ui/ToastController';
import type { AccountService } from '../features/auth/AccountService';
import type { AuthApi } from '../features/auth/AuthApi';
import type { DevSessionService } from '../features/auth/DevSessionService';
import type { SignupDraft } from '../features/auth/SignupDraft';
import type { ResumeKakaoRedirect, SocialLoginClient } from '../features/auth/SocialLoginClient';
import type { HomePreloader } from '../features/boot/HomePreloader';
import type { DevSessionEnv } from './devSession';

export interface AppEnv extends DevSessionEnv {
  VITE_API_BASE_URL?: string;
  VITE_KAKAO_CLIENT_ID?: string;
}

/** env 외는 모두 테스트·특수 환경용 덮어쓰기다. 없으면 실제 구현(SystemClock, fetch, IndexedDbSessionStore, WebLocksRefreshLock, ConsoleLogger, KakaoWebLoginClient 등)을 만든다. */
export interface AppContainerOptions {
  env: AppEnv;
  /** same-origin 기준 주소 계산용. 기본 location.origin. */
  pageOrigin?: string;
  fetch?: typeof fetch;
  clock?: Clock;
  store?: SessionStore;
  lock?: RefreshLock;
  logger?: Logger;
  tracker?: AnalyticsTracker;
  ids?: IdGenerator;
  socialLogin?: SocialLoginClient;
  resumeKakaoRedirect?: ResumeKakaoRedirect;
  preloader?: HomePreloader;
  /** 기본 store가 IndexedDbSessionStore일 때 쓸 IDBFactory. */
  indexedDB?: IDBFactory;
}

export interface AppContainer {
  clock: Clock;
  logger: Logger;
  ids: IdGenerator;
  store: SessionStore;
  sessionEvents: SessionEvents;
  userCaches: UserCaches;
  authCoordinator: AuthCoordinator;
  api: ApiClient;
  authApi: AuthApi;
  analytics: AnalyticsReporter;
  toast: ToastController;
  socialLogin: SocialLoginClient;
  /** 리다이렉트 콜백 라우트가 쓴다. 리다이렉트 방식이 아닌 구현이면 undefined. */
  resumeKakaoRedirect: ResumeKakaoRedirect | undefined;
  signupDraft: SignupDraft;
  preloader: HomePreloader;
  accountService: AccountService;
  devSessionEnabled: boolean;
  /** devSessionEnabled가 false면 null(코드 경로도 만들지 않는다). */
  devSession: DevSessionService | null;
}

/**
 * 조립 한 곳(composition root). VITE_API_BASE_URL 검증(parseApiBaseUrl)은 여기서만 하며 잘못되면 ConfigError를 던진다.
 * AuthCoordinator의 onSessionExpired는 sessionEvents.emit('expired')에 연결한다.
 */
export function createAppContainer(_options: AppContainerOptions): AppContainer {
  throw new Error('not implemented');
}
