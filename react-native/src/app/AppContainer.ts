import { createNavigationContainerRef } from '@react-navigation/native';
import { getRandomBytes } from 'expo-crypto';

import type { AnalyticsBackend } from '../core/analytics/AnalyticsBackend';
import { createAnalyticsTracker } from '../core/analytics/createAnalyticsTracker';
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
import { DevicePushRegistrar } from '../core/push/DevicePushRegistrar';
import { AsyncStoragePushPromptFlagStore } from '../core/push/expo/AsyncStoragePushPromptFlagStore';
import { ExpoNotificationResponseSource } from '../core/push/expo/ExpoNotificationResponseSource';
import { ExpoPushMessageSource } from '../core/push/expo/ExpoPushMessageSource';
import { ExpoPushNotificationPresenter } from '../core/push/expo/ExpoPushNotificationPresenter';
import { ExpoPushPermissionGateway } from '../core/push/expo/ExpoPushPermissionGateway';
import { ExpoPushTokenProvider } from '../core/push/expo/ExpoPushTokenProvider';
import type { NotificationResponseSource } from '../core/push/NotificationResponseSource';
import type { PushMessageSource } from '../core/push/PushMessageSource';
import type { PushNotificationPresenter } from '../core/push/PushNotificationPresenter';
import type { PushPermissionGateway } from '../core/push/PushPermissionGateway';
import type { PushPromptFlagStore } from '../core/push/PushPromptFlagStore';
import type { PushRegistrar } from '../core/push/PushRegistrar';
import type { PushTokenProvider } from '../core/push/PushTokenProvider';
import type { UserDataCache } from '../core/push/UserDataCache';
import { UserDataCacheRegistry } from '../core/push/UserDataCacheRegistry';
import { AppInfoVersionProvider } from '../core/config/AppVersionProvider';
import { NotificationSettingsRepository } from '../data/settings/NotificationSettingsRepository';
import { FeedbackRepository } from '../data/feedback/FeedbackRepository';
import { AccountActionsViewModel } from '../features/auth/AccountActionsViewModel';
import type { FeedbackNavigator } from '../features/feedback/FeedbackNavigator';
import { FeedbackViewModel } from '../features/feedback/FeedbackViewModel';
import { SettingsViewModel } from '../features/settings/SettingsViewModel';
import { SettingsViewModelOwner } from '../features/settings/SettingsViewModelOwner';
import { SignatureCardViewModel } from '../features/signature/SignatureCardViewModel';
import { NavigationSettingsNavigator } from './NavigationSettingsNavigator';
import { ToastCenter } from '../core/toast/ToastCenter';
import type { ToastPresenter } from '../core/toast/ToastPresenter';
import { AuthRepository, type PendingSignUp } from '../data/auth/AuthRepository';
import { SignUpRepository } from '../data/auth/SignUpRepository';
import { SignatureRepository } from '../data/signature/SignatureRepository';
import { SignUpFlowOwner } from '../features/onboarding/SignUpFlowOwner';
import { SignUpFlowViewModel } from '../features/onboarding/SignUpFlowViewModel';
import { SIGNATURE_CANVAS } from '../features/signature/SignatureCanvas';
import { SignatureEncoder } from '../features/signature/SignatureEncoder';
import { SignatureFlowViewModel } from '../features/signature/SignatureFlowViewModel';
import type { SignatureRasterizer } from '../features/signature/SignatureRasterizer';
import {
  SignatureChangeSubmitter,
  SignUpSubmitter,
} from '../features/signature/SignatureSubmitter';
import { SoftwareSignatureRasterizer } from '../features/signature/SoftwareSignatureRasterizer';
import type { Sleeper } from '../core/http/Sleeper';
import { BannerRepository } from '../data/banner/BannerRepository';
import { NotificationRepository } from '../data/notification/NotificationRepository';
import { LikeRepository } from '../data/like/LikeRepository';
import { PostRepository } from '../data/post/PostRepository';
import { RecordRepository } from '../data/record/RecordRepository';
import { TopicRepository } from '../data/topic/TopicRepository';
import type { AiReviewPoller } from '../features/ai-review/AiReviewPoller';
import { AiReviewRepository } from '../data/ai-review/AiReviewRepository';
import { AiReviewViewModel, type AiReviewTarget } from '../features/ai-review/AiReviewViewModel';
import { DefaultAiReviewPoller } from '../features/ai-review/DefaultAiReviewPoller';
import type { AiReviewSession } from '../features/ai-review/AiReviewSession';
import type { MainMode } from '../features/auth/AuthFlowNavigator';
import { BannerFeedViewModel } from '../features/banner/BannerFeedViewModel';
import { IssueWebViewModel } from '../features/banner/IssueWebViewModel';
import { HomeViewModel } from '../features/home/HomeViewModel';
import { HomeViewModelOwner } from '../features/home/HomeViewModelOwner';
import { DisplayViewModel } from '../features/display/DisplayViewModel';
import { DisplayViewModelOwner } from '../features/display/DisplayViewModelOwner';
import type { CalendarImageRenderer, CalendarImageSaver } from '../features/record/CalendarImage';
import { MediaLibraryCalendarImageSaver } from '../features/record/MediaLibraryCalendarImageSaver';
import { RecordViewModel } from '../features/record/RecordViewModel';
import { RecordViewModelOwner } from '../features/record/RecordViewModelOwner';
import { ViewShotCalendarImageRenderer } from '../features/record/ViewShotCalendarImageRenderer';
import type { FeedNavigator } from '../features/feed/FeedNavigator';
import type { FeedTarget } from '../features/feed/FeedTarget';
import { FeedViewModel } from '../features/feed/FeedViewModel';
import { DefaultLikeController } from '../features/like/DefaultLikeController';
import type { LikeController } from '../features/like/LikeController';
import { DefaultPostChanges } from '../features/post/PostChanges';
import { NavigationDisplayNavigator } from './NavigationDisplayNavigator';
import { PostCreationRepository } from '../data/post/PostCreationRepository';
import { PhotoEditViewModel } from '../features/photo-edit/PhotoEditViewModel';
import { createDefaultMediaServices } from '../features/upload/createDefaultMediaServices';
import { DefaultPostCreationNotifier } from '../features/upload/DefaultPostCreationNotifier';
import type { MediaServices } from '../features/upload/MediaServices';
import { PhotoUploadViewModel } from '../features/upload/PhotoUploadViewModel';
import { PostImageEncoder } from '../features/upload/PostImageEncoder';
import { UploadEntryGateOwner } from '../features/upload/UploadEntryGateOwner';
import { UploadEntryGateViewModel } from '../features/upload/UploadEntryGateViewModel';
import { UploadPreparation } from '../features/upload/UploadPreparation';
import { UploadSubmitter } from '../features/upload/UploadSubmitter';
import { UploadSuccessViewModel } from '../features/upload/UploadSuccessViewModel';
import type { UploadSuccessParams } from '../features/upload/UploadNavigator';
import { NavigationUploadNavigator } from './NavigationUploadNavigator';
import { NavigationHomeNavigator } from './NavigationHomeNavigator';
import { NavigationNotificationNavigator } from './NavigationNotificationNavigator';
import { NavigationPushTapBlocker } from './NavigationPushTapBlocker';
import { NotificationDetailViewModel } from '../features/notification/NotificationDetailViewModel';
import { NotificationEvents } from '../features/notification/NotificationEvents';
import { NotificationInboxViewModel } from '../features/notification/NotificationInboxViewModel';
import { NotificationTapProcessor } from '../features/notification/NotificationTapProcessor';
import { AsyncStoragePendingPushStore } from '../features/push/AsyncStoragePendingPushStore';
import { ForegroundPushHandler } from '../features/push/ForegroundPushHandler';
import type { PendingPushStore } from '../features/push/PendingPushStore';
import { PushPermissionCoordinator } from '../features/push/PushPermissionCoordinator';
import { PushFeature } from '../features/push/PushFeature';
import { PushTapRouter } from '../features/push/PushTapRouter';
import type { PushTapBlocker } from '../features/push/PushTapBlocker';
import { NavigationRecordNavigator } from './NavigationRecordNavigator';
import { TabReturnHint } from './TabReturnHint';
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
import type { KstDate } from '../core/time/KstDate';
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
  readonly sleeper: Sleeper;
  /** 사인 PNG를 만드는 래스터라이저. 기본은 순수 TS 구현(다섯 플랫폼이 같은 알고리즘). */
  readonly signatureRasterizer: SignatureRasterizer;
  /** 기본은 화면 위에 그리는 ToastCenter(`container.toastCenter`). 테스트는 Fake를 넣는다. */
  readonly toast: ToastPresenter;
  /** 없으면 컨테이너가 실제 구현(DefaultLikeController)을 만든다. 테스트는 Fake를 넣는다. 어느 쪽이든 clearAll이 있으면 로그아웃 때 비우는 캐시에 올린다. */
  readonly likes?: LikeController;
  /** 없으면 실제 폴러(DefaultAiReviewPoller)를 만든다. 테스트는 Fake를 넣는다. */
  readonly aiReview?: AiReviewPoller;
  /** 알약·카드·시트까지 그리는 폴러(화면용 면 포함). 주면 aiReview도 이것이 된다. 둘 다 없으면 실제 폴러를 만든다. */
  readonly aiReviewSession?: AiReviewSession;
  /** 기록 탭의 달력 이미지 렌더러·저장소. 없으면 컨테이너가 기본 구현을 쓴다(기록 PR). */
  readonly calendarImageRenderer?: CalendarImageRenderer;
  readonly calendarImageSaver?: CalendarImageSaver;
  /** 로그아웃·탈퇴·계정 전환 때 비울 사용자별 캐시. 캐시를 가진 기능 PR이 추가한다. */
  readonly userDataCaches: readonly UserDataCache[];
  /**
   * 업로드·편집의 네이티브 경계(사진 선택기, 이미지 엔진, 갤러리 저장, 파일). 없으면 컨테이너가 실제 구현
   * (expo-image-picker, expo-image-manipulator, expo-media-library, expo-file-system)을 만든다. 테스트는 Fake를 넣는다.
   */
  readonly media?: MediaServices;
  /** 푸시의 네이티브 경계. 없으면 expo-notifications 어댑터를 쓴다(테스트는 Fake를 넣는다). */
  readonly push: PushPorts;
}

