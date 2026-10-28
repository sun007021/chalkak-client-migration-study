import Foundation
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

/// 메인 화면 한 세션(접근 모드 하나)에 쓰는 ViewModel 묶음. 로그아웃·계정 전환 때 버리고 새로 만든다.
@MainActor
final class MainSession {
    let shell: MainShellViewModel
    let home: HomeViewModel

    init(shell: MainShellViewModel, home: HomeViewModel) {
        self.shell = shell
        self.home = home
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
    private let signUpRepository: any SignUpRepository
    private let postChangeLedger: PostChangeLedger
    private let signatureEncoder = CoreGraphicsSignatureEncoder()

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
        self.homeRepositories = HomeRepositories(
            topics: APITopicRepository(client: client),
            posts: APIPostRepository(client: client, viewer: viewer),
            today: APITodayPostRepository(client: client),
            calendar: APICalendarRepository(client: client),
            banners: APIBannerRepository(client: client),
            unread: APIUnreadStatusRepository(client: client)
        )
        self.signUpRepository = APISignUpRepository(
            client: client, sessionStore: sessionStore, guestFlags: guestFlags, authRepository: authRepository, clock: clock
        )
        self.postChangeLedger = PostChangeLedger(viewer: viewer)
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
        return MainSession(shell: shell, home: home)
    }

    func makeIssueWebViewModel(url: URL) -> IssueWebViewModel {
        IssueWebViewModel(url: url, toast: toast, screens: screenTracker)
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
