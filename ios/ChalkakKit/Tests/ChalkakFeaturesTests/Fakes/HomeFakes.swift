import Foundation
import Observation
import Synchronization
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 홈·배너·내비게이션 테스트용 Fake와 하네스. 전시용 `FeedFixtures`·`FakeTopicRepository`·`FakePostRepository`·`Hold`를 함께 쓴다.

// MARK: 관찰 대기(Task.yield 반복·실시간 없이 상태 변화를 기다린다)

/// 한 번 울리면 기다리는 쪽을 깨우는 문. 취소되면 깨어난다.
private final class Latch: Sendable {
    private let state = Mutex<(fired: Bool, continuation: CheckedContinuation<Void, Never>?)>((false, nil))

    func fire() {
        let continuation = state.withLock { s -> CheckedContinuation<Void, Never>? in
            guard !s.fired else { return nil }
            s.fired = true
            let c = s.continuation
            s.continuation = nil
            return c
        }
        continuation?.resume()
    }

    func wait() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let alreadyFired = state.withLock { s -> Bool in
                if s.fired { return true }
                s.continuation = continuation
                return false
            }
            if alreadyFired { continuation.resume() }
        }
    }
}

/// `condition`이 참이 될 때까지 기다린다. `@Observable` 프로퍼티가 바뀔 때마다 다시 평가하며(변경 알림은 같은 MainActor 턴이 끝난 뒤 이어진다),
/// 취소되면 곧바로 돌아온다(일어나지 않을 상태를 기다려도 멈추지 않는다).
@MainActor
func waitUntil(_ condition: @MainActor () -> Bool) async {
    while !Task.isCancelled {
        var satisfied = false
        let latch = Latch()
        withObservationTracking { satisfied = condition() } onChange: { latch.fire() }
        if satisfied { return }
        await withTaskCancellationHandler { await latch.wait() } onCancel: { latch.fire() }
    }
}

/// `task`가 끝나기 전에 `condition`이 참이 되었으면 true. 작업이 먼저 끝나 버리면(스텁·조기 종료) 기다림을 접고 false.
@MainActor
func reaches(_ condition: @escaping @MainActor @Sendable () -> Bool, before task: Task<Void, Never>) async -> Bool {
    await EventWait.happens({ await waitUntil(condition) }, before: task)
}

// MARK: 토스트·이동 기록

@MainActor
final class RecordingToast: ToastPresenting {
    private(set) var messages: [String] = []
    func show(_ message: String) { messages.append(message) }
}

@MainActor
final class RecordingNavigator: HomeNavigating {
    enum Call: Equatable {
        case feed(PostDetailEntry)
        case notifications
        case issue(URL)
        case display(KSTDate, PostSort)
        case record(KSTDate?)
        case upload
    }

    private(set) var calls: [Call] = []
    func openFeed(_ entry: PostDetailEntry) { calls.append(.feed(entry)) }
    func openNotifications() { calls.append(.notifications) }
    func openIssue(url: URL) { calls.append(.issue(url)) }
    func openDisplay(date: KSTDate, sort: PostSort) { calls.append(.display(date, sort)) }
    func openRecord(date: KSTDate?) { calls.append(.record(date)) }
    func startUpload() async { calls.append(.upload) }
}

/// 업로드 게이트 Fake. 호출 수를 세고, `hold`가 있으면 열릴 때까지 멈춘다.
actor FakeUploadGate: UploadEntryGating {
    private var result: UploadEntryResult
    private let hold: Hold?
    let entered = CallSignal()
    private(set) var count = 0

    init(result: UploadEntryResult = .open(topicDate: FeedFixtures.today), hold: Hold? = nil) {
        self.result = result
        self.hold = hold
    }

    func setResult(_ result: UploadEntryResult) { self.result = result }

    func checkEntry() async -> UploadEntryResult {
        count += 1
        await entered.fire()
        try? await hold?.wait()
        return result
    }
}

// MARK: 홈 저장소 Fake

/// 호출을 세고 알린 뒤 핸들러 결과를 돌려주는 단일 응답 Fake의 공통 모양.
actor FakeTodayPostRepository: TodayPostRepository {
    private(set) var count = 0
    let signal = CallSignal()
    private var handler: @Sendable () async throws -> TodayPostStatus = { HomeFixtures.notPosted() }
    func setHandler(_ handler: @escaping @Sendable () async throws -> TodayPostStatus) { self.handler = handler }
    func todayStatus() async throws -> TodayPostStatus {
        count += 1
        await signal.fire()
        return try await handler()
    }
}

actor FakeCalendarRepository: CalendarRepository {
    private(set) var requestedMonths: [YearMonth] = []
    let signal = CallSignal()
    private var handler: @Sendable (YearMonth) async throws -> MonthlyCalendar = { MonthlyCalendar(year: $0.year, month: $0.month, posts: []) }
    func setHandler(_ handler: @escaping @Sendable (YearMonth) async throws -> MonthlyCalendar) { self.handler = handler }
    func month(_ month: YearMonth) async throws -> MonthlyCalendar {
        requestedMonths.append(month)
        await signal.fire()
        return try await handler(month)
    }
}

actor FakeBannerRepository: BannerRepository {
    struct Request: Equatable, Sendable {
        let page: Int
        let pageSize: Int
    }

    private(set) var requests: [Request] = []
    let signal = CallSignal()
    private var handler: @Sendable (Int) async throws -> BannerPage = { HomeFixtures.bannerPage($0, ids: $0 == 1 ? 1...3 : 4...6, hasNext: false) }
    func setHandler(_ handler: @escaping @Sendable (Int) async throws -> BannerPage) { self.handler = handler }
    func page(_ page: Int, pageSize: Int) async throws -> BannerPage {
        requests.append(Request(page: page, pageSize: pageSize))
        await signal.fire()
        return try await handler(page)
    }
    var pages: [Int] { requests.map(\.page) }
}

