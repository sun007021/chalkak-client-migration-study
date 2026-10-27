import Foundation
import Observation
import ChalkakCore
import ChalkakNetwork
import ChalkakData

/// 앱 루트 상태. `updateRequired`는 sticky(앱 안에서 해제 없음)이며 이후 어떤 전이도 무시한다.
public enum AppRoot: Sendable, Equatable {
    case splash
    case updateRequired
    case login
    case main(MainAccess)
}

/// 스플래시 → 강제 업데이트 게이트 → 인증 게이트 → 목적지(boot-auth.md §시작 흐름).
@MainActor
@Observable
public final class AppLaunchViewModel {
    public private(set) var root: AppRoot = .splash

    private let sessionResolver: any SessionResolving
    private let versionGate: any VersionGating
    private let homePreloader: any HomePreloading
    private let pushRegistration: any PushRegistrationTrigger
    private let storeOpener: any StoreOpening
    private let authRepository: any AuthRepository
    private let userCaches: any UserCacheClearing
    private let clock: any AppClock
    private var storeOpenedSinceLastCheck = false
    private var hasStarted = false
    /// `start()` 진행 중에만 있다. 스플래시 중 루트가 바뀌면 여기로 중단을 알린다.
    private var startEvents: AsyncStream<SplashEvent>.Continuation?

    public init(
        sessionResolver: any SessionResolving,
        versionGate: any VersionGating,
        homePreloader: any HomePreloading,
        pushRegistration: any PushRegistrationTrigger,
        storeOpener: any StoreOpening,
        authRepository: any AuthRepository,
        userCaches: any UserCacheClearing,
        clock: any AppClock
    ) {
        self.sessionResolver = sessionResolver
        self.versionGate = versionGate
        self.homePreloader = homePreloader
        self.pushRegistration = pushRegistration
        self.storeOpener = storeOpener
        self.authRepository = authRepository
        self.userCaches = userCaches
        self.clock = clock
    }

    /// 콜드 스타트(한 번만 동작). 세션 판정(로컬)과 버전 게이트를 구하고, 게이트가 끝날 때까지 스플래시를 유지한다
    /// (게이트 대기 상한은 게이트 자체의 타임아웃). 게이트를 통과하면 로그인은 즉시, 홈이 필요한 목적지는 프리로드가 끝나거나
    /// 통과 시점부터 `AppConstants.splashPreloadMax`(700ms, 가짜 시계)가 지나면 연다.
    /// 강제 업데이트면 홈·푸시 기기 등록·홈 호출 없이 `.updateRequired`. 시작 흐름이 만드는 전이는 루트가 `.splash`일 때만 일어난다:
    /// 그 사이 재인증 등으로 루트가 바뀌면 목적지를 열지 않고 푸시 등록도 하지 않는다.
    /// 인증 상태로 메인이 열릴 때 푸시 기기 등록을 1회 시작한다.
    public func start() async {
        guard !hasStarted, root == .splash else { return }
        hasStarted = true
        let destination = await sessionResolver.resolve()
        var splash = SplashSequence(destination: destination)
        let (events, sink) = AsyncStream<SplashEvent>.makeStream()
        startEvents = sink
        defer { startEvents = nil }
        if root != .splash { sink.yield(.interrupted) }
        let versionGate = versionGate, homePreloader = homePreloader, clock = clock
        let gateTask = Task { sink.yield(.gate(await versionGate.evaluate())) }
        var timer: Task<Void, Never>?
        var preloadTask: Task<Void, Never>?

        for await event in events {
            for action in splash.handle(event) {
                switch action {
                case .showUpdateRequired:
                    root = .updateRequired
                case .showLogin:
                    guard root == .splash else { break }
                    root = .login
                case .showMain(let access):
                    await openMain(access, startPush: destination.isAuthenticated)
                case .startPreload(let access):
                    preloadTask = Task {
                        try? await homePreloader.preload(access: access)
                        sink.yield(.preloaded)
                    }
                case .startTimer:
                    timer = Task {
                        guard (try? await clock.sleep(for: AppConstants.splashPreloadMax)) != nil else { return }
                        sink.yield(.timeout)
                    }
                }
            }
            if splash.isFinished || Task.isCancelled { break }
        }
        timer?.cancel()
        gateTask.cancel()
        // 메인이 열리지 않은 채 끝났다면(중단·취소) 프리로드도 멈춘다. 열렸다면 홈이 이어서 쓴다.
        if !isDeepLinkReady { preloadTask?.cancel() }
    }

    /// scene active / 온라인 복귀 때 게이트 재확인. 새로 강제 대상이면 `.updateRequired`.
    public func recheckVersionGate() async {
        storeOpenedSinceLastCheck = false
        if await versionGate.evaluate() == .updateRequired { transition(to: .updateRequired) }
    }

    /// "업데이트" 버튼. 연타해도 스토어 열기는 1회(다음 `recheckVersionGate()` 전까지 재호출 무시).
    public func updateButtonTapped() async {
        guard root == .updateRequired, !storeOpenedSinceLastCheck else { return }
        storeOpenedSinceLastCheck = true
        await storeOpener.openStore()
    }

    /// 로그인 화면이 끝났을 때 루트 전환. `.terms`는 루트를 바꾸지 않는다. 푸시 등록은 LoginViewModel이 이미 했다.
    public func loginCompleted(_ destination: LoginDestination) {
        guard case .main(let access) = destination else { return }
        transition(to: .main(access))
    }

    /// 로그아웃·탈퇴 완료 → 로그인 화면. `AccountSessionViewModel`의 `.finished`와 `.needsLogin`(탈퇴 401) 둘 다 여기로 연결하고,
    /// 이동 뒤 `AccountSessionViewModel.consumeResult()`로 상태를 되돌린다.
    public func accountSessionEnded() {
        transition(to: .login)
    }

    /// 게스트 설정의 "로그인" 버튼: 게스트 플래그를 지우고 로그인 화면으로.
    /// 플래그 삭제가 실패해도 로그인 화면으로 간다(남은 플래그는 다음 시작 때 `SessionResolver`가 인증 우선으로 치유한다).
    public func loginFromGuest() async {
        try? await authRepository.exitGuestMode()
        transition(to: .login)
    }

    /// REAUTHENTICATION_REQUIRED(세션은 이미 지워짐): 사용자 캐시를 비우고 로그인 화면으로 루트를 교체한다(백스택 없음).
    public func handleReauthenticationRequired() async {
        await userCaches.clearUserCaches()
        transition(to: .login)
    }

    /// 푸시 탭 같은 딥링크를 처리해도 되는지. 메인이 열렸고 강제 업데이트가 아닐 때만 true.
    public var isDeepLinkReady: Bool {
        if case .main = root { true } else { false }
    }

    /// 강제 업데이트는 sticky다: 한 번 `.updateRequired`가 되면 다른 어떤 전이도 무시한다.
    private func transition(to next: AppRoot) {
        guard root != .updateRequired else { return }
        if root == .splash { startEvents?.yield(.interrupted) }
        root = next
    }

    private func openMain(_ access: MainAccess, startPush: Bool) async {
        guard root == .splash else { return }
        root = .main(access)
        if startPush { await pushRegistration.registerDevice() }
    }
}

/// Network 계층의 `AuthEvents`를 앱 루트로 연결한다.
public struct AuthEventBridge: AuthEvents {
    private let launch: AppLaunchViewModel
    public init(launch: AppLaunchViewModel) { self.launch = launch }
    public func reauthenticationRequired() async {
        await launch.handleReauthenticationRequired()
    }
}
