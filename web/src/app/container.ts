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
import { PresignedUploader } from '../core/net/PresignedUploader';
import type { UploadUrlRewriter } from '../core/net/UploadUrlRewriter';
import { ConsoleLogger } from '../core/net/Logger';
import type { Logger } from '../core/net/Logger';
import { HttpTokenRefresher } from '../core/net/TokenRefresher';
import type { TokenRefresher } from '../core/net/TokenRefresher';
import type { Clock } from '../core/time/Clock';
import { SystemClock } from '../core/time/SystemClock';
import { createIntersectionVisibilityObserver } from '../core/ui/VisibilityObserver';
import type { VisibilityObserverFactory } from '../core/ui/VisibilityObserver';
import { ToastController } from '../core/ui/ToastController';
import { AccountService } from '../features/auth/AccountService';
import { AuthApi } from '../features/auth/AuthApi';
import { SignupDraft } from '../features/auth/SignupDraft';
import { createKakaoWebLoginClient } from '../features/auth/createKakaoLogin';
import { LoginViewModel } from '../features/auth/LoginViewModel';
import type { ResumeKakaoRedirect, SocialLoginClient } from '../features/auth/SocialLoginClient';
import { BannerFeed } from '../features/home/BannerFeed';
import { BannerRepository } from '../features/home/BannerRepository';
import { HomeRepository } from '../features/home/HomeRepository';
import { AttachableHomeNavigator } from '../features/home/AttachableHomeNavigator';
import { HomeViewModel } from '../features/home/HomeViewModel';
import { DisplayRepository } from '../features/display/DisplayRepository';
import { DisplayViewModel } from '../features/display/DisplayViewModel';
import { FeedRepository } from '../features/feed/FeedRepository';
import { FeedViewModel } from '../features/feed/FeedViewModel';
import type { FeedNavigator } from '../features/feed/FeedViewModel';
import { LikeRepository } from '../features/like/LikeRepository';
import { PostLikeStore } from '../features/like/PostLikeStore';
import { PostChanges } from '../features/post/PostChanges';
import { AttachablePostNavigator } from '../features/post/postNavigation';
import type { PostSeed } from '../features/post/postModels';
import { ScrollMemory } from '../core/ui/ScrollMemory';
import { WindowExternalLinkOpener } from '../features/onboarding/ExternalLinkOpener';
import type { ExternalLinkOpener } from '../features/onboarding/ExternalLinkOpener';
import { LegalDocumentLauncher } from '../features/onboarding/LegalDocument';
import { SignupRepository } from '../features/onboarding/SignupRepository';
import { SignupService } from '../features/onboarding/SignupService';
import { TermsViewModel } from '../features/onboarding/TermsViewModel';
import { createCanvasSurface } from '../features/signature/CanvasSurface';
import { ObjectUrlFactory } from '../features/signature/BlobUrlFactory';
import type { BlobUrlFactory } from '../features/signature/BlobUrlFactory';
import { ChangeSignatureService } from '../features/signature/ChangeSignatureService';
import { SignatureCardController } from '../features/signature/SignatureCardController';
import { SignatureDraft } from '../features/signature/SignatureDraft';
import { SignatureDrawViewModel } from '../features/signature/SignatureDrawViewModel';
import type { SignatureMode } from '../features/signature/SignatureMode';
import { SignaturePad } from '../features/signature/SignaturePad';
import { SignaturePreviewViewModel } from '../features/signature/SignaturePreviewViewModel';
import { CanvasSignatureRasterizer } from '../features/signature/SignatureRasterizer';
import type { SignatureRasterizer } from '../features/signature/SignatureRasterizer';
import { SignatureRepository } from '../features/signature/SignatureRepository';
import { GuestGate } from '../features/shell/GuestGate';
import { MainShellViewModel } from '../features/shell/MainShellViewModel';
import { NoopUploadEntry } from '../features/shell/UploadEntry';
import type { UploadEntry } from '../features/shell/UploadEntry';
import type { SessionMode } from '../features/boot/authGate';
import { BootViewModel } from '../features/boot/BootViewModel';
import { NoopHomePreloader } from '../features/boot/HomePreloader';
import type { HomePreloader } from '../features/boot/HomePreloader';
import { SIGNATURE_PNG_SIZE } from '../constants';
import { DEV_SESSION_ENABLED } from './devSession';
import { ROUTES } from './paths';

