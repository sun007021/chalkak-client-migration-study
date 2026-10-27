import { createNavigationContainerRef } from '@react-navigation/native';
import { getRandomBytes } from 'expo-crypto';

import { ConsoleAnalyticsTracker } from '../core/analytics/ConsoleAnalyticsTracker';
import type { AnalyticsTracker } from '../core/analytics/AnalyticsTracker';
import { KakaoSocialLoginClient } from '../core/auth/KakaoSocialLoginClient';
import { type NonceGenerator, SecureNonceGenerator } from '../core/auth/NonceGenerator';
import { SeoulKakaoSdk } from '../core/auth/SeoulKakaoSdk';
import { selectSocialLoginClient } from '../core/auth/selectSocialLoginClient';
import type { SocialLoginClient } from '../core/auth/SocialLoginClient';
import type { AppConfig } from '../core/config/AppConfig';
import type { AppInfo } from '../core/config/AppInfo';
import { type FeatureFlags, readFeatureFlags } from '../core/config/FeatureFlags';
import type { AppVisibility } from '../core/lifecycle/AppVisibility';
import { ReactNativeAppVisibility } from '../core/lifecycle/ReactNativeAppVisibility';
import type { ExternalLinkOpener } from '../core/linking/ExternalLinkOpener';
import { LinkingExternalLinkOpener } from '../core/linking/LinkingExternalLinkOpener';
import { NoopPushRegistrar } from '../core/push/NoopPushRegistrar';
import type { PushRegistrar } from '../core/push/PushRegistrar';
import type { UserDataCache } from '../core/push/UserDataCache';
import { UserDataCacheRegistry } from '../core/push/UserDataCacheRegistry';
import { ToastCenter } from '../core/toast/ToastCenter';
import type { ToastPresenter } from '../core/toast/ToastPresenter';
import { AuthRepository } from '../data/auth/AuthRepository';
import { BannerRepository } from '../data/banner/BannerRepository';
import { NotificationRepository } from '../data/notification/NotificationRepository';
import { PostRepository } from '../data/post/PostRepository';
import { TopicRepository } from '../data/topic/TopicRepository';
import type { AiReviewPoller } from '../features/ai-review/AiReviewPoller';
import { NoopAiReviewPoller } from '../features/ai-review/NoopAiReviewPoller';
import type { MainMode } from '../features/auth/AuthFlowNavigator';
import { BannerFeedViewModel } from '../features/banner/BannerFeedViewModel';
import { IssueWebViewModel } from '../features/banner/IssueWebViewModel';
import { HomeViewModel } from '../features/home/HomeViewModel';
import { HomeViewModelOwner } from '../features/home/HomeViewModelOwner';
import type { LikeController } from '../features/like/LikeController';
import { NoopLikeController } from '../features/like/NoopLikeController';
import { NavigationHomeNavigator } from './NavigationHomeNavigator';
import type { RootStackParamList } from './navigation/routes';
import { LoginViewModel } from '../features/auth/LoginViewModel';
import { LoginViewModelOwner } from '../features/auth/LoginViewModelOwner';
import { AuthGate } from '../features/boot/AuthGate';
import { BootViewModel } from '../features/boot/BootViewModel';
import { ForceUpdateGate } from '../features/boot/ForceUpdateGate';
import type { HomePreloader } from '../features/boot/HomePreloader';
import { ItunesUpdateChecker } from '../features/boot/ItunesUpdateChecker';
import { LinkingStoreOpener } from '../features/boot/LinkingStoreOpener';
import { NoopHomePreloader } from '../features/boot/NoopHomePreloader';
import { PlayUpdateChecker } from '../features/boot/PlayUpdateChecker';
import { UnavailablePlayUpdateClient } from '../features/boot/UnavailablePlayUpdateClient';
import type { StoreOpener, UpdateChecker } from '../features/boot/UpdateChecker';
import { UpdateDialogViewModel } from '../features/boot/UpdateDialogViewModel';
import { ApiClient } from '../core/http/ApiClient';
import { AuthSessionEvents } from '../core/http/AuthSessionEvents';
import { ConsoleNetworkLogger } from '../core/http/ConsoleNetworkLogger';
import { FetchTransport } from '../core/http/FetchTransport';
import { HttpRefreshEndpoint } from '../core/http/HttpRefreshEndpoint';
import { SystemSleeper } from '../core/http/SystemSleeper';
import { TokenRefresher } from '../core/http/TokenRefresher';
import { ExpoSecureKeyValueStorage } from '../core/session/ExpoSecureKeyValueStorage';
import { SecureSessionStore } from '../core/session/SecureSessionStore';
import type { SessionStore } from '../core/session/SessionStore';
import { type Clock, SystemClock } from '../core/time/Clock';
import { TOAST_DURATION_MS } from '../shared/constants';

