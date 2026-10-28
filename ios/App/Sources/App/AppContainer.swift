import Foundation
import Observation
import Synchronization
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakFeatures

/// 앱 시작 결과. 설정이 잘못되면 크래시 대신 설정 오류 화면을 보인다.
enum AppBootstrap {
    case ready(AppContainer)
    case misconfigured(String)

    @MainActor
    static func load(bundle: Bundle = .main) -> AppBootstrap {
        do {
            let configuration = try AppConfiguration(bundle: bundle)
            return .ready(try AppContainer(configuration: configuration))
        } catch AppConfiguration.Issue.missingAPIBaseURL {
            return .misconfigured("API_BASE_URL이 설정되지 않았어요.\nConfig/Secrets.xcconfig를 확인해 주세요.")
        } catch ConfigurationError.invalidBaseURL {
            return .misconfigured("API_BASE_URL 값이 올바르지 않아요.\nhttps 서버 주소(origin)인지 확인해 주세요.")
        } catch {
            return .misconfigured("앱 설정을 읽지 못했어요.")
        }
    }
}

/// AuthRefresher는 AppLaunchViewModel보다 먼저 만들어져야 하므로, 이벤트 수신자를 나중에 연결한다.
final class DeferredAuthEvents: AuthEvents {
    private let target = Mutex<(any AuthEvents)?>(nil)

    func bind(_ events: any AuthEvents) {
        target.withLock { $0 = events }
    }

    func reauthenticationRequired() async {
        let events = target.withLock { $0 }
        await events?.reauthenticationRequired()
    }
}

/// 푸시·알림이 만든 "AI 결과 열기" 요청을 게시물 상세가 받을 때까지 보관한다.
/// 메인 셸이 요청을 내주면(`consumeAIResultRequest`) 여기에 넣고, 상세 화면이 AI 대상을 만들 때 한 번만 꺼내 간다.
@MainActor
final class AIResultInbox {
    private var postIds: Set<UUID> = []

    func add(_ postId: UUID) { postIds.insert(postId) }

    /// 그 게시물의 요청이 있으면 지우고 true.
    func take(_ postId: UUID) -> Bool { postIds.remove(postId) != nil }
}

/// 메인 화면 한 세션(접근 모드 하나)에 쓰는 ViewModel 묶음. 로그아웃·계정 전환 때 버리고 새로 만든다.
@MainActor
@Observable
final class MainSession {
    let shell: MainShellViewModel
    let home: HomeViewModel
    let aiResultInbox = AIResultInbox()
    /// 홈 AI 피드백 카드의 ViewModel. 홈 탭을 떠났다 돌아와도 이어 쓴다(완료 결과를 다시 조회하지 않기 위해, REQ-HOME-037).
    private(set) var homeAI: AIReviewViewModel?

    private unowned let container: AppContainer
    /// 전시 탭 ViewModel. 탭을 오갈 때 캐시·정렬을 유지하려고 세션이 쥔다(처음 열 때 만든다).
    @ObservationIgnored private(set) var display: DisplayViewModel?
    /// 전시 ViewModel을 만들 때 시드로 쓴 요청 id(같은 요청을 다시 적용하지 않는다).
    @ObservationIgnored private var displaySeedRequestID: Int?
    /// 기록 탭 ViewModel. 처음 열 때 만든다.
    @ObservationIgnored private(set) var record: RecordViewModel?

    init(shell: MainShellViewModel, home: HomeViewModel, container: AppContainer) {
        self.shell = shell
        self.home = home
        self.container = container
    }

    /// 전시 탭 ViewModel(없으면 만든다). 대기 중인 전시 요청이 있으면 그 날짜·정렬로 시작한다(요청은 `applyPendingDisplayRequest`가 비운다).
    func displayViewModel() -> DisplayViewModel {
        if let display { return display }
        let request = shell.displayRequest
        let viewModel = container.makeDisplayViewModel(initialDate: request?.date, initialSort: request?.sort)
        display = viewModel
        displaySeedRequestID = request?.id
        return viewModel
    }

    /// 기록 탭 ViewModel(없으면 만든다). 탭을 오가도 월 캐시·선택 날짜를 유지하려고 세션이 쥔다.
    func recordViewModel() -> RecordViewModel {
        if let record { return record }
        let viewModel = container.makeRecordViewModel(access: shell.access, navigator: shell)
        record = viewModel
        return viewModel
    }

    /// 전시 요청(홈 "더 보기" 등)을 소비해 이미 만들어진 전시에 적용한다. ViewModel이 요청으로 시작했으면 다시 적용하지 않는다.
    func applyPendingDisplayRequest() async {
        guard let request = shell.consumeDisplayRequest() else { return }
        guard request.id != displaySeedRequestID, let display else { return }
        await display.select(date: request.date)
        await display.selectSort(request.sort)
    }

    /// 홈 카드 대상 게시물이 바뀔 때마다 부른다. 처음이면 만들고, 이후에는 `show`로 대상만 바꾼다.
    func updateHomeAI(postId: UUID?) {
        guard let postId else { return }
        let target = container.homeAITarget(postId: postId)
        if let homeAI {
            homeAI.show(target)
        } else {
            homeAI = container.makeAIReviewViewModel(target: target, surface: .home, opensSheetOnFirstResult: false)
        }
    }
}

