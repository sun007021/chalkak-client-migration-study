import Foundation
import Observation
import ChalkakCore
import ChalkakData

public struct NotificationRow: Sendable, Equatable, Identifiable {
    public let id: UUID
    public var title: String
    public var body: String
    public var thumbnailURL: URL?
    /// KST "M월 d일 HH:mm"(`KST.notificationTimestamp`)
    public var timeText: String
    public var readAt: Date?
    public var isUnread: Bool { readAt == nil }
    public init(id: UUID, title: String, body: String, thumbnailURL: URL?, timeText: String, readAt: Date?) {
        self.id = id
        self.title = title
        self.body = body
        self.thumbnailURL = thumbnailURL
        self.timeText = timeText
        self.readAt = readAt
    }
}

public enum InboxPhase: Sendable, Equatable {
    case loading
    case content
    case empty
    /// 콘텐츠 없이 첫 로딩 실패. 연결 실패는 `NotificationCopy.network`, 그 밖은 `NotificationCopy.inboxError`.
    case error(String)
}

/// 알림함 목록(screen_view `notifications`). docs/spec/features/notification-push.md REQ-NOTI-001~022.
///
/// - `appeared()`: 처음이면 1페이지(`pageSize` 20)를 불러온다(`.loading` → `.content`/`.empty`/`.error`). 다시 보일 때는 조용히 1페이지를 다시 불러와
///   목록을 교체하고(실패해도 목록 유지, 토스트 없음) screen_view는 화면이 최상위로 보일 때마다 `ScreenTracker`에 맡긴다.
/// - `retry()`: 오류 화면에서 `.loading`으로 돌아가 다시 요청.
/// - `refresh()`: 당겨서 새로고침. 성공하면 목록 교체·다음 페이지 2로 되돌림, 실패하면 목록 유지 + 토스트 `refreshError`. 겹친 새로고침의 늦은 응답은 버린다.
/// - `rowAppeared(index:)`: 끝에서 `prefetchDistance`개 이내이고 `hasNext`이며 요청·새로고침 중이 아니면 다음 페이지. 같은 id는 걸러 이어 붙인다.
///   실패하면 목록·페이지 번호를 유지하고 토스트 `moreError`(같은 페이지를 다시 요청할 수 있다). 날짜로 항목을 거르지 않는다.
/// - `rowTapped(id:)`: `NotificationRouting.plan(forRow:)` → `NotificationTapHandler.perform`. 성공하면 행을 읽음으로(readAt = clock.now, 이미 읽은 행은 원래 값 유지),
///   연결 실패면 행의 미읽음 유지, `.gone`이면 1페이지를 조용히 다시 불러온다. `.loginRequired`면 `needsLogin`.
/// - `disappeared()`: 진행 중 요청 취소(오류·토스트 없음). `reset()`: 계정 전환(목록 비움, 이전 응답 버림).
@MainActor
@Observable
public final class NotificationInboxViewModel {
    public static let prefetchDistance = 4

    public private(set) var phase: InboxPhase = .loading
    /// 화면용 투영. 서버 원본(`items`) 하나에서 계산하므로 둘이 어긋나지 않는다.
    public var rows: [NotificationRow] { items.map(Self.row) }
    public private(set) var isRefreshing = false
    public private(set) var isLoadingMore = false
    public private(set) var hasNext = false
    /// 다음에 요청할 페이지 번호.
    public private(set) var nextPage = 2
    public private(set) var needsLogin = false

    @ObservationIgnored private let repository: any NotificationRepository
    @ObservationIgnored private let tapHandler: NotificationTapHandler
    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let clock: any AppClock
    @ObservationIgnored private let screens: ScreenTracker?
    @ObservationIgnored private let loadWork = ActiveWork()
    @ObservationIgnored private let tapWork = ActiveWork()
    /// 서버 원본(응답 순서). 행 탭이 목적지를 정하는 데도 쓴다.
    private var items: [NotificationItem] = []
    /// 새로 시작한 요청·이탈·초기화마다 올라간다. 시작 시점의 값과 다르면 늦은 응답을 버린다.
    @ObservationIgnored private var generation = 0
    /// 행 탭 전용 세대. 이탈·초기화에서만 올라가고, 목록 새로고침은 진행 중인 탭을 취소하지 않는다.
    @ObservationIgnored private var tapGeneration = 0

    private enum LoadMode {
        /// 처음·다시 시도: 콘텐츠가 없으니 실패는 오류 화면이다.
        case initial
        /// 다시 보일 때·읽기 실패 뒤: 실패해도 목록을 유지하고 토스트가 없다.
        case quiet
        /// 당겨서 새로고침: 실패하면 목록을 유지하고 토스트 `refreshError`.
        case pullToRefresh
    }

    public init(
        repository: any NotificationRepository, tapHandler: NotificationTapHandler, toast: any ToastPresenting,
        clock: any AppClock, screens: ScreenTracker?
    ) {
        self.repository = repository
        self.tapHandler = tapHandler
        self.toast = toast
        self.clock = clock
        self.screens = screens
    }

    // MARK: 생명주기

    public func appeared() async {
        screens?.screenAppeared(.notifications)
        switch phase {
        case .loading: await load(.initial)
        case .error:
            phase = .loading
            await load(.initial)
        case .content, .empty: await load(.quiet)
        }
    }