export interface AppEnv {
  VITE_API_BASE_URL?: string;
  VITE_KAKAO_CLIENT_ID?: string;
  VITE_UPLOAD_PROXY?: string;
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
  /** 목록 끝 센티넬이 보이는지 보는 수단. 기본 IntersectionObserver(없는 환경이면 null=자동 다음 페이지 읽기 없음). */
  visibilityObserver?: VisibilityObserverFactory | null;
  /** 업로드 버튼(회원)이 부르는 진입. 기본 NoopUploadEntry. */
  uploadEntry?: UploadEntry;
  /** 약관 문서를 새 탭으로 여는 수단. 기본 WindowExternalLinkOpener. */
  externalLinkOpener?: ExternalLinkOpener;
  /** 사인 PNG 내보내기. 기본 CanvasSignatureRasterizer(canvas). */
  signatureRasterizer?: SignatureRasterizer;
  /** 미리보기 blob URL 생성·해제. 기본 ObjectUrlFactory. */
  blobUrls?: BlobUrlFactory;
  /** presigned PUT 주소 재작성(개발 프록시). 기본 그대로. */
  uploadUrlRewriter?: UploadUrlRewriter;
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
  /** 인증 헤더 없는 presigned PUT(사진·사인). */
  presignedUploader: PresignedUploader;
  externalLinkOpener: ExternalLinkOpener;
  /** 그리기 → 미리보기 사이 PNG(메모리). */
  signatureDraft: SignatureDraft;
  signatureRasterizer: SignatureRasterizer;
  blobUrls: BlobUrlFactory;
  signatureRepository: SignatureRepository;
  /** 설정 사인 카드가 쓸 데이터. 사인 변경 성공 뒤 재조회한다. UserCaches에 등록되어 계정 전환 시 비워진다. */
  signatureCard: SignatureCardController;
  homeRepository: HomeRepository;
  /** 공개 API(/banners). 토큰을 붙이지 않는다. */
  bannerRepository: BannerRepository;
  signupService: SignupService;
  changeSignatureService: ChangeSignatureService;
  displayRepository: DisplayRepository;
  feedRepository: FeedRepository;
  likeRepository: LikeRepository;
  /** 게시물 변경 이벤트 통로(like·title·removed). 계정 전환 때 UserCaches가 삭제 기억을 비운다. */
  postChanges: PostChanges;
  /** 전시·홈 랭킹·상세가 공유하는 좋아요 상태(D-04). 계정 전환 때 UserCaches가 reset한다. */
  likes: PostLikeStore;
  /** 화면별 스크롤 위치(location.key) 기억. 홈·전시가 상세에 갔다 돌아올 때 복원한다. */
  scrollMemory: ScrollMemory;
  /** 개발용 세션 주입 화면(동적 import)이 서비스를 만들 재료. devSessionEnabled가 false면 null. */
  devSessionDeps: { refresher: TokenRefresher; store: SessionStore; userCaches: UserCaches } | null;
  visibilityObserver: VisibilityObserverFactory | null;
  /** 화면이 마운트될 때마다 새 ViewModel을 만든다. 현재 컨테이너 값(this)을 읽는다. */
  createLoginViewModel(): LoginViewModel;
  createBootViewModel(): BootViewModel;
  /** 메인 셸이 마운트될 때마다 새 ViewModel을 만든다. */
  createMainShellViewModel(mode: SessionMode): MainShellViewModel;
  createTermsViewModel(): TermsViewModel;
  /**
   * 홈 ViewModel은 모드별로 하나를 보관한다(REQ-HOME-040: 탭을 오가도 화면을 비우지 않고 다시 보일 때 조용히 갱신).
   * 다른 모드(게스트 ↔ 회원)를 요청하면 이전 것은 dispose한다. 계정 전환·로그아웃 때는 UserCaches가 처음 상태로 돌린다(보이고 있으면 곧바로 재로드).
   * 화면은 navigator.attach로 실제 이동 수단을 꽂고, 보이는 동안 viewModel.onShown/onHidden을 부른다.
   */
  homeSession(mode: SessionMode): { viewModel: HomeViewModel; navigator: AttachableHomeNavigator };
  /**
   * 전시 ViewModel도 모드별로 하나를 보관한다(상세에 갔다 와도 목록·정렬·날짜가 남는다). 다른 모드를 요청하면 이전 것은 dispose한다.
   * 계정 전환·로그아웃 때는 UserCaches가 resetForAccountChange로 처음 상태로 돌린다. 화면은 navigator.attach로 실제 이동 수단을 꽂는다.
   */
  displaySession(mode: SessionMode): { viewModel: DisplayViewModel; navigator: AttachablePostNavigator };
  /** 상세 화면이 마운트될 때마다 새 ViewModel을 만든다. 저장된 userId는 store에서 읽는다. */
  createFeedViewModel(args: { postId: string; seed: PostSeed | null; assumeMine?: boolean; navigator: FeedNavigator }): FeedViewModel;
  /** 빈 패드(1024×512)로 시작한다. */
  createSignatureDrawViewModel(mode: SignatureMode): SignatureDrawViewModel;
  createSignaturePreviewViewModel(mode: SignatureMode, png: Blob): SignaturePreviewViewModel;
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
  const holder: { sync?: CrossTabSessionSync } = {};
  const rawChannel = options.sessionChannel ?? createSessionChannel();
  // store와 crossTabSync가 같은 객체를 쓴다. 이 탭이 보내는 신호는 crossTabSync가 "이 탭이 아는 userId"를 갱신하는 데도 쓴다.
  const sessionChannel: SessionChannel = {
    post: (signal) => {
      holder.sync?.noteLocalUser(signal.userId);
      rawChannel.post(signal);
    },
    subscribe: (listener) => rawChannel.subscribe(listener),
    close: () => rawChannel.close(),
  };
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
  const crossTabSync = new CrossTabSessionSync({
    channel: sessionChannel,
    store,
    userCaches,
    sessionEvents,
    document: globalThis.document,
    window: globalThis.window,
  });
  holder.sync = crossTabSync;
  const presignedUploader = new PresignedUploader({ fetch: fetchImpl, clock, logger, urlRewriter: options.uploadUrlRewriter });
  const signatureRepository = new SignatureRepository({ api });
  const signatureCard = new SignatureCardController({ repository: signatureRepository, toast });
  userCaches.register(signatureCard);
  let homeSession: { mode: SessionMode; viewModel: HomeViewModel; navigator: AttachableHomeNavigator } | null = null;
  userCaches.register({ clear: () => homeSession?.viewModel.resetForAccountChange() });
  const postChanges = new PostChanges();
  const likeRepository = new LikeRepository({ api });
  const likes = new PostLikeStore({ repository: likeRepository, changes: postChanges, toast });
  let displaySession: { mode: SessionMode; viewModel: DisplayViewModel; navigator: AttachablePostNavigator } | null = null;
  userCaches.register({
    clear: () => {
      likes.reset();
      postChanges.reset();
      displaySession?.viewModel.resetForAccountChange();
    },
  });
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
    crossTabSync,
    presignedUploader,
    externalLinkOpener: options.externalLinkOpener ?? new WindowExternalLinkOpener(),
    visibilityObserver: options.visibilityObserver === undefined ? createIntersectionVisibilityObserver() : options.visibilityObserver,
    signatureDraft: new SignatureDraft(),
    signatureRasterizer: options.signatureRasterizer ?? new CanvasSignatureRasterizer({ createSurface: createCanvasSurface }),
    blobUrls: options.blobUrls ?? new ObjectUrlFactory(),
    signatureRepository,
    signatureCard,
    homeRepository: new HomeRepository({ api }),
    displayRepository: new DisplayRepository({ api }),
    feedRepository: new FeedRepository({ api }),
    likeRepository,
    postChanges,
    likes,
    scrollMemory: new ScrollMemory(),
    bannerRepository: new BannerRepository({ api }),
    signupService: new SignupService({
      repository: new SignupRepository({ api, clock }),
      uploader: presignedUploader,
      authApi,
      signupDraft,
      store,
      userCaches,
      clock,
      logger,
    }),
    changeSignatureService: new ChangeSignatureService({ repository: signatureRepository, uploader: presignedUploader, store, logger }),
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
    createMainShellViewModel(mode) {
      return new MainShellViewModel({ mode, guestGate: this.guestGate, analytics: this.analytics, uploadEntry: this.uploadEntry });
    },
    createTermsViewModel() {
      return new TermsViewModel({ launcher: new LegalDocumentLauncher({ opener: this.externalLinkOpener }), signupDraft: this.signupDraft });
    },
    homeSession(mode) {
      if (homeSession?.mode !== mode) {
        homeSession?.viewModel.dispose();
        const navigator = new AttachableHomeNavigator();
        homeSession = {
          mode,
          navigator,
          viewModel: new HomeViewModel({
            mode,
            clock: this.clock,
            repository: this.homeRepository,
            banners: new BannerFeed({ repository: this.bannerRepository }),
            toast: this.toast,
            guestGate: this.guestGate,
            uploadEntry: this.uploadEntry,
            navigator,
            likes: this.likes,
            changes: this.postChanges,
          }),
        };
      }
      return homeSession;
    },
    displaySession(mode) {
      if (displaySession?.mode !== mode) {
        displaySession?.viewModel.dispose();
        const navigator = new AttachablePostNavigator();
        displaySession = {
          mode,
          navigator,
          viewModel: new DisplayViewModel({
            mode,
            clock: this.clock,
            repository: this.displayRepository,
            likes: this.likes,
            changes: this.postChanges,
            toast: this.toast,
            guestGate: this.guestGate,
            navigator,
          }),
        };
      }
      return displaySession;
    },
    createFeedViewModel(args) {
      return new FeedViewModel({
        postId: args.postId,
        seed: args.seed,
        assumeMine: args.assumeMine,
        getUserId: async () => (await this.store.read()).userId,
        clock: this.clock,
        repository: this.feedRepository,
        likes: this.likes,
        changes: this.postChanges,
        toast: this.toast,
        navigator: args.navigator,
      });
    },
    createSignatureDrawViewModel(mode) {
      return new SignatureDrawViewModel({
        mode,
        pad: new SignaturePad({ width: SIGNATURE_PNG_SIZE.width, height: SIGNATURE_PNG_SIZE.height }),
        rasterizer: this.signatureRasterizer,
        draft: this.signatureDraft,
        nextId: () => this.ids.next(),
        logger: this.logger,
      });
    },
    createSignaturePreviewViewModel(mode, png) {
      return new SignaturePreviewViewModel({
        mode,
        png,
        submitter: mode === 'onboarding' ? this.signupService : this.changeSignatureService,
        toast: this.toast,
        refreshSignatureCard: mode === 'change' ? () => this.signatureCard.refresh() : undefined,
      });
    },
    createBootViewModel() {
      return new BootViewModel({ store: this.store, clock: this.clock, preloader: this.preloader, logger: this.logger });
    },
  };
  return container;
}
