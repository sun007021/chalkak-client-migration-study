import Foundation
import ChalkakData

enum SplashEvent: Sendable {
    case gate(VersionGateResult)
    case timeout
    case preloaded
    /// 스플래시 중 다른 곳이 루트를 바꿨다(재인증 등). 목적지를 열지 않는다.
    case interrupted
}

enum SplashAction: Equatable {
    case showUpdateRequired
    case showLogin
    case showMain(MainAccess)
    case startPreload(MainAccess)
    /// 게이트 통과 시점부터 `splashPreloadMax`를 센다.
    case startTimer
}

extension AuthGateResult {
    var isAuthenticated: Bool {
        if case .authenticated = self { true } else { false }
    }
}

/// 스플래시를 언제 해제할지 정하는 순수 상태기계(시간·비동기 없음). `AppLaunchViewModel.start()`가 이벤트를 먹이고 액션을 실행한다.
///
/// - 게이트 확인 중에는 어떤 목적지도 열지 않는다(상한은 게이트 자체의 타임아웃).
/// - 게이트가 강제 업데이트면 아무것도 열지 않고 업데이트 화면만 보인다(홈 프리로드·푸시 등록 없음).
/// - 게이트가 통과하면 로그인은 즉시, 메인은 프리로드가 끝나거나 통과 시점부터 센 700ms가 지나면 연다.
/// - 중단(`interrupted`)되면 목적지를 열지 않는다. 다만 게이트가 강제 업데이트로 끝나면 업데이트 화면이 이긴다.
struct SplashSequence {
    private let destination: AuthGateResult
    private var gate: VersionGateResult?
    private var opened = false
    private var updateShown = false
    private var interrupted = false

    init(destination: AuthGateResult) { self.destination = destination }

    /// 더 기다릴 것이 없다: 업데이트 화면이 떴거나, 목적지가 열렸거나, 중단됐고 게이트 결과도 나왔다.
    var isFinished: Bool { updateShown || opened || (interrupted && gate != nil) }

    private var mainAccess: MainAccess? {
        switch destination {
        case .authenticated: .member
        case .guest: .guest
        case .signedOut: nil
        }
    }

    mutating func handle(_ event: SplashEvent) -> [SplashAction] {
        guard !updateShown else { return [] }
        switch event {
        case .gate(.updateRequired):
            updateShown = true
            return [.showUpdateRequired]
        case .gate(.passed):
            gate = .passed
            guard !interrupted else { return [] }
            guard let access = mainAccess else { return open(.showLogin) }
            return [.startPreload(access), .startTimer]
        case .interrupted:
            interrupted = true
            return []
        case .timeout, .preloaded:
            guard gate == .passed, !interrupted, let access = mainAccess else { return [] }
            return open(.showMain(access))
        }
    }

    private mutating func open(_ action: SplashAction) -> [SplashAction] {
        guard !opened else { return [] }
        opened = true
        return [action]
    }
}