    /// 화면 이탈: 진행 중 요청(목록·읽음)을 취소한다. 오류·토스트 없이 끝난다.
    public func disappeared() {
        supersede()
        cancelTaps()
    }

    public func retry() async {
        phase = .loading
        await load(.initial)
    }

    public func refresh() async {
        await load(.pullToRefresh)
    }

    /// 끝에서 `prefetchDistance`개 이내가 보이면 다음 페이지를 이어 붙인다.
    public func rowAppeared(index: Int) async {
        guard phase == .content, hasNext, !isLoadingMore, !isRefreshing, index >= items.count - Self.prefetchDistance else { return }
        let page = nextPage
        let current = generation
        isLoadingMore = true
        await loadWork.run { [self] in
            do {
                let result = try await repository.page(page, pageSize: AppConstants.pageSize)
                guard isCurrent(current) else { return }
                append(result)
                nextPage = page + 1
                hasNext = result.hasNext
                isLoadingMore = false
            } catch {
                guard isCurrent(current) else { return }
                isLoadingMore = false
                if error.isCancellation { return }
                // 목록·페이지 번호는 그대로라 다시 스크롤하면 같은 페이지를 다시 요청한다(REQ-NOTI-011).
                if error as? FeedFailure == .unauthorized { needsLogin = true } else { toast.show(NotificationCopy.moreError) }
            }
        }
    }

    public func rowTapped(id: UUID) async {
        guard let item = items.first(where: { $0.id == id }) else { return }
        let plan = NotificationRouting.plan(forRow: item)
        let current = tapGeneration
        var result = TapResult(outcome: .ignored)
        await tapWork.run { [self] in result = await tapHandler.performReporting(plan) }
        guard current == tapGeneration, !Task.isCancelled else { return }
        if result.markedRead { markRowRead(id) }
        switch result.outcome {
        case .gone: await load(.quiet) // 목록에서 사라졌을 수 있다(REQ-NOTI-018). 토스트는 처리기가 이미 띄웠다.
        case .loginRequired: needsLogin = true
        case .navigated, .ignored: break
        }
    }

    /// 계정 전환: 목록을 비우고 이전 계정의 늦은 응답을 버린다.
    public func reset() {
        supersede()
        cancelTaps()
        items = []
        phase = .loading
        hasNext = false
        nextPage = 2
        needsLogin = false
    }

    public func consumeNeedsLogin() { needsLogin = false }

    // MARK: 불러오기

    /// 1페이지를 불러와 목록을 교체한다. 겹친 요청은 가장 나중 것만 반영한다.
    /// 명세 확인 대상: 2페이지까지 이어 붙인 목록을 다시 보일 때 1페이지로 교체하면 이어 붙인 항목이 사라진다(병합 여부는 정해진 바 없음, REQ-NOTI-012).
    private func load(_ mode: LoadMode) async {
        supersede()
        let current = generation
        if mode == .pullToRefresh { isRefreshing = true }
        await loadWork.run { [self] in
            do {
                let result = try await repository.page(1, pageSize: AppConstants.pageSize)
                guard isCurrent(current) else { return }
                replace(with: result)
                isRefreshing = false
            } catch {
                guard isCurrent(current) else { return }
                isRefreshing = false
                if error.isCancellation { return }
                let failure = error as? FeedFailure ?? .invalidResponse
                if failure == .unauthorized {
                    needsLogin = true
                    return
                }
                switch mode {
                case .initial: phase = .error(failure == .network ? NotificationCopy.network : NotificationCopy.inboxError)
                case .quiet: break
                case .pullToRefresh: toast.show(NotificationCopy.refreshError)
                }
            }
        }
    }

    /// 이전 요청을 취소하고 그 늦은 응답을 버리게 한다.
    private func supersede() {
        generation += 1
        loadWork.cancel()
        isRefreshing = false
        isLoadingMore = false
    }

    private func cancelTaps() {
        tapGeneration += 1
        tapWork.cancel()
    }

    private func isCurrent(_ value: Int) -> Bool { value == generation && !Task.isCancelled }

    private func replace(with page: NotificationPage) {
        items = []
        append(page)
        hasNext = page.hasNext
        nextPage = 2
        phase = items.isEmpty ? .empty : .content
    }

    /// 응답 순서를 유지하며 이미 있는 id는 건너뛴다(오프셋 페이징 중 겹침, REQ-NOTI-007).
    private func append(_ page: NotificationPage) {
        var known = Set(items.map(\.id))
        for item in page.items where known.insert(item.id).inserted { items.append(item) }
    }

    private static func row(_ item: NotificationItem) -> NotificationRow {
        NotificationRow(
            id: item.id, title: item.title, body: item.body, thumbnailURL: item.thumbnailImageURL,
            timeText: KST.notificationTimestamp(item.createdAt), readAt: item.readAt
        )
    }

    /// 읽음 성공: 읽지 않은 행만 `readAt`을 지금으로 바꾼다(이미 읽은 행은 최초 값 유지).
    private func markRowRead(_ id: UUID) {
        guard let index = items.firstIndex(where: { $0.id == id }), items[index].readAt == nil else { return }
        items[index].readAt = clock.now
    }
}
