import Foundation
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 알림함·푸시 테스트용 Fake와 하네스. `Hold`·`RecordingToast`·`RecordingAnalytics`·`waitUntil`은 다른 Fake 파일의 것을 함께 쓴다.

enum NotiFixtures {
    static let now = Instant.parse("2026-10-27T03:00:00Z")!
    static let post = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!

    static func id(_ n: Int) -> UUID { UUID(uuidString: "33333333-3333-4333-8333-3333333333" + (n < 10 ? "0\(n)" : "\(n)"))! }

    /// 알림 fixture 규약: n % 5 → 1 승인, 2 반려, 3 AI 완료, 4 AI 실패, 0 공지. 모두 같은 게시물을 가리킨다.
    static func item(_ n: Int, type: NotificationType? = nil, read: Bool = false, sourceType: String? = "POST", sourceId: String? = post.uuidString.lowercased()) -> NotificationItem {
        let types: [NotificationType] = [.notice, .postApproved, .postRejected, .aiReviewCompleted, .aiReviewFailed]
        let created = now.addingTimeInterval(-Double(n) * 60)
        return NotificationItem(
            id: id(n), type: type ?? types[n % 5], sourceType: sourceType, sourceId: sourceId, title: "제목 \(n)", body: "본문 \(n)",
            thumbnailImageURL: nil, readAt: read ? created.addingTimeInterval(30) : nil, createdAt: created
        )
    }

    static func page(_ number: Int, _ range: ClosedRange<Int>, hasNext: Bool) -> NotificationPage {
        NotificationPage(currentPage: number, pageSize: 20, hasNext: hasNext, items: range.map { item($0) })
    }

    /// 1페이지 1~20(hasNext), 2페이지 21~25(마지막).
    static func defaultPage(_ number: Int) -> NotificationPage {
        number == 1 ? page(1, 1...20, hasNext: true) : page(number, 21...25, hasNext: false)
    }

    static func detail(_ n: Int = 2, type: NotificationType = .postRejected) -> NotificationDetail {
        NotificationDetail(id: id(n), type: type, title: "상세 \(n)", body: "본문", originalImageURL: nil, rejectionReason: "사유", readAt: nil, createdAt: now)
    }
}

actor FakeNotificationRepository: NotificationRepository {
    typealias PageHandler = @Sendable (_ page: Int, _ callIndex: Int) async throws -> NotificationPage
    private(set) var pageRequests: [Int] = []
    private(set) var detailRequests: [UUID] = []
    private(set) var readRequests: [UUID] = []
    let pageSignal = CallSignal()
    let detailSignal = CallSignal()
    let readSignal = CallSignal()

    private var pageHandler: PageHandler = { page, _ in NotiFixtures.defaultPage(page) }
    private var detailHandler: @Sendable (UUID) async throws -> NotificationDetail = { NotiFixtures.detail(Int($0.uuidString.suffix(2)) ?? 2) }
    private var readHandler: @Sendable (UUID) async throws -> Void = { _ in }

    func setPageHandler(_ handler: @escaping PageHandler) { pageHandler = handler }
    func setDetailHandler(_ handler: @escaping @Sendable (UUID) async throws -> NotificationDetail) { detailHandler = handler }
    func setReadHandler(_ handler: @escaping @Sendable (UUID) async throws -> Void) { readHandler = handler }

    func page(_ page: Int, pageSize: Int) async throws -> NotificationPage {
        let index = pageRequests.count
        pageRequests.append(page)
        await pageSignal.fire()
        return try await pageHandler(page, index)
    }

    func detail(id: UUID) async throws -> NotificationDetail {
        detailRequests.append(id)
        await detailSignal.fire()
        return try await detailHandler(id)
    }

    func markRead(id: UUID) async throws {
        readRequests.append(id)
        await readSignal.fire()
        try await readHandler(id)
    }
}

@MainActor
final class RecordingNotificationNavigator: NotificationNavigating {
    private(set) var destinations: [NotificationDestination] = []
    func navigate(to destination: NotificationDestination) { destinations.append(destination) }
}

@MainActor
final class RecordingUnreadRefresher: UnreadRefreshing {
    private(set) var count = 0
    func refreshUnread() async { count += 1 }
}

@MainActor
final class FakePendingPushStore: PendingPushStoring {
    private(set) var stored: PushPayload?
    private(set) var saveCount = 0
    init(stored: PushPayload? = nil) { self.stored = stored }
    func load() -> PushPayload? { stored }
    func save(_ payload: PushPayload) {
        stored = payload
        saveCount += 1
    }
    func clear() { stored = nil }
}

actor FakePermissionPlatform: NotificationPermissionPlatform {
    struct RequestFailed: Error {}
    private var status: NotificationAuthorization
    private let failure: Bool
    private let hold: Hold?
    private(set) var requestCount = 0
    let requested = CallSignal()

    init(status: NotificationAuthorization, fails: Bool = false, hold: Hold? = nil) {
        self.status = status
        failure = fails
        self.hold = hold
    }

    func authorizationStatus() async -> NotificationAuthorization { status }

    func requestAuthorization() async throws {
        requestCount += 1
        await requested.fire()
        try? await hold?.wait()
        if failure { throw RequestFailed() }
    }
}

@MainActor
final class FakeRequestedFlag: PermissionRequestedFlagStoring {
    var hasRequested: Bool
    init(_ value: Bool = false) { hasRequested = value }
}

/// 알림함·상세·탭 처리기 조립.
@MainActor
struct NotiWorld {
    let repo = FakeNotificationRepository()
    let toast = RecordingToast()
    let navigator = RecordingNotificationNavigator()
    let unread = RecordingUnreadRefresher()
    let analytics = RecordingAnalytics()
    let clock = TestClock(now: NotiFixtures.now)
    let handler: NotificationTapHandler

    init() {
        handler = NotificationTapHandler(repository: repo, navigator: navigator, toast: toast, unread: unread)
    }

    func makeInbox() -> NotificationInboxViewModel {
        NotificationInboxViewModel(repository: repo, tapHandler: handler, toast: toast, clock: clock, screens: ScreenTracker(tracker: analytics))
    }

    func makeDetail(_ n: Int = 2) -> NotificationDetailViewModel {
        NotificationDetailViewModel(
            notificationId: NotiFixtures.id(n), repository: repo, toast: toast, unread: unread, navigator: navigator,
            screens: ScreenTracker(tracker: analytics)
        )
    }

    /// 1페이지를 불러온 알림함.
    func loadedInbox() async -> NotificationInboxViewModel {
        let vm = makeInbox()
        await vm.appeared()
        return vm
    }
}

extension NotificationInboxViewModel {
    var rowIDs: [UUID] { rows.map(\.id) }
    func row(_ n: Int) -> NotificationRow? { rows.first { $0.id == NotiFixtures.id(n) } }
}