/** 컨테이너가 조립하는 의존성 전체. 새 의존성은 여기에 추가한다. */
export interface Dependencies {
  readonly config: AppConfig;
  readonly clock: Clock;
  readonly sessionStore: SessionStore;
  readonly events: AuthSessionEvents;
  readonly api: ApiClient;
  readonly featureFlags: FeatureFlags;
  readonly appInfo: AppInfo;
  readonly analytics: AnalyticsTracker;
  readonly socialLoginClient: SocialLoginClient;
  readonly nonceGenerator: NonceGenerator;
  readonly pushRegistrar: PushRegistrar;
  readonly homePreloader: HomePreloader;
  readonly updateChecker: UpdateChecker;
  readonly storeOpener: StoreOpener;
  readonly visibility: AppVisibility;
  readonly linkOpener: ExternalLinkOpener;
  /** 기본은 화면 위에 그리는 ToastCenter(`container.toastCenter`). 테스트는 Fake를 넣는다. */
  readonly toast: ToastPresenter;
  /** 좋아요·AI 리뷰 PR이 실제 구현으로 바꾼다. 그 전에는 아무 일도 하지 않는 구현이다. */
  readonly likes: LikeController;
  readonly aiReview: AiReviewPoller;
  /** 로그아웃·탈퇴·계정 전환 때 비울 사용자별 캐시. 캐시를 가진 기능 PR이 추가한다. */
  readonly userDataCaches: readonly UserDataCache[];
}

const DEFAULT_APP_INFO: AppInfo = { platform: 'ios', bundleId: '', version: '', appStoreId: null };

/** 의존성 조립 지점. 테스트에서는 fake를 `overrides`로 넣는다. 전역(Constants 등)은 읽지 않는다. */
export class AppContainer {
  readonly config: AppConfig;
  readonly clock: Clock;
  readonly sessionStore: SessionStore;
  readonly events: AuthSessionEvents;
  readonly api: ApiClient;
  readonly featureFlags: FeatureFlags;
  readonly appInfo: AppInfo;
  readonly analytics: AnalyticsTracker;
  readonly authRepository: AuthRepository;
  readonly toast: ToastPresenter;
  /** 기본 토스트 구현일 때만 있다(ToastHost가 그린다). */
  readonly toastCenter: ToastCenter | null;
  /** 화면 이동의 단일 출처. NavigationContainer의 ref로 연결한다. */
  readonly navigationHandle = createNavigationContainerRef<RootStackParamList>();
  readonly bootViewModel: BootViewModel;
  readonly updateDialogViewModel: UpdateDialogViewModel;
  /** 메인에 있는 동안 홈 ViewModel을 만들고 버린다. 홈 탭 화면은 이것을 구독해 받는다. */
  readonly homeOwner: HomeViewModelOwner;
  /** phase가 login인 동안 로그인 ViewModel을 만들고 버린다. 화면은 이것을 구독해 받는다. */
  readonly loginOwner: LoginViewModelOwner;
  private readonly socialLoginClient: SocialLoginClient;
  private readonly nonceGenerator: NonceGenerator;
  private readonly pushRegistrar: PushRegistrar;
  private readonly dependencies: Dependencies;
  private readonly homeNavigator = new NavigationHomeNavigator(this.navigationHandle);
  private readonly cacheRegistry = new UserDataCacheRegistry();

  private constructor(dependencies: Dependencies, toastCenter: ToastCenter | null) {
    this.dependencies = dependencies;
    this.toast = dependencies.toast;
    this.toastCenter = toastCenter;
    this.config = dependencies.config;
    this.clock = dependencies.clock;
    this.sessionStore = dependencies.sessionStore;
    this.events = dependencies.events;
    this.api = dependencies.api;
    this.featureFlags = dependencies.featureFlags;
    this.appInfo = dependencies.appInfo;
    this.analytics = dependencies.analytics;
    this.socialLoginClient = dependencies.socialLoginClient;
    this.nonceGenerator = dependencies.nonceGenerator;
    this.pushRegistrar = dependencies.pushRegistrar;
    this.authRepository = new AuthRepository({
      api: this.api,
      sessionStore: this.sessionStore,
      clock: this.clock,
      // 소유자가 만들고 버리는 캐시(홈 등)는 레지스트리에 올라간다.
      caches: [...dependencies.userDataCaches, this.cacheRegistry],
      pushRegistrar: this.pushRegistrar,
    });
    this.bootViewModel = new BootViewModel({
      forceUpdateGate: new ForceUpdateGate(
        dependencies.updateChecker,
        this.featureFlags.forceUpdateCheckEnabled,
      ),
      authGate: new AuthGate(this.sessionStore, this.clock),
      homePreloader: dependencies.homePreloader,
      pushRegistrar: this.pushRegistrar,
      events: this.events,
    });
    this.updateDialogViewModel = new UpdateDialogViewModel(dependencies.storeOpener);
    this.loginOwner = new LoginViewModelOwner(this.bootViewModel, () =>
      this.createLoginViewModel(),
    );
    this.homeOwner = new HomeViewModelOwner({
      boot: this.bootViewModel,
      create: (mode) => this.createHomeViewModel(mode),
      registerCache: (cache) => this.cacheRegistry.register(cache),
    });
  }

