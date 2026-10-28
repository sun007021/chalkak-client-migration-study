import Foundation
import ChalkakData

public enum NotificationAuthorization: Sendable, Equatable {
    case notDetermined, authorized, denied
}

/// OS 알림 권한 어댑터(App 계층이 `UNUserNotificationCenter`로 구현).
public protocol NotificationPermissionPlatform: Sendable {
    func authorizationStatus() async -> NotificationAuthorization
    /// 알림·배지·소리 권한 대화상자.
    func requestAuthorization() async throws
}

/// "요청함" 표시(앱 설치당 한 번, 기기 단위 — 계정이 바뀌어도 다시 요청하지 않는다).
@MainActor
public protocol PermissionRequestedFlagStoring: AnyObject {
    var hasRequested: Bool { get set }
}

/// 알림 권한 요청(REQ-PUSH-001~006). 인증 사용자가 메인에 들어온 직후 호출한다(로그인·가입 화면에서는 호출하지 않는다).
/// - 게스트는 아무것도 하지 않는다. 이미 "요청함"이면 아무것도 하지 않는다.
/// - 요청을 띄우는 시점에(await 전에) "요청함"을 저장한다(동시 호출·재진입에도 요청 1회).
/// - `.notDetermined`면 OS 대화상자만 1회 요청한다(앱 안내 대화상자·서버 설정 PATCH 없음). 이미 결정된 상태면 대화상자 없이 표시만 저장한다.
/// - 요청 호출이 오류면 토스트 `NotificationCopy.permissionError`(표시는 저장된 채).
@MainActor
public final class NotificationPermissionCoordinator {
    private let platform: any NotificationPermissionPlatform
    private let flags: any PermissionRequestedFlagStoring
    private let toast: any ToastPresenting

    public init(platform: any NotificationPermissionPlatform, flags: any PermissionRequestedFlagStoring, toast: any ToastPresenting) {
        self.platform = platform
        self.flags = flags
        self.toast = toast
    }

    public func mainEntered(access: MainAccess) async {
        guard access == .member, !flags.hasRequested else { return }
        flags.hasRequested = true // await 전에 저장해야 재진입·동시 호출에도 요청이 1회다.
        guard await platform.authorizationStatus() == .notDetermined else { return }
        do {
            try await platform.requestAuthorization()
        } catch {
            if !error.isCancellation { toast.show(NotificationCopy.permissionError) }
        }
    }
}

public enum ForegroundPresentation: Sendable, Equatable {
    case show(title: String, body: String)
    case suppress
}

/// 포그라운드 푸시 표시(REQ-PUSH-019). 권한이 허용된 경우에만 서버가 준 제목·본문을 보이고, 본문이 비어 있으면 `NotificationCopy.pushDefaultBody`.
/// type과 무관하게 항상 표시한다(AI 피드백 화면 생략 정책은 스펙 확인 필요 2에 따라 하지 않는다).
public enum ForegroundPushPolicy {
    public static func presentation(title: String?, body: String?, authorization: NotificationAuthorization) -> ForegroundPresentation {
        guard authorization == .authorized else { return .suppress }
        let text = body ?? ""
        let isBlank = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        // 명세 확인 대상: 제목이 없을 때의 표시는 정해진 바 없어 빈 제목으로 둔다.
        return .show(title: title ?? "", body: isBlank ? NotificationCopy.pushDefaultBody : text)
    }
}
