import Foundation

// 설정 탭이 플랫폼에 부탁하는 일. 구현(UNUserNotificationCenter, UIApplication.openSettingsURLString)은 App 계층 어댑터 몫이다.

/// 기기 알림 권한 상태.
public enum PushAuthorizationStatus: Sendable, Equatable {
    case authorized
    /// 사용자가 거부했다(시스템 설정에서만 바꿀 수 있다).
    case denied
    /// 아직 묻지 않았다(iOS 미결정).
    case notDetermined
}

public protocol PushAuthorizationProviding: Sendable {
    /// 지금 기기 알림 권한 상태.
    func status() async -> PushAuthorizationStatus
    /// 시스템 권한 요청을 띄우고 허용되면 true. 이미 결정됐으면 요청 없이 현재 허용 여부.
    func requestAuthorization() async -> Bool
}

public protocol SystemSettingsOpening: Sendable {
    /// 앱의 시스템 알림 설정 화면으로 이동한다.
    func openNotificationSettings() async
}
