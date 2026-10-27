import { WebLocksRefreshLock } from '../core/auth/RefreshLock';
import type { RefreshLock } from '../core/auth/RefreshLock';
import { IndexedDbSessionStore } from '../core/auth/IndexedDbSessionStore';
import { CrossTabSessionSync } from '../core/auth/CrossTabSessionSync';
import { SessionEvents } from '../core/auth/SessionEvents';
import { createSessionChannel } from '../core/auth/SessionChannel';
import type { SessionChannel } from '../core/auth/SessionChannel';
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
import { ConfigError } from '../core/net/errors';
import { ConsoleLogger } from '../core/net/Logger';
import type { Logger } from '../core/net/Logger';
import { HttpTokenRefresher } from '../core/net/TokenRefresher';
import type { TokenRefresher } from '../core/net/TokenRefresher';
import type { Clock } from '../core/time/Clock';
import { SystemClock } from '../core/time/SystemClock';
import { ToastController } from '../core/ui/ToastController';
import { AccountService } from '../features/auth/AccountService';
import { AuthApi } from '../features/auth/AuthApi';
import { SignupDraft } from '../features/auth/SignupDraft';
import { createKakaoWebLoginClient } from '../features/auth/createKakaoLogin';
import { LoginViewModel } from '../features/auth/LoginViewModel';
import type { ResumeKakaoRedirect, SocialLoginClient } from '../features/auth/SocialLoginClient';
import { GuestGate } from '../features/shell/GuestGate';
import { MainShellViewModel } from '../features/shell/MainShellViewModel';
import { NoopUploadEntry } from '../features/shell/UploadEntry';
import type { UploadEntry } from '../features/shell/UploadEntry';
import type { SessionMode } from '../features/boot/authGate';
import type { TabDestination } from '../constants';
import { BootViewModel } from '../features/boot/BootViewModel';
import { NoopHomePreloader } from '../features/boot/HomePreloader';
import type { HomePreloader } from '../features/boot/HomePreloader';
import { DEV_SESSION_ENABLED } from './devSession';
import { ROUTES } from './paths';

export interface AppEnv {
  VITE_API_BASE_URL?: string;
  VITE_KAKAO_CLIENT_ID?: string;
}

/** env 외는 모두 테스트·특수 환경용 덮어쓰기다. 없으면 실제 구현(SystemClock, fetch, IndexedDbSessionStore, WebLocksRefreshLock, ConsoleLogger, KakaoWebLoginClient 등)을 만든다. */
export interface AppContainerOptions {
  env: AppEnv;
  /** same-origin 기준 주소 계산용. 기본 location.origin. */
  pageOrigin?: string;
  /** 개발용 세션 주입 노출. 기본 DEV_SESSION_ENABLED(빌드 시점 상수). 테스트가 끄거나 켤 때만 쓴다. */
  devSessionEnabled?: boolean;
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
  /** 탭 간 세션 신호 채널. 이 탭의 store와 CrossTabSessionSync가 같은 객체를 쓴다. 기본: createSessionChannel()(BroadcastChannel 'chalkak-session'). */
  sessionChannel?: SessionChannel;
  /** 업로드 버튼(회원)이 부르는 진입. 기본 NoopUploadEntry. */
  uploadEntry?: UploadEntry;
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
  guestGate: GuestGate;
  uploadEntry: UploadEntry;
  /** 다른 탭의 로그아웃·계정 전환을 받는다. 라우트 루트가 마운트될 때 start()한다. */
  crossTabSync: CrossTabSessionSync;
  /** 개발용 세션 주입 화면(동적 import)이 서비스를 만들 재료. devSessionEnabled가 false면 null. */
  devSessionDeps: { refresher: TokenRefresher; store: SessionStore; userCaches: UserCaches } | null;
  /** 화면이 마운트될 때마다 새 ViewModel을 만든다. 현재 컨테이너 값(this)을 읽는다. */
  createLoginViewModel(): LoginViewModel;
  createBootViewModel(): BootViewModel;
  /** 메인 셸이 마운트될 때마다 새 ViewModel을 만든다. */
  createMainShellViewModel(mode: SessionMode, initialTab?: TabDestination): MainShellViewModel;
}

/**
 * 조립 한 곳(composition root). VITE_API_BASE_URL 검증(parseApiBaseUrl)은 여기서만 하며 잘못되면 ConfigError를 던진다.
 * AuthCoordinator의 onSessionExpired는 sessionEvents.emit('expired')에 연결한다.
 */
export function createAppContainer(options: AppContainerOptions): AppContainer {
  const { env } = options;
  const pageOrigin = options.pageOrigin ?? globalThis.location?.origin;
  if (!pageOrigin) throw new ConfigError('page origin is unavailable');
  const baseUrl = readApiBaseUrl(env, { pageOrigin });

  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const clock = options.clock ?? new SystemClock();
  const logger = options.logger ?? new ConsoleLogger();
  const ids = options.ids ?? new RandomIdGenerator();
  const sessionChannel: SessionChannel = options.sessionChannel ?? createSessionChannel(); // store와 crossTabSync가 같은 객체를 쓴다
  const store = options.store ?? new IndexedDbSessionStore({ indexedDB: options.indexedDB, channel: sessionChannel });
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
    const kakao = createKakaoWebLoginClient({
      clientId: env.VITE_KAKAO_CLIENT_ID ?? '',
      redirectUri: `${pageOrigin}${ROUTES.kakaoCallback}`,
      fetch: fetchImpl,
      clock,
      ids,
    });
    socialLogin = kakao;
    resumeKakaoRedirect = options.resumeKakaoRedirect ?? ((url, signal) => kakao.resume(url, signal));
  }

  const devSessionEnabled = options.devSessionEnabled ?? DEV_SESSION_ENABLED;
  const signupDraft = new SignupDraft();
  sessionEvents.subscribe(() => signupDraft.clear()); // 로그아웃·만료 뒤에는 가입 중이던 자격 증명을 남기지 않는다
  const container: AppContainer = {
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
    signupDraft,
    preloader: options.preloader ?? new NoopHomePreloader(),
    accountService: new AccountService({ authApi, store, userCaches, toast, sessionEvents, logger }),
    devSessionEnabled,
    guestGate: new GuestGate({ toast }),
    uploadEntry: options.uploadEntry ?? new NoopUploadEntry(),
    crossTabSync: new CrossTabSessionSync({ channel: sessionChannel, userCaches, sessionEvents }),
    devSessionDeps: devSessionEnabled ? { refresher, store, userCaches } : null,
    createLoginViewModel() {
      return new LoginViewModel({
        client: this.socialLogin,
        resume: this.resumeKakaoRedirect,
        authApi: this.authApi,
        store: this.store,
        signupDraft: this.signupDraft,
        userCaches: this.userCaches,
        ids: this.ids,
        logger: this.logger,
      });
    },
    createMainShellViewModel(mode, initialTab) {
      return new MainShellViewModel({ mode, guestGate: this.guestGate, analytics: this.analytics, uploadEntry: this.uploadEntry }, initialTab);
    },
    createBootViewModel() {
      return new BootViewModel({ store: this.store, clock: this.clock, preloader: this.preloader, logger: this.logger });
    },
  };
  return container;
}