actor FakeUnreadRepository: UnreadStatusRepository {
    private(set) var count = 0
    let signal = CallSignal()
    private var handler: @Sendable () async throws -> UnreadStatus = { UnreadStatus(hasUnread: false) }
    func setHandler(_ handler: @escaping @Sendable () async throws -> UnreadStatus) { self.handler = handler }
    func unreadStatus() async throws -> UnreadStatus {
        count += 1
        await signal.fire()
        return try await handler()
    }
}

// MARK: Fixture 빌더

enum HomeFixtures {
    static let today = FeedFixtures.today          // 2026-10-27 (화)
    static let yesterday = FeedFixtures.yesterday  // 2026-10-26
    /// shared/fixtures의 "내 오늘 게시물".
    static let myPost = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!

    static func notPosted(_ date: KSTDate = today) -> TodayPostStatus {
        TodayPostStatus(topicDate: date, isPosted: false, postId: nil, moderationStatus: nil)
    }

    static func posted(_ status: ModerationStatus, topicDate: KSTDate = today, postId: UUID = myPost) -> TodayPostStatus {
        TodayPostStatus(topicDate: topicDate, isPosted: true, postId: postId, moderationStatus: status)
    }

    static func thumbnail(_ postId: UUID) -> URL {
        URL(string: "https://cdn.example.test/posts/\(postId.uuidString.lowercased())/thumbnail.webp")!
    }

    static func calendarPost(_ date: KSTDate, postId: UUID? = nil, status: CalendarPostStatus = .approved) -> CalendarPost {
        let id = postId ?? FeedFixtures.postID(date.year % 100 * 10_000 + date.month * 100 + date.day)
        return CalendarPost(topicDate: date, postId: id, thumbnailImageURL: thumbnail(id), status: status)
    }

    static func month(_ year: Int, _ month: Int, _ posts: [CalendarPost]) -> MonthlyCalendar {
        MonthlyCalendar(year: year, month: month, posts: posts)
    }

    static func banner(_ n: Int) -> Banner {
        Banner(
            id: UUID(uuidString: "44444444-4444-4444-8444-4444444444" + String(format: "%02d", n))!,
            title: "이슈 \(n)", subtitle: "찰칵 소식 \(n)",
            webViewURL: URL(string: "https://web.example.test/issues/\(n)")!,
            thumbnailURL: URL(string: "https://cdn.example.test/banners/\(n)/thumbnail.webp"),
            createdAt: Date(timeIntervalSince1970: 0)
        )
    }

    static func bannerPage(_ page: Int, ids: ClosedRange<Int>, hasNext: Bool) -> BannerPage {
        BannerPage(currentPage: page, pageSize: 10, hasNext: hasNext, banners: ids.map(banner))
    }

    static func bannerIDs(_ ids: ClosedRange<Int>) -> [UUID] { ids.map { banner($0).id } }
}

// MARK: 하네스

/// 홈 ViewModel 한 벌(저장소 Fake, 시계, 토스트, 이동 기록). 기본은 정상 응답이다.
@MainActor
struct HomeWorld {
    let topics = FakeTopicRepository()
    let posts = FakePostRepository()
    let todayRepo = FakeTodayPostRepository()
    let calendarRepo = FakeCalendarRepository()
    let bannerRepo = FakeBannerRepository()
    let unreadRepo = FakeUnreadRepository()
    let viewer: MutableViewer
    let clock: TestClock
    let toast = RecordingToast()
    let navigator = RecordingNavigator()
    let ledger: PostChangeLedger
    let access: MainAccess

    init(guest: Bool = false, now: Date = FeedFixtures.noon(FeedFixtures.today)) {
        access = guest ? .guest : .member
        viewer = MutableViewer(userId: guest ? nil : FeedFixtures.userA)
        clock = TestClock(now: now)
        ledger = PostChangeLedger(viewer: viewer)
    }

    var repositories: HomeRepositories {
        HomeRepositories(topics: topics, posts: posts, today: todayRepo, calendar: calendarRepo, banners: bannerRepo, unread: unreadRepo)
    }

    func makeHome() -> HomeViewModel {
        HomeViewModel(access: access, repositories: repositories, clock: clock, toast: toast, navigator: navigator, ledger: ledger)
    }

    /// 기본 목록의 `index`(1부터)번째 id.
    func rankingID(_ date: KSTDate, _ index: Int) -> UUID { FeedFixtures.defaultID(date: date, sort: .popular, index: index) }
}

extension TestClock {
    /// KST 시각으로 벽시계를 옮긴다.
    func setKST(_ text: String) { setNow(Instant.parse(text + "+09:00")!) }
}

extension SectionState {
    var value: Value? {
        if case let .ready(value) = self { value } else { nil }
    }
    var failureMessage: String? {
        if case let .failed(message) = self { message } else { nil }
    }
}

extension HomeViewModel {
    /// 어제 랭킹·오늘 인기에서 보이는 게시물 id.
    var rankingIDs: [UUID] { ranking.value?.map(\.id) ?? [] }
    var popularIDs: [UUID] { popular.value?.map(\.id) ?? [] }
    var weekDates: [KSTDate] { week.value?.days.map(\.date) ?? [] }
    var weekPostDates: [KSTDate] { week.value?.days.compactMap { $0.post == nil ? nil : $0.date } ?? [] }
}

func kst(_ y: Int, _ m: Int, _ d: Int) -> KSTDate { KSTDate(year: y, month: m, day: d)! }
