import Foundation
import Synchronization

/// 허용된 screen_name 19종(D-22). rawValue가 전송 문자열이다.
public enum AnalyticsScreen: String, Sendable, CaseIterable {
    case login, terms
    case termsOfService = "terms_of_service"
    case privacyPolicy = "privacy_policy"
    case onboardingSignature = "onboarding_signature"
    case onboardingSignaturePreview = "onboarding_signature_preview"
    case changeSignature = "change_signature"
    case changeSignaturePreview = "change_signature_preview"
    case home, issue, notifications
    case notificationDetail = "notification_detail"
    case display, feed, record, settings, feedback
    case photoUpload = "photo_upload"
    case photoUploadSuccess = "photo_upload_success"
}

/// `bottom_navigation_selected`의 destination(4종뿐. 가운데 업로드 버튼은 탭이 아니라 없음).
public enum AnalyticsDestination: String, Sendable, CaseIterable {
    case home, display, record, settings
}

/// 전송 이벤트. 이름·파라미터 키는 D-22 고정.
public enum AnalyticsEvent: Sendable, Equatable {
    case screenView(AnalyticsScreen, screenClass: String?)
    case bottomNavigationSelected(AnalyticsDestination)

    public var name: String {
        switch self {
        case .screenView: "screen_view"
        case .bottomNavigationSelected: "bottom_navigation_selected"
        }
    }
    /// 파라미터. screen_view는 `screen_name`(필수)·`screen_class`(선택)만, 탭 이벤트는 `destination`만. 개인정보·ID 없음.
    public var parameters: [String: String] {
        switch self {
        case let .screenView(screen, screenClass):
            var result = ["screen_name": screen.rawValue]
            if let screenClass { result["screen_class"] = screenClass }
            return result
        case let .bottomNavigationSelected(destination):
            return ["destination": destination.rawValue]
        }
    }
}

/// 분석 전송 인터페이스. 화면 코드는 구체 SDK가 아니라 이것만 안다. 사용자 식별자 설정 API는 두지 않는다(D-22).
public protocol AnalyticsTracker: Sendable {
    func track(_ event: AnalyticsEvent) throws
}

/// 기본 구현: Firebase 설정이 없을 때 로그로 출력한다(Q-16). 크래시하지 않는다.
public struct LogAnalyticsTracker: AnalyticsTracker {
    private let log: @Sendable (String) -> Void

    public init(log: @escaping @Sendable (String) -> Void = { print($0) }) {
        self.log = log
    }

    /// 로그 한 줄 형식: `[Analytics] <name> <key>=<value> ...` (키 오름차순).
    public func track(_ event: AnalyticsEvent) throws {
        let parameters = event.parameters.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }
        log((["[Analytics] \(event.name)"] + parameters).joined(separator: " "))
    }
}

/// 화면 진입 전송기. 중복 방지 규칙을 가진다:
/// 직전에 전송한 화면과 같은 화면의 `screenAppeared`는 무시(재렌더·회전), 다른 화면을 거쳐 돌아오면 다시 전송.
/// tracker가 throw해도 호출 측에 전파하지 않는다(`onError`로만 알림).
public final class ScreenTracker: Sendable {
    private let tracker: any AnalyticsTracker
    private let onError: (@Sendable (any Error) -> Void)?
    private let lastScreen = Mutex<AnalyticsScreen?>(nil)

    public init(tracker: any AnalyticsTracker, onError: (@Sendable (any Error) -> Void)? = nil) {
        self.tracker = tracker
        self.onError = onError
    }

    /// 화면이 최상위로 보일 때 호출(여러 번 호출돼도 안전).
    public func screenAppeared(_ screen: AnalyticsScreen, screenClass: String? = nil) {
        let isDuplicate = lastScreen.withLock { last in
            defer { last = screen }   // 전송 실패해도 기억해 재시도 폭주를 막는다
            return last == screen
        }
        if !isDuplicate { send(.screenView(screen, screenClass: screenClass)) }
    }

    /// 탭 선택마다 `bottom_navigation_selected`를 보낸다(재선택 포함, ANL-014 임시안). 이동하지 않은 탭(게스트 차단)은 호출하지 않는다.
    public func tabSelected(_ destination: AnalyticsDestination) {
        send(.bottomNavigationSelected(destination))
    }

    /// 중복 방지 기억을 비운다(앱이 백그라운드에서 돌아와 같은 화면을 다시 보고하려는 경우 등).
    public func reset() {
        lastScreen.withLock { $0 = nil }
    }

    private func send(_ event: AnalyticsEvent) {
        do { try tracker.track(event) } catch { onError?(error) }
    }
}
