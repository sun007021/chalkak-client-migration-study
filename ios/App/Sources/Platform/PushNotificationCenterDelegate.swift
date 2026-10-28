import UIKit
import UserNotifications
import ChalkakData
import ChalkakFeatures

/// OS가 알려 주는 푸시 사건. 값은 모두 Sendable이라 MainActor로 안전하게 넘어간다.
enum PushEvent: Sendable {
    /// 알림을 눌렀다.
    case tapped(PushPayload)
    /// 푸시를 받았다(포그라운드).
    case received
    /// APNs 기기 토큰(16진수).
    case apnsToken(String)
}

/// OS 진입점(UNUserNotificationCenter 델리게이트, AppDelegate)과 앱 구성(`PushEventHub`) 사이의 우체통.
/// 콜드 스타트에서는 알림을 누른 사건이 구성 루트보다 먼저 도착할 수 있어, 허브가 붙기 전 사건은 쌓아 뒀다가 붙을 때 순서대로 넘긴다.
@MainActor
final class PushEntryPoint {
    static let shared = PushEntryPoint()

    private var queue: [PushEvent] = []
    private var hub: PushEventHub?

    func submit(_ event: PushEvent) async {
        guard let hub else {
            queue.append(event)
            return
        }
        await hub.handle(event)
    }

    func attach(_ hub: PushEventHub) async {
        self.hub = hub
        while !queue.isEmpty {
            await hub.handle(queue.removeFirst())
        }
    }
}

/// 알림 센터 델리게이트. 상태가 없고, 메서드는 비동기 변형만 쓴다.
/// 인자(`UNNotification` 등)는 첫 `await` 전에 Sendable 값(String, `PushPayload`)으로 바꾸고, 그 값만 MainActor로 넘긴다.
final class PushNotificationCenterDelegate: NSObject, UNUserNotificationCenterDelegate {
    /// 포그라운드 표시(REQ-PUSH-019): 권한이 허용된 경우에만 보이고, 서버 본문이 비면 기본 문구로 바꿔 보인다.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        let content = notification.request.content
        let title = content.title.isEmpty ? nil : content.title
        let body = content.body.isEmpty ? nil : content.body
        let userInfo = content.userInfo

        await PushEntryPoint.shared.submit(.received)

        let authorization = await UNPushPermission.currentAuthorization()
        switch ForegroundPushPolicy.presentation(title: title, body: body, authorization: authorization) {
        case .suppress:
            return []
        case let .show(shownTitle, shownBody):
            if body != nil { return [.banner, .list, .sound] }
            // 본문이 비어 있으면 OS가 빈 배너를 보이지 않도록 기본 문구의 로컬 알림으로 바꿔 보인다(`userInfo`는 그대로라 눌러도 같은 곳으로 간다).
            let replacement = UNMutableNotificationContent()
            replacement.title = shownTitle
            replacement.body = shownBody
            replacement.sound = .default
            replacement.userInfo = userInfo
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: replacement, trigger: nil)
            try? await center.add(request)
            return []
        }
    }

    /// 알림 탭(기본 동작만). `type`별 목적지는 Kit이 정한다.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard response.actionIdentifier == UNNotificationDefaultActionIdentifier else { return }
        let payload = PushPayload(userInfo: response.notification.request.content.userInfo)
        await PushEntryPoint.shared.submit(.tapped(payload))
    }
}

/// 델리게이트 등록과 APNs 토큰 수신만 맡는 UIKit 앱 델리게이트.
final class AppDelegate: NSObject, UIApplicationDelegate {
    private let pushDelegate = PushNotificationCenterDelegate()

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // 콜드 스타트에서 알림을 눌러 열린 경우를 놓치지 않으려면 launch가 끝나기 전에 설정해야 한다.
        UNUserNotificationCenter.current().delegate = pushDelegate
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await PushEntryPoint.shared.submit(.apnsToken(hex)) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: any Error) {
        // 시뮬레이터·미서명 빌드에서는 실패가 정상이다. 푸시 등록은 다음 시작 때 다시 시도한다.
    }
}
