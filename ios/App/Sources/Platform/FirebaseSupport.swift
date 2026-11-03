import Foundation
import FirebaseCore
import FirebaseMessaging
import FirebaseAnalytics
import ChalkakCore
import ChalkakData

// Firebase(FCM·Analytics) 어댑터. 설정 파일(GoogleService-Info.plist)은 저장소에 없고 로컬·배포 환경에서 주입한다.
// 파일이 번들에 없으면 Firebase를 켜지 않고, 토큰은 없음(nil), 분석은 로그 출력으로 동작한다(크래시 없음).

enum FirebaseBootstrap {
    /// 설정 파일이 번들에 들어 있는지. `FirebaseApp.configure()`는 파일이 없으면 예외로 죽으므로 먼저 확인한다.
    static func isConfigurationAvailable(bundle: Bundle = .main) -> Bool {
        bundle.url(forResource: "GoogleService-Info", withExtension: "plist") != nil
    }

    /// 설정 파일이 있으면 Firebase를 한 번 구성한다. 구성됐으면 true.
    @discardableResult
    static func configureIfAvailable(bundle: Bundle = .main) -> Bool {
        if FirebaseApp.app() != nil { return true }
        guard isConfigurationAvailable(bundle: bundle) else { return false }
        FirebaseApp.configure()
        return FirebaseApp.app() != nil
    }
}

/// Firebase가 구성됐을 때의 FCM 토큰 제공자. 구성 전이거나 발급 실패면 nil이라 등록 요청을 보내지 않는다.
struct FirebaseFCMTokenProvider: FCMTokenProviding {
    func currentToken() async -> String? {
        guard FirebaseApp.app() != nil else { return nil }
        return try? await Messaging.messaging().token()
    }
}

/// FCM 토큰 발급·갱신을 앱 허브로 넘긴다. 토큰 원문은 로그에 남기지 않는다(REQ-PUSH-018).
/// `Messaging.delegate`는 약한 참조라 `AppDelegate`가 강하게 들고 있어야 한다.
final class FCMTokenRelay: NSObject, MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let fcmToken, !fcmToken.isEmpty else { return }
        Task { await PushEntryPoint.shared.submit(.fcmToken(fcmToken)) }
    }
}

enum FirebaseAPNs {
    /// OS가 준 APNs 토큰을 Firebase에 넘긴다(자동 프록시를 꺼 두어 직접 넘겨야 FCM 토큰이 발급된다).
    static func forward(_ deviceToken: Data) {
        guard FirebaseApp.app() != nil else { return }
        #if targetEnvironment(simulator)
        // 시뮬레이터의 APNs 토큰은 개발용인데 Firebase가 운영용으로 추정하므로 종류를 직접 알려준다.
        Messaging.messaging().setAPNSToken(deviceToken, type: .sandbox)
        #else
        Messaging.messaging().apnsToken = deviceToken
        #endif
    }
}

/// Firebase Analytics 전송기(D-22: 이벤트 이름·파라미터는 Kit의 `AnalyticsEvent`가 정한다).
struct FirebaseAnalyticsTracker: AnalyticsTracker {
    func track(_ event: AnalyticsEvent) throws {
        guard FirebaseApp.app() != nil else { return }
        switch event {
        case let .screenView(screen, screenClass):
            var parameters: [String: Any] = [AnalyticsParameterScreenName: screen.rawValue]
            if let screenClass { parameters[AnalyticsParameterScreenClass] = screenClass }
            Analytics.logEvent(AnalyticsEventScreenView, parameters: parameters)
        case .bottomNavigationSelected:
            Analytics.logEvent(event.name, parameters: event.parameters)
        }
    }
}