/** 푸시의 네이티브 경계 묶음(기기 등록용 토큰 공급자는 레지스트라가 이미 가진다). */
type PushPorts = {
  readonly permission: PushPermissionGateway;
  readonly responses: NotificationResponseSource;
  readonly messages: PushMessageSource;
  readonly presenter: PushNotificationPresenter;
  readonly promptFlags: PushPromptFlagStore;
  readonly pendingStore: PendingPushStore;
  /** 없으면 내비게이션의 현재 화면(업로드)으로 판단한다. */
  readonly tapBlocker?: PushTapBlocker;
};

/** 테스트가 일부만 바꿀 수 있는 의존성. 푸시 포트는 필요한 것만 `push`에 넣고 토큰 공급자는 `pushTokens`다. */
export type ContainerOverrides = Partial<Omit<Dependencies, 'push'>> & {
  /** 분석 백엔드(Firebase 설정이 있을 때만). 없으면 로그 출력 tracker다(`analytics`를 직접 주면 그것이 우선). */
  analyticsBackend?: AnalyticsBackend | null;
  push?: Partial<PushPorts>;
  pushTokens?: PushTokenProvider;
};

function isUserDataCache(value: object): value is UserDataCache {
  return typeof (value as Partial<UserDataCache>).clearAll === 'function';
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
  /** 메인에 있는 동안 전시 ViewModel을 만들고 버린다. 전시 탭 화면은 이것을 구독해 받는다. */
  readonly displayOwner: DisplayViewModelOwner;
  /** 메인에 있는 동안 기록 ViewModel을 만들고 버린다. 기록 탭 화면은 이것을 구독해 받는다. */
  readonly recordOwner: RecordViewModelOwner;
  /** 메인에 있는 동안 설정 ViewModel을 만들고 버린다. 설정 탭 화면은 이것을 구독해 받는다. */
  readonly settingsOwner: SettingsViewModelOwner;
  /**
   * 기본 렌더러(view-shot)를 쓸 때만 있다. 기록 화면에 마운트하는 캡처 호스트가 이것으로 달력 뷰를 그려 캡처한다.
   * 테스트가 Fake 렌더러를 넣으면 null이라 호스트를 마운트하지 않는다.
   */
  readonly calendarCapture: ViewShotCalendarImageRenderer | null;
  /** 전시·홈·피드가 같이 쓰는 좋아요 저장소(D-04). 기본은 실제 컨트롤러다. */
  readonly likes: LikeController;
  /** 홈과 상세가 함께 쓰는 AI 피드백 폴러(앱에 하나). */
  readonly aiReview: AiReviewPoller;
  /** 알약·카드·시트를 그릴 수 있는 폴러. `aiReview`만 주입한 테스트에서는 null이라 AI 영역을 그리지 않는다. */
  readonly aiReviewSession: AiReviewSession | null;
  /** 상세에서 일어난 제목 수정·삭제를 전시 등이 따라 반영하게 하는 채널. 계정 전환 때 비운다. */
  readonly postChanges = new DefaultPostChanges();
  /** 게시물이 만들어졌음을 홈(히어로 갱신) 등에 알린다. 표시 PR의 PostChanges와 의미가 달라 별도 채널이다. */
  readonly postCreationNotifier = new DefaultPostCreationNotifier();
  /** 업로드 진입 게이트(하단 + 버튼, 홈 히어로 버튼)의 소유자. 확인 중 표시(upload-entry.loading)는 이것을 구독한다. */
  readonly uploadGateOwner: UploadEntryGateOwner;
  /** phase가 login인 동안 로그인 ViewModel을 만들고 버린다. 화면은 이것을 구독해 받는다. */
  readonly loginOwner: LoginViewModelOwner;
  /** phase가 sign-up인 동안 가입 흐름(약관 -> 사인 -> 미리보기) ViewModel을 만들고 버린다. */
  readonly signUpFlowOwner: SignUpFlowOwner;
  readonly signatureRepository: SignatureRepository;
  private readonly signUpRepository: SignUpRepository;
  private readonly linkOpener: ExternalLinkOpener;
  private readonly sleeper: Sleeper;
  private readonly signatureRasterizer: SignatureRasterizer;
  private readonly socialLoginClient: SocialLoginClient;
  private readonly nonceGenerator: NonceGenerator;
  private readonly pushRegistrar: PushRegistrar;
  private readonly dependencies: Dependencies;
  /** 홈 히어로 버튼은 업로드 화면으로 곧바로 가지 않고 하단 + 버튼과 같은 게이트를 누른다. */
  private readonly homeNavigator = new NavigationHomeNavigator(this.navigationHandle, {
    open: () => this.uploadGateOwner.press(),
  });
  private readonly uploadNavigator = new NavigationUploadNavigator(this.navigationHandle);
  private mediaServices: MediaServices | null;
  /** 홈·업로드·피드 등이 함께 쓰는 저장소(요청 경로가 같아 하나만 만든다). */
  private postRepositoryInstance: PostRepository | null = null;
  private topicRepositoryInstance: TopicRepository | null = null;
  private readonly displayNavigator = new NavigationDisplayNavigator(this.navigationHandle);
  /** 기록에서 연 전시 탭이 뒤로 가기에서 기록으로 돌아오게 하는 힌트(MainTabs의 전시 탭이 읽는다). */
  readonly tabReturnHint = new TabReturnHint();
  private readonly recordNavigator = new NavigationRecordNavigator(
    this.navigationHandle,
    this.tabReturnHint,
  );
  private readonly settingsNavigator = new NavigationSettingsNavigator(this.navigationHandle);
  private readonly calendarImageRenderer: CalendarImageRenderer;
  private readonly calendarImageSaver: CalendarImageSaver;
  private readonly cacheRegistry = new UserDataCacheRegistry();
  /** 알림 읽음·소멸을 알림함 화면에 전한다. */
  readonly notificationEvents = new NotificationEvents();
  private readonly notificationNavigator = new NavigationNotificationNavigator(
    this.navigationHandle,
  );
  private readonly notificationProcessor: NotificationTapProcessor;
  private readonly navigationBlocker = new NavigationPushTapBlocker(this.navigationHandle);
  private readonly pushFeature: PushFeature;

  private constructor(dependencies: Dependencies, toastCenter: ToastCenter | null) {
    this.dependencies = dependencies;
    this.toast = dependencies.toast;
    this.toastCenter = toastCenter;
    this.linkOpener = dependencies.linkOpener;
    this.sleeper = dependencies.sleeper;
    this.signatureRasterizer = dependencies.signatureRasterizer;
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
    this.notificationProcessor = new NotificationTapProcessor({
      notifications: new NotificationRepository({ api: this.api }),
      navigator: this.notificationNavigator,
      home: () => this.homeOwner.getSnapshot().viewModel,
      events: this.notificationEvents,
      sessionStore: this.sessionStore,
      toast: this.toast,
      authFlow: this.bootViewModel,
    });
    this.pushFeature = this.createPushFeature();
    this.updateDialogViewModel = new UpdateDialogViewModel(dependencies.storeOpener);
    this.loginOwner = new LoginViewModelOwner(this.bootViewModel, () =>
      this.createLoginViewModel(),
    );
    this.mediaServices = dependencies.media ?? null;
    this.likes = dependencies.likes ?? this.createDefaultLikes();
    if (dependencies.likes && isUserDataCache(dependencies.likes)) {
      this.cacheRegistry.register(dependencies.likes);
    }
    const injectedAiReview = dependencies.aiReviewSession ?? dependencies.aiReview;
    if (injectedAiReview) {
      this.aiReview = injectedAiReview;
      this.aiReviewSession = dependencies.aiReviewSession ?? null;
      if (isUserDataCache(injectedAiReview)) this.cacheRegistry.register(injectedAiReview);
    } else {
      const poller = this.createDefaultAiReview();
      this.aiReview = poller;
      this.aiReviewSession = poller;
    }
    this.cacheRegistry.register(this.postChanges);
    this.signatureRepository = new SignatureRepository({ api: this.api });
    this.signUpRepository = new SignUpRepository({
      api: this.api,
      authRepository: this.authRepository,
    });
    this.signUpFlowOwner = new SignUpFlowOwner(this.bootViewModel, (pending) =>
      this.createSignUpFlow(pending),
    );
    this.homeOwner = new HomeViewModelOwner({
      boot: this.bootViewModel,
      create: (mode) => this.createHomeViewModel(mode),
      registerCache: (cache) => this.cacheRegistry.register(cache),
    });
    this.displayOwner = new DisplayViewModelOwner({
      boot: this.bootViewModel,
      create: (mode) => this.createDisplayViewModel(mode),
      registerCache: (cache) => this.cacheRegistry.register(cache),
    });
    this.uploadGateOwner = new UploadEntryGateOwner({
      boot: this.bootViewModel,
      create: (mode) => this.createUploadGate(mode),
    });
    // 업로드가 끝나면 홈이 히어로(작성 상태)와 이번 주 기록을 다시 불러온다.
    this.postCreationNotifier.subscribe(() => {
      void this.homeOwner.getSnapshot().viewModel?.refresh();
    });
    const calendarImage = resolveCalendarImageRenderer(dependencies.calendarImageRenderer);
    this.calendarCapture = calendarImage.capture;
    this.calendarImageRenderer = calendarImage.renderer;
    this.calendarImageSaver =
      dependencies.calendarImageSaver ?? new MediaLibraryCalendarImageSaver();
    this.recordOwner = new RecordViewModelOwner({
      boot: this.bootViewModel,
      create: (mode) => this.createRecordViewModel(mode),
      registerCache: (cache) => this.cacheRegistry.register(cache),
    });
    this.settingsOwner = new SettingsViewModelOwner({
      boot: this.bootViewModel,
      create: (mode) => this.createSettingsViewModel(mode),
      registerCache: (cache) => this.cacheRegistry.register(cache),
    });
  }

  private get postRepository(): PostRepository {
    return (this.postRepositoryInstance ??= new PostRepository({ api: this.api }));
  }

  private get topicRepository(): TopicRepository {
    return (this.topicRepositoryInstance ??= new TopicRepository({ api: this.api }));
  }

  /** 네이티브 경계. 처음 필요할 때 실제 구현을 만든다(Fake를 넣은 테스트는 만들지 않는다). */
  get media(): MediaServices {
    this.mediaServices ??= createDefaultMediaServices(this.dependencies.appInfo.platform);
    return this.mediaServices;
  }

  /** 소유자(uploadGateOwner)만 부른다. */
  private createUploadGate(mode: MainMode): UploadEntryGateViewModel {
    return new UploadEntryGateViewModel({
      mode,
      posts: this.postRepository,
      toast: this.toast,
      authFlow: this.bootViewModel,
      navigator: this.uploadNavigator,
      analytics: this.analytics,
    });
  }

  /** 업로드 라우트(내비게이션)만 부른다. 화면을 열 때마다 만들고 닫을 때 dispose한다(진행 중 작업과 임시 파일 정리). */
  createPhotoUploadViewModel(topicDate: KstDate): PhotoUploadViewModel {
    const { api, media } = this;
    const repository = new PostCreationRepository({ api });
    const preparation = new UploadPreparation({
      repository,
      encoder: new PostImageEncoder({ engine: media.engine, files: media.files }),
      files: media.files,
      monotonic: media.monotonic,
    });
    return new PhotoUploadViewModel({
      entry: { topicDate },
      clock: this.clock,
      platform: media.platform,
      topics: this.topicRepository,
      picker: media.picker,
      gallery: media.gallery,
      permissions: media.permissions,
      engine: media.engine,
      preparation,
      submitter: new UploadSubmitter({
        repository,
        posts: this.postRepository,
        preparation,
      }),
      createEditor: (request) =>
        new PhotoEditViewModel({ engine: media.engine, files: media.files, ...request }),
      toast: this.toast,
      analytics: this.analytics,
      navigator: this.uploadNavigator,
      notifier: this.postCreationNotifier,
      authFlow: this.bootViewModel,
    });
  }

  /** 성공 라우트(내비게이션)만 부른다. */
  createUploadSuccessViewModel(params: UploadSuccessParams): UploadSuccessViewModel {
    return new UploadSuccessViewModel({
      params,
      analytics: this.analytics,
      navigator: this.uploadNavigator,
    });
  }

  /** 소유자(settingsOwner)만 부른다. 사인 카드·계정 동작은 설정 ViewModel이 소유하고 함께 버린다. */
  private createSettingsViewModel(mode: MainMode): SettingsViewModel {
    const toast = this.toast;
    return new SettingsViewModel({
      mode,
      settings: new NotificationSettingsRepository({ api: this.api }),
      signatureCard: new SignatureCardViewModel({
        repository: this.signatureRepository,
        toast,
        navigator: this.settingsNavigator,
        authFlow: this.bootViewModel,
      }),
      account: new AccountActionsViewModel({
        authRepository: this.authRepository,
        navigator: this.bootViewModel,
        toast,
      }),
      permission: this.dependencies.push.permission,
      visibility: this.dependencies.visibility,
      appVersion: new AppInfoVersionProvider(this.dependencies.appInfo),
      analytics: this.analytics,
      linkOpener: this.linkOpener,
      toast,
      navigator: this.settingsNavigator,
      authFlow: this.bootViewModel,
    });
  }

  /**
   * 피드백 라우트만 부른다(열 때 만들고 닫을 때 dispose). 로그아웃·계정 전환 때 전송 중 요청을 버리도록
   * 캐시 레지스트리에 올리고, dispose하면 해제한다.
   */
  createFeedbackViewModel(navigator: FeedbackNavigator): FeedbackViewModel {
    let unregister: (() => void) | null = null;
    const viewModel = new FeedbackViewModel({
      repository: new FeedbackRepository({ api: this.api }),
      analytics: this.analytics,
      toast: this.toast,
      navigator,
      authFlow: this.bootViewModel,
      onDisposed: () => unregister?.(),
    });
    unregister = this.cacheRegistry.register(viewModel);
    return viewModel;
  }

  /** 소유자(recordOwner)만 부른다. */
  private createRecordViewModel(mode: MainMode): RecordViewModel {
    return new RecordViewModel({
      mode,
      clock: this.clock,
      records: new RecordRepository({ api: this.api }),
      changes: this.postChanges,
      navigator: this.recordNavigator,
      toast: this.toast,
      authFlow: this.bootViewModel,
      visibility: this.dependencies.visibility,
      imageRenderer: this.calendarImageRenderer,
      imageSaver: this.calendarImageSaver,
    });
  }

  /** 실제 좋아요 컨트롤러. 로그아웃·계정 전환 때 진행 중 요청과 값을 버리도록 캐시 레지스트리에 올린다. */
  private createDefaultLikes(): DefaultLikeController {
    const likes = new DefaultLikeController({
      api: new LikeRepository({ api: this.api }),
      toast: this.toast,
      authFlow: this.bootViewModel,
    });
    this.cacheRegistry.register(likes);
    return likes;
  }

  /** 실제 AI 피드백 폴러. 로그아웃·계정 전환 때 폴링과 값을 버리도록 캐시 레지스트리에 올린다. */
  private createDefaultAiReview(): DefaultAiReviewPoller {
    const poller = new DefaultAiReviewPoller({
      reviews: new AiReviewRepository({ api: this.api }),
      clock: this.clock,
      sleeper: this.dependencies.sleeper,
      session: this.sessionStore,
      toast: this.toast,
      authFlow: this.bootViewModel,
    });
    this.cacheRegistry.register(poller);
    return poller;
  }

  /**
   * AI 피드백 알약(상세)·카드(홈) ViewModel. 화면을 그리는 소유자(React 컴포넌트)만 부르고 버릴 때 dispose한다.
   * 화면용 폴러(aiReviewSession)가 없으면 호출하지 않는다.
   */
  createAiReviewViewModel(params: {
    target: AiReviewTarget;
    surface: 'feed' | 'home';
    entry?: 'normal' | 'push';
  }): AiReviewViewModel {
    const poller = this.aiReviewSession;
    if (!poller) throw new Error('AI 피드백 화면용 폴러가 주입되지 않았습니다');
    return new AiReviewViewModel({
      target: params.target,
      mode: 'member',
      surface: params.surface,
      entry: params.entry ?? 'normal',
      clock: this.clock,
      poller,
      visibility: this.dependencies.visibility,
    });
  }

  /** 소유자(displayOwner)만 부른다. */
  private createDisplayViewModel(mode: MainMode): DisplayViewModel {
    const { clock } = this;
    return new DisplayViewModel({
      mode,
      clock,
      topics: this.topicRepository,
      posts: this.postRepository,
      likes: this.likes,
      changes: this.postChanges,
      navigator: this.displayNavigator,
      toast: this.toast,
      authFlow: this.bootViewModel,
    });
  }

  /** 상세 라우트(내비게이션)만 부른다. 게시물 하나를 열 때마다 만들고 닫을 때 dispose한다. */
  createFeedViewModel(target: FeedTarget, userId: string, navigator: FeedNavigator): FeedViewModel {
    return new FeedViewModel({
      target,
      userId,
      clock: this.clock,
      posts: this.postRepository,
      likes: this.likes,
      changes: this.postChanges,
      navigator,
      toast: this.toast,
      authFlow: this.bootViewModel,
    });
  }

  /** 소유자(signUpFlowOwner)만 부른다. 가입이 끝나거나 버려지면 소유자가 dispose한다. */
  private createSignUpFlow(pending: PendingSignUp): SignUpFlowViewModel {
    return new SignUpFlowViewModel({
      pending,
      analytics: this.analytics,
      authNavigator: this.bootViewModel,
      pushRegistrar: this.pushRegistrar,
      linkOpener: this.linkOpener,
      createSignatureFlow: (host) =>
        new SignatureFlowViewModel({
          mode: 'onboarding',
          canvas: SIGNATURE_CANVAS,
          encoder: new SignatureEncoder(this.signatureRasterizer),
          submitter: new SignUpSubmitter({
            signUpRepository: this.signUpRepository,
            authRepository: this.authRepository,
            pending,
            sleeper: this.sleeper,
          }),
          analytics: this.analytics,
          toast: this.toast,
          authNavigator: this.bootViewModel,
          onCompleted: host.onCompleted,
          onExit: host.onExit,
        }),
    });
  }

  /**
   * 설정의 사인 변경 흐름(change 모드)을 만든다. 호출자(설정 화면의 내비게이션)가 소유하고 버린다.
   * 완료 시 호출자가 스택을 닫고 SignatureCardViewModel.refresh()를 부른다.
   */
  createSignatureChangeFlow(host: {
    onCompleted: () => void;
    onExit: () => void;
  }): SignatureFlowViewModel {
    return new SignatureFlowViewModel({
      mode: 'change',
      canvas: SIGNATURE_CANVAS,
      encoder: new SignatureEncoder(this.signatureRasterizer),
      submitter: new SignatureChangeSubmitter(this.signatureRepository),
      analytics: this.analytics,
      toast: this.toast,
      authNavigator: this.bootViewModel,
      onCompleted: host.onCompleted,
      onExit: host.onExit,
    });
  }

  /** 소유자(homeOwner)만 부른다. */
  private createHomeViewModel(mode: MainMode): HomeViewModel {
    const { api, clock } = this;
    const { aiReview } = this;
    const { visibility } = this.dependencies;
    const { likes } = this;
    return new HomeViewModel({
      mode,
      clock,
      topics: this.topicRepository,
      posts: this.postRepository,
      notifications: new NotificationRepository({ api }),
      // ISSUE 목록 ViewModel은 홈이 소유한다(홈이 로드·정리·dispose를 시키고 HomeScreen은 홈을 통해서만 받는다).
      bannerFeed: new BannerFeedViewModel({ repository: new BannerRepository({ api }) }),
      likes,
      changes: this.postChanges,
      aiReview,
      visibility,
      navigator: this.homeNavigator,
      toast: this.toast,
      authFlow: this.bootViewModel,
    });
  }

  /** 알림함 라우트(내비게이션)만 부른다. 화면을 열 때마다 만들고 닫을 때 dispose한다. */
  createNotificationInboxViewModel(): NotificationInboxViewModel {
    return new NotificationInboxViewModel({
      notifications: new NotificationRepository({ api: this.api }),
      processor: this.notificationProcessor,
      events: this.notificationEvents,
      toast: this.toast,
      authFlow: this.bootViewModel,
      analytics: this.analytics,
    });
  }

  /** 알림 상세 라우트(내비게이션)만 부른다. */
  createNotificationDetailViewModel(
    notificationId: string,
    navigator: { close(): void },
  ): NotificationDetailViewModel {
    return new NotificationDetailViewModel({
      notificationId,
      notifications: new NotificationRepository({ api: this.api }),
      events: this.notificationEvents,
      home: () => this.homeOwner.getSnapshot().viewModel,
      toast: this.toast,
      authFlow: this.bootViewModel,
      analytics: this.analytics,
      navigator: {
        close: () => navigator.close(),
        openInbox: () => this.notificationNavigator.openInbox(),
      },
    });
  }

  /**
   * 푸시 수신 기능을 시작한다(기기 등록 트리거, 권한 요청, 탭 라우팅, 포그라운드 표시). 반환 함수로 해제한다.
   * 앱 루트의 효과(effect)가 부른다. 기능 객체는 컨테이너당 하나라 StrictMode의 start -> stop -> start에서도
   * 콜드 스타트 탭을 한 번만 소비한다.
   */
  startPush(): () => void {
    return this.pushFeature.start();
  }

  /** NavigationContainer의 onReady: 준비 전에 보류된 푸시 탭을 다시 처리하게 한다. */
  readonly onNavigationReady = (): void => this.navigationBlocker.notifyReady();

  private createPushFeature(): PushFeature {
    const p = this.dependencies.push;
    const home = () => this.homeOwner.getSnapshot().viewModel;
    return new PushFeature([
      { start: () => this.pushRegistrar.start?.() },
      new PushPermissionCoordinator({
        boot: this.bootViewModel,
        gateway: p.permission,
        flags: p.promptFlags,
        toast: this.toast,
      }),
      new ForegroundPushHandler({
        messages: p.messages,
        permission: p.permission,
        presenter: p.presenter,
        home,
      }),
      new PushTapRouter({
        responses: p.responses,
        boot: this.bootViewModel,
        sessionStore: this.sessionStore,
        blocker: p.tapBlocker ?? this.navigationBlocker,
        store: p.pendingStore,
        processor: this.notificationProcessor,
      }),
    ]);
  }

  /** 웹뷰 라우트(내비게이션)만 부른다. */
  createIssueWebViewModel(url: string): IssueWebViewModel {
    return new IssueWebViewModel({
      url,
      analytics: this.analytics,
      toast: this.toast,
      linkOpener: this.linkOpener,
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
  static create(config: AppConfig, overrides: ContainerOverrides = {}): AppContainer {
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
    const sleeper = overrides.sleeper ?? new SystemSleeper();
    const api =
      overrides.api ??
      new ApiClient({
        baseUrl: config.apiBaseUrl,
        transport,
        sessionStore,
        tokenRefresher,
        events,
        sleeper,
        clock,
        logger,
      });
    const o = overrides.push ?? {};
    const pushTokens = overrides.pushTokens ?? new ExpoPushTokenProvider();
    const featureFlags = overrides.featureFlags ?? readFeatureFlags(undefined);
    const appInfo = overrides.appInfo ?? DEFAULT_APP_INFO;
    const visibility = overrides.visibility ?? new ReactNativeAppVisibility();
    const pushRegistrar =
      overrides.pushRegistrar ??
      new DevicePushRegistrar({
        api,
        sessionStore,
        tokenRefresher,
        tokens: pushTokens,
        visibility,
        logger,
      });
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
        analytics:
          overrides.analytics ?? createAnalyticsTracker(overrides.analyticsBackend ?? null),
        socialLoginClient:
          overrides.socialLoginClient ??
          selectSocialLoginClient(featureFlags, new KakaoSocialLoginClient(new SeoulKakaoSdk())),
        nonceGenerator: overrides.nonceGenerator ?? new SecureNonceGenerator(getRandomBytes),
        pushRegistrar,
        push: {
          permission: o.permission ?? new ExpoPushPermissionGateway(),
          responses: o.responses ?? new ExpoNotificationResponseSource(),
          messages: o.messages ?? new ExpoPushMessageSource(),
          presenter: o.presenter ?? new ExpoPushNotificationPresenter(),
          promptFlags: o.promptFlags ?? new AsyncStoragePushPromptFlagStore(),
          pendingStore: o.pendingStore ?? new AsyncStoragePendingPushStore(),
          tapBlocker: o.tapBlocker,
        },
        homePreloader: overrides.homePreloader ?? new NoopHomePreloader(),
        updateChecker: overrides.updateChecker ?? createUpdateChecker(appInfo, transport),
        storeOpener: overrides.storeOpener ?? new LinkingStoreOpener(storeUrlFor(appInfo)),
        userDataCaches: overrides.userDataCaches ?? [],
        visibility,
        linkOpener: overrides.linkOpener ?? new LinkingExternalLinkOpener(),
        toast: overrides.toast ?? toastCenter!,
        sleeper,
        signatureRasterizer: overrides.signatureRasterizer ?? new SoftwareSignatureRasterizer(),
        likes: overrides.likes,
        media: overrides.media,
        calendarImageRenderer: overrides.calendarImageRenderer,
        calendarImageSaver: overrides.calendarImageSaver,
        aiReview: overrides.aiReview,
        aiReviewSession: overrides.aiReviewSession,
      },
      toastCenter,
    );
  }
}

/**
 * 주입된 렌더러가 있으면 그것을(캡처 호스트 없음), 없으면 view-shot 렌더러를 만들고 호스트가 쓸 수 있게 함께 돌려준다.
 */
function resolveCalendarImageRenderer(injected: CalendarImageRenderer | undefined): {
  renderer: CalendarImageRenderer;
  capture: ViewShotCalendarImageRenderer | null;
} {
  if (injected) return { renderer: injected, capture: null };
  const capture = new ViewShotCalendarImageRenderer();
  return { renderer: capture, capture };
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
