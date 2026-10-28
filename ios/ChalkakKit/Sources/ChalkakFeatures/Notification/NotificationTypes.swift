import Foundation
import ChalkakData

/// 이동을 부탁받는 쪽(`MainShellViewModel`이 구현). 목적지 표는 D-11.
@MainActor
public protocol NotificationNavigating: AnyObject {
    func navigate(to destination: NotificationDestination)
}

/// 미읽음 점을 다시 조회하는 쪽(홈이 구현한다: 조회 실패는 이전 표시 유지).
@MainActor
public protocol UnreadRefreshing: AnyObject {
    func refreshUnread() async
}

public enum TapOutcome: Sendable, Equatable {
    /// 이동했다(읽음 성공 또는 연결 실패 토스트 후 이동, 읽음이 필요 없는 이동 포함).
    case navigated
    /// 404·그 밖의 읽음 실패: 토스트 `noti.gone`, 미읽음 새로고침, 이동 안 함.
    case gone
    /// 갱신 후에도 401: 토스트·이동 없이 로그인 화면으로(호출자가 `needsLogin`으로 처리).
    case loginRequired
    /// 아무 일도 하지 않았다(`.ignore`, 같은 알림 중복 탭, 취소·세션 전환).
    case ignored
}

public struct TapResult: Sendable, Equatable {
    public var outcome: TapOutcome
    /// 읽음 PATCH가 성공했다(연결 실패 뒤 이동은 false).
    public var markedRead: Bool
    public init(outcome: TapOutcome, markedRead: Bool = false) {
        self.outcome = outcome
        self.markedRead = markedRead
    }
}

/// 알림함 행 탭과 푸시 탭이 함께 쓰는 처리기(REQ-NOTI-015~020, REQ-PUSH-027).
/// `.markReadThenNavigate`:
/// - 같은 알림의 읽음 요청이 진행 중이면 `.ignored`(PATCH·이동 1회).
/// - 성공 → 미읽음 재조회 + `navigator.navigate`, `.navigated`.
/// - `FeedFailure.network` → 토스트 `NotificationCopy.readErrorNetwork` + 이동, `.navigated`(행의 미읽음은 호출자가 유지).
/// - `.unauthorized` → `.loginRequired`(토스트·이동 없음).
/// - 취소 → `.ignored`. 그 밖의 모든 실패(404, 5xx, 403, 400, 계약 위반) → 토스트 `NotificationCopy.gone` + 미읽음 재조회, `.gone`.
/// - `reset()` 이후에는 이전 세션에서 시작한 읽음 응답을 버린다(`.ignored`, 이동·토스트 없음).
@MainActor
public final class NotificationTapHandler {
    private let repository: any NotificationRepository
    private let navigator: any NotificationNavigating
    private let toast: any ToastPresenting
    private let unread: any UnreadRefreshing
    /// 계정이 바뀔 때마다 올라간다. 이전 세션에서 시작한 읽음 응답을 버리는 데 쓴다.
    private var sessionGeneration = 0
    /// 읽음 요청이 진행 중인 알림. 값은 요청마다 다른 표식이라 `reset()` 뒤 새 요청의 표시를 이전 요청이 지우지 못한다.
    private var inFlight: [UUID: Int] = [:]
    private var nextToken = 0

    public init(repository: any NotificationRepository, navigator: any NotificationNavigating, toast: any ToastPresenting, unread: any UnreadRefreshing) {
        self.repository = repository
        self.navigator = navigator
        self.toast = toast
        self.unread = unread
    }

    @discardableResult
    public func perform(_ plan: NotificationTapPlan) async -> TapOutcome {
        await performReporting(plan).outcome
    }

    /// `perform`과 같고, 읽음 PATCH가 성공했는지도 알려 준다(연결 실패 뒤 이동은 `markedRead == false`). 알림함이 행을 읽음으로 바꾸는 데 쓴다.
    public func performReporting(_ plan: NotificationTapPlan) async -> TapResult {
        switch plan {
        case .ignore:
            return TapResult(outcome: .ignored)
        case let .navigate(destination):
            navigator.navigate(to: destination)
            return TapResult(outcome: .navigated)
        case let .markReadThenNavigate(notificationId, destination):
            return await markReadThenNavigate(notificationId, destination)
        }
    }

    /// 로그아웃·계정 전환: 진행 중인 읽음 응답이 늦게 와도 이동·토스트·갱신을 하지 않는다.
    public func reset() {
        sessionGeneration += 1
        inFlight = [:]
    }

    private func markReadThenNavigate(_ id: UUID, _ destination: NotificationDestination) async -> TapResult {
        guard inFlight[id] == nil else { return TapResult(outcome: .ignored) }
        nextToken += 1
        let token = nextToken
        inFlight[id] = token
        let generation = sessionGeneration
        defer { if inFlight[id] == token { inFlight[id] = nil } }

        var failure: (any Error)?
        do {
            try await repository.markRead(id: id)
        } catch {
            failure = error
        }
        // 화면 이탈(취소)·계정 전환 뒤의 늦은 응답은 성공이든 실패든 버린다(취소를 무시하고 끝난 요청 포함).
        guard !Task.isCancelled, generation == sessionGeneration else { return TapResult(outcome: .ignored) }

        if let failure {
            if failure.isCancellation { return TapResult(outcome: .ignored) }
            switch failure as? FeedFailure ?? .invalidResponse {
            case .network:
                toast.show(NotificationCopy.readErrorNetwork)
                navigator.navigate(to: destination)
                return TapResult(outcome: .navigated)
            case .unauthorized:
                return TapResult(outcome: .loginRequired)
            default:
                // 404와 그 밖의 모든 실패(5xx, 403, 400, 계약 위반)는 같다(REQ-NOTI-018~019).
                // 명세 확인 대상: 푸시 탭의 404에서 이미 열려 있는 알림함 목록도 갱신할지는 정해진 바 없다(미읽음만 갱신한다).
                toast.show(NotificationCopy.gone)
                await unread.refreshUnread()
                return TapResult(outcome: .gone)
            }
        }
        // 이동하면 화면 이탈로 이 작업이 취소될 수 있으므로 미읽음 재조회를 이동보다 먼저 끝낸다.
        await unread.refreshUnread()
        guard !Task.isCancelled, generation == sessionGeneration else { return TapResult(outcome: .ignored, markedRead: true) }
        navigator.navigate(to: destination)
        return TapResult(outcome: .navigated, markedRead: true)
    }
}
