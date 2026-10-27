import { WebLocksRefreshLock } from '../core/auth/RefreshLock';
import type { RefreshLock } from '../core/auth/RefreshLock';
import { IndexedDbSessionStore } from '../core/auth/IndexedDbSessionStore';
import { SessionEvents } from '../core/auth/SessionEvents';
import type { SessionStore } from '../core/auth/SessionStore';
import { UserCaches } from '../core/auth/UserCaches';
import { AnalyticsReporter } from '../core/analytics/AnalyticsReporter';
import type { AnalyticsTracker } from '../core/analytics/AnalyticsTracker';
import { LogAnalyticsTracker } from '../core/analytics/LogAnalyticsTracker';
import { RandomIdGenerator } from '../core/ids';
import type { IdGenerator } from '../core/ids';
import { readApiBaseUrl } from '../core/config/apiBaseUrl';
import { ApiClient } from '../core/net/ApiClient';
import { AuthCoordinator } from '../core/net/AuthCoordinator';
import { ConsoleLogger } from '../core/net/Logger';
import type { Logger } from '../core/net/Logger';
import { HttpTokenRefresher } from '../core/net/TokenRefresher';
import type { Clock } from '../core/time/Clock';
import { SystemClock } from '../core/time/SystemClock';
import { ToastController } from '../core/ui/ToastController';
import { AccountService } from '../features/auth/AccountService';
import { AuthApi } from '../features/auth/AuthApi';
import { DevSessionService } from '../features/auth/DevSessionService';
import { SignupDraft } from '../features/auth/SignupDraft';
import { KakaoTokenEndpointExchanger, KakaoWebLoginClient } from '../features/auth/KakaoWebLoginClient';
import { WebCryptoNonceGenerator } from '../features/auth/nonce';
import type { ResumeKakaoRedirect, SocialLoginClient } from '../features/auth/SocialLoginClient';
import { NoopHomePreloader } from '../features/boot/HomePreloader';
import type { HomePreloader } from '../features/boot/HomePreloader';
import { isDevSessionEnabled } from './devSession';
import type { DevSessionEnv } from './devSession';
import { ROUTES } from './paths';

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
export function createAppContainer(options: AppContainerOptions): AppContainer {
  const { env } = options;
  const pageOrigin = options.pageOrigin ?? globalThis.location?.origin;
  const baseUrl = readApiBaseUrl(env, { pageOrigin });

  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const clock = options.clock ?? new SystemClock();
  const logger = options.logger ?? new ConsoleLogger();
  const ids = options.ids ?? new RandomIdGenerator();
  const store = options.store ?? new IndexedDbSessionStore({ indexedDB: options.indexedDB });
  const lock = options.lock ?? new WebLocksRefreshLock();

  const sessionEvents = new SessionEvents();
  const userCaches = new UserCaches();
  const refresher = new HttpTokenRefresher({ fetch: fetchImpl, clock, baseUrl, logger });
  const authCoordinator = new AuthCoordinator({
    store,
    refresher,
    clock,
    lock,
    onSessionExpired: () => {
      void userCaches.clearAll();
      sessionEvents.emit('expired');
    },
  });
  const api = new ApiClient({ baseUrl, fetch: fetchImpl, clock, auth: authCoordinator, logger });
  const authApi = new AuthApi({ api, clock });
  const analytics = new AnalyticsReporter({ tracker: options.tracker ?? new LogAnalyticsTracker(logger), logger });
  const toast = new ToastController({ clock, ids });

  let socialLogin: SocialLoginClient;
  let resumeKakaoRedirect: ResumeKakaoRedirect | undefined;
  if (options.socialLogin) {
    socialLogin = options.socialLogin;
    resumeKakaoRedirect = options.resumeKakaoRedirect;
  } else {
    const kakao = new KakaoWebLoginClient({
      config: { clientId: env.VITE_KAKAO_CLIENT_ID ?? '', redirectUri: `${pageOrigin ?? ''}${ROUTES.kakaoCallback}` },
      nonce: new WebCryptoNonceGenerator(),
      state: ids,
      storage: {
        getItem: (key) => globalThis.sessionStorage.getItem(key),
        setItem: (key, value) => globalThis.sessionStorage.setItem(key, value),
        removeItem: (key) => globalThis.sessionStorage.removeItem(key),
      },
      redirect: (url) => globalThis.location.assign(url),
      exchanger: new KakaoTokenEndpointExchanger({ clientId: env.VITE_KAKAO_CLIENT_ID ?? '', fetch: fetchImpl }),
    });
    socialLogin = kakao;
    resumeKakaoRedirect = options.resumeKakaoRedirect ?? ((url) => kakao.resume(url));
  }

  const devSessionEnabled = isDevSessionEnabled(env);
  return {
    clock,
    logger,
    ids,
    store,
    sessionEvents,
    userCaches,
    authCoordinator,
    api,
    authApi,
    analytics,
    toast,
    socialLogin,
    resumeKakaoRedirect,
    signupDraft: new SignupDraft(),
    preloader: options.preloader ?? new NoopHomePreloader(),
    accountService: new AccountService({ authApi, store, userCaches, toast, sessionEvents, logger }),
    devSessionEnabled,
    devSession: devSessionEnabled ? new DevSessionService({ refresher, store, userCaches }) : null,
  };
}