/// 구성 루트. 모든 외부 효과(Keychain, 네트워크, 카카오 SDK)를 프로토콜 구현으로 조립한다.
@MainActor
final class AppContainer {
    let launch: AppLaunchViewModel
    let toast: ToastCenter
    let externalOpener = SystemExternalURLOpener()

    private let authRepository: any AuthRepository
    private let socialLogin: any SocialLoginClient
    private let pushRegistration: any PushRegistrationTrigger
    private let screenTracker: ScreenTracker
    private let clock: any AppClock
    private let viewer: any ViewerContext
    private let homeRepositories: HomeRepositories
    private let topicRepository: any TopicRepository
    private let postRepository: any PostRepository
    private let aiReviewRepository: any AIReviewRepository
    private let likeEvents: LikeEventBroadcaster
    private let likeCoordinator: LikeCoordinator
    private let signUpRepository: any SignUpRepository
    private let postChangeLedger: PostChangeLedger
    private let signatureEncoder = CoreGraphicsSignatureEncoder()
    private let postCreationRepository: any PostCreationRepository
    private let recordRepository: any RecordCalendarRepository
    private let photoLibrarySaver = PhotoLibraryImageSaver()
    /// 사진 선택·편집·WebP 준비를 맡는 하나의 처리기. 업로드 화면과 편집기가 같은 원본·미리보기를 본다.
    let photoPipeline = PhotoPipeline()

    init(configuration: AppConfiguration) throws {
        #if DEBUG
        let allowInsecureLoopback = true
        #else
        let allowInsecureLoopback = false
        #endif
        let apiConfiguration = try APIConfiguration(serverOrigin: configuration.apiBaseURL, allowInsecureLoopback: allowInsecureLoopback)

        let clock = SystemClock()
        let transport = URLSessionTransport()
        let sessionStore = KeychainSessionStore()
        let guestFlags = UserDefaultsGuestFlagStore()
        let authEvents = DeferredAuthEvents()
        let refresher = AuthRefresher(configuration: apiConfiguration, transport: transport, store: sessionStore, clock: clock, events: authEvents)
        let client = APIClient(configuration: apiConfiguration, transport: transport, store: sessionStore, refresher: refresher, clock: clock)
        let userCaches = CompositeUserCacheClearer([])
        let authRepository = APIAuthRepository(client: client, sessionStore: sessionStore, guestFlags: guestFlags, userCaches: userCaches, clock: clock)

        let kakaoReady = KakaoSDKBootstrap.initialize(appKey: configuration.kakaoNativeAppKey)
        let pushRegistration = NoopPushRegistration()

        let versionGate = ForceUpdateGate(
            enabled: configuration.forceUpdateEnabled,
            installedVersion: configuration.installedVersion,
            lookup: ITunesStoreVersionLookup(bundleId: configuration.bundleId),
            clock: clock
        )
        let launch = AppLaunchViewModel(
            sessionResolver: SessionResolver(store: sessionStore, guestFlags: guestFlags, clock: clock),
            versionGate: versionGate,
            homePreloader: NoopHomePreloader(),
            pushRegistration: pushRegistration,
            storeOpener: StoreOpener(storeURL: configuration.appStoreURL),
            authRepository: authRepository,
            userCaches: userCaches,
            clock: clock
        )
        authEvents.bind(AuthEventBridge(launch: launch))

        let viewer = KeychainViewerContext(store: sessionStore)
        self.launch = launch
        self.toast = ToastCenter(clock: clock)
        self.authRepository = authRepository
        self.socialLogin = KakaoLoginFlow(gateway: KakaoSDKGatewayImpl(isConfigured: kakaoReady))
        self.pushRegistration = pushRegistration
        self.screenTracker = ScreenTracker(tracker: LogAnalyticsTracker())
        self.clock = clock
        self.viewer = viewer
        let topicRepository = APITopicRepository(client: client)
        let postRepository = APIPostRepository(client: client, viewer: viewer)
        let likeEvents = LikeEventBroadcaster()
        self.topicRepository = topicRepository
        self.postRepository = postRepository
        self.aiReviewRepository = APIAIReviewRepository(client: client)
        self.likeEvents = likeEvents
        self.likeCoordinator = LikeCoordinator(repository: APILikeRepository(client: client), viewer: viewer, sink: likeEvents)
        self.homeRepositories = HomeRepositories(
            topics: topicRepository,
            posts: postRepository,
            today: APITodayPostRepository(client: client),
            calendar: APICalendarRepository(client: client),
            banners: APIBannerRepository(client: client),
            unread: APIUnreadStatusRepository(client: client)
        )
        self.signUpRepository = APISignUpRepository(
            client: client, sessionStore: sessionStore, guestFlags: guestFlags, authRepository: authRepository, clock: clock
        )
        self.postChangeLedger = PostChangeLedger(viewer: viewer)
        self.postCreationRepository = APIPostCreationRepository(client: client)
        self.recordRepository = APIRecordCalendarRepository(client: client)
    }

