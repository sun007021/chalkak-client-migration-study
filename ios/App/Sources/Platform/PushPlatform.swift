import Foundation
import Synchronization
import UIKit
import UserNotifications
import ChalkakNetwork
import ChalkakData
import ChalkakFeatures

// 푸시·알림 권한의 OS 어댑터. 규칙(언제 묻는지, 어떤 payload를 어디로 보내는지)은 Kit의 코디네이터가 정하고, 여기서는 UserNotifications/UIKit만 부른다.

/// `UNUserNotificationCenter` 권한 조회·요청의 공통 구현.
enum UNPushPermission {
    static func currentAuthorization() async -> NotificationAuthorization {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        switch status {
        case .notDetermined: return .notDetermined
        case .denied: return .denied
        case .authorized, .provisional, .ephemeral: return .authorized
        @unknown default: return .denied
        }
    }

    /// 알림·배지·소리 권한 대화상자. 허용되면 APNs 등록도 요청한다. 이미 결정된 상태면 대화상자 없이 현재 허용 여부를 돌려준다.
    static func request() async throws -> Bool {
        let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
        if granted { await registerForRemoteNotifications() }
        return granted
    }

    @MainActor
    static func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }
}

/// 메인 첫 진입 때의 권한 요청(`NotificationPermissionCoordinator`가 쓴다).
struct UNNotificationPermissionPlatform: NotificationPermissionPlatform {
    func authorizationStatus() async -> NotificationAuthorization {
        await UNPushPermission.currentAuthorization()
    }

    func requestAuthorization() async throws {
        _ = try await UNPushPermission.request()
    }
}

/// 설정 탭의 스위치가 쓰는 권한 조회·요청(`SettingsViewModel`).
struct UNPushAuthorizationProvider: PushAuthorizationProviding {
    func status() async -> PushAuthorizationStatus {
        switch await UNPushPermission.currentAuthorization() {
        case .authorized: .authorized
        case .denied: .denied
        case .notDetermined: .notDetermined
        }
    }

    func requestAuthorization() async -> Bool {
        (try? await UNPushPermission.request()) ?? false
    }
}

/// 앱의 시스템 알림 설정 화면으로 이동한다(없으면 앱 설정).
struct SystemSettingsOpener: SystemSettingsOpening {
    func openNotificationSettings() async {
        await MainActor.run {
            let target = URL(string: UIApplication.openNotificationSettingsURLString)
                ?? URL(string: UIApplication.openSettingsURLString)
            guard let target else { return }
            UIApplication.shared.open(target, options: [:], completionHandler: nil)
        }
    }
}

/// "알림 권한을 이미 요청했다" 표시(앱 설치당 한 번, 기기 단위).
@MainActor
final class UserDefaultsPermissionRequestedFlag: PermissionRequestedFlagStoring {
    private let key = "chalkak.push-permission-requested"

    var hasRequested: Bool {
        get { UserDefaults.standard.bool(forKey: key) }
        set { UserDefaults.standard.set(newValue, forKey: key) }
    }
}

/// 보류 중인 푸시 payload(프로세스가 죽어도 복원). 값은 `type`·id 4개뿐이고 토큰·개인정보는 없다.
@MainActor
final class UserDefaultsPendingPushStore: PendingPushStoring {
    private let key = "chalkak.pending-push"

    func load() -> PushPayload? {
        guard let fields = UserDefaults.standard.dictionary(forKey: key) as? [String: String] else { return nil }
        return PushPayload(strings: fields)
    }

    func save(_ payload: PushPayload) {
        UserDefaults.standard.set(payload.storedFields, forKey: key)
    }

    func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

/// OS가 준 APNs 기기 토큰(16진수)을 보관한다. 로그·서버로 보내지 않는다.
/// FCM SDK가 없어 이 값은 아직 서버 등록에 쓰이지 않는다(`PlaceholderFCMTokenProvider` 참고).
final class APNsTokenHolder: Sendable {
    private let token = Mutex<String?>(nil)

    func update(_ hex: String) {
        token.withLock { $0 = hex }
    }

    var current: String? {
        token.withLock { $0 }
    }
}

/// FCM 토큰 자리표시자. 프로젝트에 Firebase가 없어서 토큰이 없다고 답하고(→ 등록 요청 0건, `skippedNoToken`),
/// APNs 토큰을 FCM 토큰인 척 서버에 보내지 않는다. Firebase를 붙이는 PR이 `Messaging.messaging().token()`으로 바꾼다.
struct PlaceholderFCMTokenProvider: FCMTokenProviding {
    func currentToken() async -> String? { nil }
}

/// 로그인·시작·포그라운드에서 푸시 기기 등록을 시작한다(`PushRegistrationTrigger`). 결과는 호출자가 쓰지 않는다.
struct PushDeviceRegistration: PushRegistrationTrigger {
    let registrar: PushDeviceRegistrar

    func registerDevice() async {
        _ = await registrar.register()
    }
}

/// 로그아웃·탈퇴·재인증 때 기기 등록의 중복 제거 기록을 비운다(`UserCacheClearing` 연결점).
struct PushRegistrationSessionClearer: UserCacheClearing {
    let registrar: PushDeviceRegistrar

    func clearUserCaches() async {
        await registrar.sessionEnded()
    }
}
