import Foundation
import Observation
import ChalkakCore
import ChalkakData

public enum NotificationDetailPhase: Sendable, Equatable {
    case loading
    case content(NotificationDetail)
    /// 404: 이전 알림 정보를 대신 보이지 않고 `NotificationCopy.gone`을 보인다.
    case gone
    /// 연결 실패는 `NotificationCopy.network`, 그 밖은 `NotificationCopy.detailError`. "다시 시도"로 재요청.
    case error(String)
}

/// 알림 상세(screen_view `notification_detail`). REQ-NOTI-023~027.
/// - `appeared()`: screen_view + `GET /notifications/{id}`. 읽음 PATCH는 보내지 않는다.
/// - 404 → `.gone` + 토스트 `gone` + 미읽음 재조회. 401(갱신 후) → `needsLogin`. 취소는 상태·토스트를 바꾸지 않는다.
/// - `retry()`: `.loading`으로 돌아가 다시 요청. `backToInbox()`: `navigator.navigate(to: .inbox)`.
@MainActor
@Observable
public final class NotificationDetailViewModel {
    public private(set) var phase: NotificationDetailPhase = .loading
    public private(set) var needsLogin = false

    @ObservationIgnored private let notificationId: UUID
    @ObservationIgnored private let repository: any NotificationRepository
    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let unread: any UnreadRefreshing
    @ObservationIgnored private let navigator: any NotificationNavigating
    @ObservationIgnored private let screens: ScreenTracker?
    @ObservationIgnored private let work = ActiveWork()
    /// 요청마다 올라간다. 이탈·다시 시도로 밀려난 요청의 늦은 응답을 버린다.
    @ObservationIgnored private var generation = 0

    public init(
        notificationId: UUID, repository: any NotificationRepository, toast: any ToastPresenting,
        unread: any UnreadRefreshing, navigator: any NotificationNavigating, screens: ScreenTracker?
    ) {
        self.notificationId = notificationId
        self.repository = repository
        self.toast = toast
        self.unread = unread
        self.navigator = navigator
        self.screens = screens
    }

    public func appeared() async {
        screens?.screenAppeared(.notificationDetail)
        // 이미 결과(콘텐츠·없음·오류)가 있으면 다시 보일 때 다시 요청하지 않는다. 오류는 "다시 시도"로만 재요청한다.
        guard phase == .loading else { return }
        await load()
    }

    /// 화면 이탈: 진행 중 요청을 취소한다. 상태·토스트는 바꾸지 않는다.
    public func disappeared() {
        generation += 1
        work.cancel()
    }

    public func retry() async {
        phase = .loading
        await load()
    }

    public func backToInbox() {
        navigator.navigate(to: .inbox)
    }

    public func consumeNeedsLogin() { needsLogin = false }

    private func load() async {
        generation += 1
        let current = generation
        work.cancel()
        await work.run { [self] in
            do {
                let detail = try await repository.detail(id: notificationId)
                guard isCurrent(current) else { return }
                phase = .content(detail)
            } catch {
                guard isCurrent(current), !error.isCancellation else { return }
                switch error as? FeedFailure ?? .invalidResponse {
                case .notFound:
                    // 이전 알림 정보를 대신 보이지 않는다. 알림함은 다시 보일 때 조용히 다시 불러온다.
                    phase = .gone
                    toast.show(NotificationCopy.gone)
                    await unread.refreshUnread()
                case .unauthorized:
                    needsLogin = true
                case .network:
                    phase = .error(NotificationCopy.network)
                default:
                    phase = .error(NotificationCopy.detailError)
                }
            }
        }
    }

    private func isCurrent(_ value: Int) -> Bool { value == generation && !Task.isCancelled }
}
