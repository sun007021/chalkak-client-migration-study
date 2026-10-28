import Foundation
import ChalkakData
import ChalkakFeatures

/// 푸시 사건(알림 탭, 수신, APNs 토큰)을 Kit의 코디네이터로 이어 주는 앱 계층 허브.
/// 규칙(게이트, 보류, 목적지)은 `PushTapCoordinator`·`NotificationRouting`이 갖고, 여기서는 "지금 어느 코디네이터에 넘기나"만 정한다.
/// - 메인 세션이 있으면 그 세션의 코디네이터가 현재 게이트(`MainSession.pushGate`)로 처리한다.
/// - 세션이 아직 없으면(스플래시·콜드 스타트) 로그인 화면이 아닐 때만 보류분으로 저장했다가 세션이 시작될 때 복원한다. 로그인 화면이면 버린다(REQ-PUSH-030).
@MainActor
final class PushEventHub {
    private weak var session: MainSession?
    private let permission: NotificationPermissionCoordinator
    private let pendingStore: any PendingPushStoring
    private let registrar: PushDeviceRegistrar
    private let apnsTokens: APNsTokenHolder
    private let rootProvider: @MainActor () -> AppRoot

    init(
        permission: NotificationPermissionCoordinator, pendingStore: any PendingPushStoring, registrar: PushDeviceRegistrar,
        apnsTokens: APNsTokenHolder, rootProvider: @escaping @MainActor () -> AppRoot
    ) {
        self.permission = permission
        self.pendingStore = pendingStore
        self.registrar = registrar
        self.apnsTokens = apnsTokens
        self.rootProvider = rootProvider
    }

    /// 허브가 붙기 전에 도착한 OS 사건을 받기 시작한다.
    func attachToEntryPoint() async {
        await PushEntryPoint.shared.attach(self)
    }

    func handle(_ event: PushEvent) async {
        switch event {
        case .tapped(let payload):
            await tapped(payload)
        case .received:
            await session?.push.received()
        case .apnsToken(let hex):
            apnsTokens.update(hex)
        }
    }

    /// 메인 화면이 열렸다. 보류된 푸시를 복원해 처리하고, 인증 사용자면 알림 권한을 (처음 한 번) 요청한다.
    func sessionStarted(_ session: MainSession) async {
        self.session = session
        session.push.restorePending()
        await session.push.gateChanged(session.pushGate)
        // OS 대화상자가 떠 있는 동안 기다리므로 복원·이동 뒤에 부른다.
        await permission.mainEntered(access: session.shell.access)
        if session.shell.access == .member, await UNPushPermission.currentAuthorization() == .authorized {
            UNPushPermission.registerForRemoteNotifications()
        }
    }

    /// 메인 세션이 끝났다(로그아웃·탈퇴·계정 전환): 보류분과 이전 계정의 응답을 버리고, 설정의 이전 계정 값을 비운다.
    func sessionEnded(_ session: MainSession) {
        session.push.accountChanged()
        session.settings.viewerDidChange()
        if self.session === session { self.session = nil }
    }

    /// 쌓임 화면이 바뀌었다(업로드·피드백이 열리거나 닫힘): 게이트를 다시 평가한다.
    func gateMayHaveChanged(_ session: MainSession) async {
        await session.push.gateChanged(session.pushGate)
    }

    /// 포그라운드 복귀: 푸시 기기 등록을 다시 시도한다(REQ-PUSH-008).
    func appBecameActive() async {
        _ = await registrar.register()
    }

    private func tapped(_ payload: PushPayload) async {
        if let session {
            await session.push.tapped(payload, gate: session.pushGate)
            return
        }
        switch rootProvider() {
        case .login:
            pendingStore.clear()
        case .splash, .updateRequired, .main:
            pendingStore.save(payload)
        }
    }
}