  /** 소유자(homeOwner)만 부른다. */
  private createHomeViewModel(mode: MainMode): HomeViewModel {
    const { api, clock } = this;
    const { likes, aiReview, visibility } = this.dependencies;
    return new HomeViewModel({
      mode,
      clock,
      topics: new TopicRepository({ api }),
      posts: new PostRepository({ api }),
      notifications: new NotificationRepository({ api }),
      bannerFeed: new BannerFeedViewModel({ repository: new BannerRepository({ api }) }),
      likes,
      aiReview,
      visibility,
      navigator: this.homeNavigator,
      toast: this.toast,
    });
  }

  /** 웹뷰 라우트(내비게이션)만 부른다. */
  createIssueWebViewModel(url: string): IssueWebViewModel {
    return new IssueWebViewModel({
      url,
      analytics: this.analytics,
      toast: this.toast,
      linkOpener: this.dependencies.linkOpener,
    });
  }

  /** 소유자(loginOwner)만 부른다. 전환 요청은 BootViewModel로 간다. */
  private createLoginViewModel(): LoginViewModel {
    return new LoginViewModel({
      socialLoginClient: this.socialLoginClient,
      nonceGenerator: this.nonceGenerator,
      authRepository: this.authRepository,
      pushRegistrar: this.pushRegistrar,
      navigator: this.bootViewModel,
      analytics: this.analytics,
    });
  }

  /** `config`는 앱 루트가 `readAppConfig()`로 읽어 넘긴다. 나머지는 기본 구현이며 `overrides`로 바꾼다. */
  static create(config: AppConfig, overrides: Partial<Dependencies> = {}): AppContainer {
    const clock = overrides.clock ?? new SystemClock();
    const logger = new ConsoleNetworkLogger();
    const sessionStore =
      overrides.sessionStore ??
      new SecureSessionStore(new ExpoSecureKeyValueStorage(), (message) =>
        logger.log({ level: 'warn', event: 'session.storage', detail: message }),
      );
    const events = overrides.events ?? new AuthSessionEvents();
    const transport = new FetchTransport();
    const tokenRefresher = new TokenRefresher({
      sessionStore,
      endpoint: new HttpRefreshEndpoint({ transport, baseUrl: config.apiBaseUrl }),
      clock,
      events,
      logger,
    });
    const api =
      overrides.api ??
      new ApiClient({
        baseUrl: config.apiBaseUrl,
        transport,
        sessionStore,
        tokenRefresher,
        events,
        sleeper: new SystemSleeper(),
        clock,
        logger,
      });
    const featureFlags = overrides.featureFlags ?? readFeatureFlags(undefined);
    const appInfo = overrides.appInfo ?? DEFAULT_APP_INFO;
    const visibility = overrides.visibility ?? new ReactNativeAppVisibility();
    const toastCenter = overrides.toast
      ? null
      : new ToastCenter({ visibility, durationMs: TOAST_DURATION_MS });
    return new AppContainer(
      {
        config: overrides.config ?? config,
        clock,
        sessionStore,
        events,
        api,
        featureFlags,
        appInfo,
        analytics: overrides.analytics ?? new ConsoleAnalyticsTracker(),
        socialLoginClient:
          overrides.socialLoginClient ??
          selectSocialLoginClient(featureFlags, new KakaoSocialLoginClient(new SeoulKakaoSdk())),
        nonceGenerator: overrides.nonceGenerator ?? new SecureNonceGenerator(getRandomBytes),
        pushRegistrar: overrides.pushRegistrar ?? new NoopPushRegistrar(),
        homePreloader: overrides.homePreloader ?? new NoopHomePreloader(),
        updateChecker: overrides.updateChecker ?? createUpdateChecker(appInfo, transport),
        storeOpener: overrides.storeOpener ?? new LinkingStoreOpener(storeUrlFor(appInfo)),
        userDataCaches: overrides.userDataCaches ?? [],
        visibility,
        linkOpener: overrides.linkOpener ?? new LinkingExternalLinkOpener(),
        toast: overrides.toast ?? toastCenter!,
        likes: overrides.likes ?? new NoopLikeController(),
        aiReview: overrides.aiReview ?? new NoopAiReviewPoller(),
      },
      toastCenter,
    );
  }
}

/** iOS는 iTunes lookup, Android는 Play 즉시 업데이트(네이티브 모듈을 붙이기 전에는 조회 불가 -> 통과). */
function createUpdateChecker(appInfo: AppInfo, transport: FetchTransport): UpdateChecker {
  if (appInfo.platform === 'android')
    return new PlayUpdateChecker(new UnavailablePlayUpdateClient());
  return new ItunesUpdateChecker({
    transport,
    bundleId: appInfo.bundleId,
    installedVersion: appInfo.version,
    // RN에는 스토어프론트 국가 조회가 없다. null이면 기본 국가(kr)로 조회한다.
    storefrontCountry: async () => null,
  });
}

function storeUrlFor(appInfo: AppInfo): string | null {
  if (appInfo.platform === 'android') {
    return appInfo.bundleId ? `market://details?id=${appInfo.bundleId}` : null;
  }
  return appInfo.appStoreId ? `itms-apps://itunes.apple.com/app/id${appInfo.appStoreId}` : null;
}
