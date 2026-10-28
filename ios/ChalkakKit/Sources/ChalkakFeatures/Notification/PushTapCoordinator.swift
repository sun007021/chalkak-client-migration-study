import Foundation
import Observation
import ChalkakData

/// 푸시 탭을 지금 처리해도 되는지.
public enum PushGate: Sendable, Equatable {
    /// 로그아웃 상태: 버린다(저장도 안 함).
    case loggedOut
    /// 게스트: 버린다.
    case guest
    /// 로그인·약관·사인·업로드·피드백 화면이 열려 있음: 보류.
    case blocked
    /// 콜드 스타트에서 메인이 아직 준비되지 않음: 보류.
    case mainNotReady
    case ready
}

/// 프로세스 복원용 대기 푸시 저장소(UserDefaults 등).
@MainActor
public protocol PendingPushStoring: AnyObject {
    func load() -> PushPayload?
    func save(_ payload: PushPayload)
    func clear()
}

/// 푸시 탭 게이트(REQ-PUSH-030~031, REQ-NAV-041~043). 목적지 결정은 `NotificationRouting.plan(forPush:)`, 실행은 `NotificationTapHandler`.
/// - `tapped(_:gate:)`: `.loggedOut`/`.guest` → 버림(pending·store 없음). `.blocked`/`.mainNotReady` → `pending`에 두고 store에 저장(이전 보류분 교체).
///   `.ready` → 즉시 처리. `eventId`로 중복 제거하지 않는다(같은 payload 두 번이면 두 번 처리).
/// - `gateChanged(_:)`: `.ready`가 되면 보류분을 store에서 지운 뒤 정확히 1회 처리. `.loggedOut`/`.guest`가 되면 보류분을 버린다.
/// - `restorePending()`: 앱 시작 때 store의 보류분을 `pending`으로 복원(소비 뒤에는 store에 남지 않는다).
/// - `accountChanged()`: 로그인 계정이 바뀌면 보류분을 버린다.
/// - `received()`: 푸시를 받았을 때(포그라운드·백그라운드) 미읽음 재조회(`UnreadRefreshing`).
@MainActor
@Observable
public final class PushTapCoordinator {
    public private(set) var pending: PushPayload?
    public private(set) var needsLogin = false

    @ObservationIgnored private let handler: NotificationTapHandler
    @ObservationIgnored private let store: any PendingPushStoring
    @ObservationIgnored private let unread: any UnreadRefreshing

    public init(handler: NotificationTapHandler, store: any PendingPushStoring, unread: any UnreadRefreshing) {
        self.handler = handler
        self.store = store
        self.unread = unread
    }

    public func tapped(_ payload: PushPayload, gate: PushGate) async {
        switch gate {
        case .loggedOut, .guest:
            break // 앱만 열린다. 보류도 저장도 하지 않는다(REQ-PUSH-030).
        case .blocked, .mainNotReady:
            // 새 탭이 이전 보류분을 교체한다. 프로세스가 죽어도 복원되도록 저장한다.
            pending = payload
            store.save(payload)
        case .ready:
            discardPending() // 더 새로운 탭이 오면 이전 보류분은 의미가 없다(보류 교체와 같은 원칙).
            await process(payload)
        }
    }

    public func gateChanged(_ gate: PushGate) async {
        switch gate {
        case .loggedOut, .guest:
            discardPending()
        case .blocked, .mainNotReady:
            break
        case .ready:
            // 저장소를 먼저 비워 같은 보류분이 두 번 소비되지 않게 한다(프로세스 복원 포함).
            guard let payload = pending else { return }
            discardPending()
            await process(payload)
        }
    }

    public func restorePending() {
        if let stored = store.load() { pending = stored }
    }

    /// 로그인 계정이 바뀌었다. 이전 계정에 온 보류분과 진행 중이던 읽음 응답을 버린다.
    public func accountChanged() {
        discardPending()
        handler.reset()
    }

    public func received() async {
        await unread.refreshUnread()
    }

    public func consumeNeedsLogin() { needsLogin = false }

    private func process(_ payload: PushPayload) async {
        let outcome = await handler.perform(NotificationRouting.plan(forPush: payload))
        if outcome == .loginRequired {
            needsLogin = true
            discardPending() // 세션이 끝났으므로 이후의 보류분도 이어서 처리하지 않는다.
        }
    }

    private func discardPending() {
        pending = nil
        store.clear()
    }
}