    /// 로그인 화면이 나타날 때마다 새 ViewModel을 쓴다(완료 상태가 남아 재로그인이 막히지 않도록).
    func makeLoginViewModel() -> LoginViewModel {
        LoginViewModel(
            authRepository: authRepository,
            socialLogin: socialLogin,
            nonceFactory: KakaoNonceFactory(),
            pushRegistration: pushRegistration,
            screenTracker: screenTracker
        )
    }

    /// 메인에 들어갈 때마다 새로 만든다(홈 탭 데이터는 로그아웃·계정 전환 뒤 이어 쓰지 않는다).
    func makeMainSession(access: MainAccess) -> MainSession {
        let gate = UploadGate(today: homeRepositories.today, viewer: viewer)
        let shell = MainShellViewModel(access: access, toast: toast, screens: screenTracker, uploadGate: gate)
        let home = HomeViewModel(
            access: access, repositories: homeRepositories, clock: clock,
            toast: toast, navigator: shell, ledger: postChangeLedger, screens: screenTracker
        )
        return MainSession(shell: shell, home: home, container: self)
    }

    // MARK: 전시 · 게시물 상세 · AI 피드백

    func makeDisplayViewModel(initialDate: KSTDate?, initialSort: PostSort?) -> DisplayViewModel {
        DisplayViewModel(
            topics: topicRepository, posts: postRepository,
            likes: likeCoordinator, likeEvents: likeEvents, ledger: postChangeLedger,
            viewer: viewer, clock: clock, screenTracker: screenTracker,
            initialDate: initialDate, initialSort: initialSort
        )
    }

    func makePostDetailViewModel(entry: PostDetailEntry) -> PostDetailViewModel {
        PostDetailViewModel(
            entry: entry, posts: postRepository,
            likes: likeCoordinator, likeEvents: likeEvents, ledger: postChangeLedger,
            viewer: viewer, clock: clock, screenTracker: screenTracker
        )
    }

    func makeAIReviewViewModel(target: AIReviewTarget, surface: AIReviewViewModel.Surface, opensSheetOnFirstResult: Bool) -> AIReviewViewModel {
        AIReviewViewModel(
            target: target, surface: surface, repository: aiReviewRepository,
            viewer: viewer, clock: clock, opensSheetOnFirstResult: opensSheetOnFirstResult
        )
    }

    /// 홈 카드 대상: 카드는 오늘 승인된 내 사진일 때만 있으므로(`aiCardPostId`) 주제 날짜는 KST 오늘, 내 게시물이다.
    func homeAITarget(postId: UUID) -> AIReviewTarget {
        AIReviewTarget(postId: postId, topicDate: KST.date(of: clock.now), isMine: true)
    }

    func makeIssueWebViewModel(url: URL) -> IssueWebViewModel {
        IssueWebViewModel(url: url, toast: toast, screens: screenTracker)
    }

    // MARK: 업로드 · 사진 편집 · 기록

    func makeUploadViewModel(topicDate: KSTDate) -> UploadViewModel {
        UploadViewModel(
            topicDate: topicDate, topics: topicRepository, creation: postCreationRepository, today: homeRepositories.today,
            photoLoader: photoPipeline, preparer: photoPipeline, gallery: photoLibrarySaver,
            globalNotices: ToastGlobalNoticePoster(toast: toast), clock: clock, screenTracker: screenTracker
        )
    }

    func makePhotoEditViewModel(request: UploadViewModel.EditorRequest) -> PhotoEditViewModel {
        PhotoEditViewModel(
            photo: request.photo, initialEdit: request.initialEdit, isFirstSelection: request.isFirstSelection,
            preparer: photoPipeline, autoAdjuster: photoPipeline
        )
    }

    func makeRecordViewModel(access: MainAccess, navigator: any RecordNavigating) -> RecordViewModel {
        RecordViewModel(
            access: access, repository: recordRepository, clock: clock, toast: toast, navigator: navigator,
            renderer: CalendarImageRenderer(), saver: photoLibrarySaver, ledger: postChangeLedger, screens: screenTracker
        )
    }

    // MARK: 온보딩(약관 → 사인 그리기 → 미리보기)

    func makeTermsViewModel(context: SignUpContext) -> TermsViewModel {
        TermsViewModel(context: context, externalOpener: externalOpener, screenTracker: screenTracker)
    }

    func makeSignatureDrawingViewModel(kind: SignatureFlowKind) -> SignatureDrawingViewModel {
        SignatureDrawingViewModel(kind: kind, canvasSize: SignaturePadMetrics.canvasSize, encoder: signatureEncoder, screenTracker: screenTracker)
    }

    func makeSignUpPreviewViewModel(context: SignUpContext, draft: SignatureDraft) -> SignUpPreviewViewModel {
        SignUpPreviewViewModel(
            context: context, draft: draft, repository: signUpRepository,
            pushRegistration: pushRegistration, screenTracker: screenTracker
        )
    }
}
