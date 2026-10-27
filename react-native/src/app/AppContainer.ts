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
import { NoopPushRegistrar } from '../core/push/NoopPushRegistrar';
import type { PushRegistrar } from '../core/push/PushRegistrar';
import type { UserDataCache } from '../core/push/UserDataCache';
import { AuthRepository } from '../data/auth/AuthRepository';
import { LoginViewModel } from '../features/auth/LoginViewModel';
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
  readonly bootViewModel: BootViewModel;
  readonly updateDialogViewModel: UpdateDialogViewModel;
  private readonly socialLoginClient: SocialLoginClient;
  private readonly nonceGenerator: NonceGenerator;
  private readonly pushRegistrar: PushRegistrar;

  private constructor(dependencies: Dependencies) {
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
      caches: dependencies.userDataCaches,
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
  }

  /** 로그인 화면이 열릴 때마다 새로 만든다(화면이 사라지면 dispose된다). 전환 요청은 BootViewModel로 간다. */
  createLoginViewModel(): LoginViewModel {
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
    return new AppContainer({
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
    });
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
