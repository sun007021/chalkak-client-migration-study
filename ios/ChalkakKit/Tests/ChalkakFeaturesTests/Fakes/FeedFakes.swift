import Foundation
import Synchronization
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 전시·상세 ViewModel 테스트용 Fixture 빌더, Fake 저장소, 하네스. 좋아요 Fake는 LikeFakes.swift를 쓴다.

enum FeedFixtures {
    static let userA = "11111111-1111-4111-8111-111111111111"
    static let userB = "22222222-2222-4222-8222-222222222222"
    static let userAID = UUID(uuidString: userA)!
    static let userBID = UUID(uuidString: userB)!

    static func date(_ year: Int, _ month: Int, _ day: Int) -> KSTDate { KSTDate(year: year, month: month, day: day)! }
    static let today = date(2026, 10, 27)
    static let yesterday = date(2026, 10, 26)

    /// KST 정오(UTC 03:00)의 순간.
    static func noon(_ date: KSTDate) -> Date {
        Instant.parse("\(date.string)T12:00:00+09:00")!
    }

    static func postID(_ n: Int) -> UUID {
        UUID(uuidString: "33333333-3333-4333-8333-" + String(format: "%012d", n))!
    }

    static func listItem(
        _ n: Int, title: String? = nil, likeCount: Int = 0, isLiked: Bool = false,
        isMine: Bool = false, authorId: UUID? = nil
    ) -> PostListItem {
        PostListItem(
            id: postID(n), authorId: authorId ?? (isMine ? userAID : userBID),
            originalImageURL: URL(string: "https://img.test/o/\(n).webp")!,
            thumbnailImageURL: URL(string: "https://img.test/t/\(n).webp")!,
            signatureOriginalImageURL: URL(string: "https://img.test/so/\(n).webp")!,
            signatureThumbnailImageURL: URL(string: "https://img.test/st/\(n).webp")!,
            title: title, submittedAt: Date(timeIntervalSince1970: 0),
            likeCount: likeCount, isLiked: isLiked, isMine: isMine
        )
    }

    static func topic(_ date: KSTDate) -> Topic {
        Topic(id: UUID(uuidString: "44444444-4444-4444-8444-444444444444")!, title: "주제 \(date.string)",
              topicDate: date, startsAt: Date(timeIntervalSince1970: 0), endsAt: Date(timeIntervalSince1970: 3600), phase: .open)
    }

    static func page(_ items: [PostListItem], page: Int = 1, hasNext: Bool = false, seed: String? = nil) -> PostPage {
        PostPage(currentPage: page, pageSize: 20, hasNext: hasNext, randomSeed: seed, posts: items)
    }

    /// 날짜·정렬마다 다른 id 대역을 쓰는 기본 목록(2페이지, 페이지당 20장). 같은 (날짜, 정렬)이면 항상 같은 id다.
    static func defaultPage(_ query: PostListQuery) -> PostPage {
        let sortOffset = ["recent": 0, "popular": 200, "random": 400][query.sort.rawValue] ?? 0
        let base = query.topicDate.day * 1000 + sortOffset + (query.topicDate.month % 10) * 100_000
        let start = (query.page - 1) * 20
        let items = (1...20).map { listItem(base + start + $0, likeCount: start + $0) }
        return page(items, page: query.page, hasNext: query.page < 2, seed: query.sort == .random ? "seedA" : nil)
    }

    /// 기본 목록의 `index`(1부터, 전체 누적 기준)번째 게시물 id.
    static func defaultID(date: KSTDate, sort: PostSort, index: Int) -> UUID {
        let sortOffset = ["recent": 0, "popular": 200, "random": 400][sort.rawValue] ?? 0
        return postID(date.day * 1000 + sortOffset + (date.month % 10) * 100_000 + index)
    }

    static func detail(
        _ n: Int, authorId: UUID? = nil, topicDate: KSTDate = today, title: String? = "원래 제목",
        likeCount: Int = 5, isLiked: Bool = false
    ) -> PostDetail {
        detail(id: postID(n), authorId: authorId, topicDate: topicDate, title: title, likeCount: likeCount, isLiked: isLiked)
    }

    static func detail(
        id: UUID, authorId: UUID? = nil, topicDate: KSTDate = today, title: String? = "원래 제목",
        likeCount: Int = 5, isLiked: Bool = false
    ) -> PostDetail {
        let n = Int(id.uuidString.suffix(12)) ?? 0
        return PostDetail(
            id: id, authorId: authorId ?? userBID,
            topic: PostTopic(id: UUID(uuidString: "44444444-4444-4444-8444-444444444444")!, title: "주제", topicDate: topicDate),
            originalImageURL: URL(string: "https://img.test/o/\(n).webp")!,
            thumbnailImageURL: URL(string: "https://img.test/t/\(n).webp")!,
            signatureOriginalImageURL: URL(string: "https://img.test/so/\(n).webp")!,
            title: title, likeCount: likeCount, isLiked: isLiked
        )
    }
}

/// 호출 순서별로 다르게 응답시키고 싶을 때 쓰는 증가 카운터.
actor Counter {
    private var value = 0
    func next() -> Int {
        value += 1
        return value
    }
}

/// `PostChangeLedger`가 알린 변경을 모은다.
@MainActor
final class PostChangeRecorder: PostChangeObserver {
    private(set) var changes: [PostChange] = []
    func postChangeLedger(didRecord change: PostChange) { changes.append(change) }
}

/// `LikeEvent`를 모으는 구독자.
@MainActor
final class LikeEventRecorder: LikeEventSink {
    private(set) var events: [LikeEvent] = []
    func likeCoordinator(didEmit event: LikeEvent) { events.append(event) }
}

// MARK: Fake 저장소

actor FakeTopicRepository: TopicRepository {
    private(set) var requestedDates: [KSTDate] = []
    let signal = CallSignal()
    private var handler: @Sendable (KSTDate) async throws -> Topic = { FeedFixtures.topic($0) }

    func setHandler(_ handler: @escaping @Sendable (KSTDate) async throws -> Topic) { self.handler = handler }

    func topic(on date: KSTDate) async throws -> Topic {
        requestedDates.append(date)
        await signal.fire()
        return try await handler(date)
    }
}

actor FakePostRepository: PostRepository {
    private(set) var listQueries: [PostListQuery] = []
    private(set) var detailIDs: [UUID] = []
    private(set) var titleUpdates: [(id: UUID, rawTitle: String)] = []
    private(set) var deletedIDs: [UUID] = []
    let listSignal = CallSignal()
    let detailSignal = CallSignal()
    let updateSignal = CallSignal()
    let deleteSignal = CallSignal()

    private var listHandler: @Sendable (PostListQuery) async throws -> PostPage = { FeedFixtures.defaultPage($0) }
    private var detailHandler: @Sendable (UUID) async throws -> PostDetail = { _ in throw FeedFailure.notFound }
    private var updateHandler: @Sendable (UUID, String) async throws -> TitleUpdateResult = { id, raw in
        TitleUpdateResult(postId: id, title: PostTitle.normalized(raw))
    }
    private var deleteHandler: @Sendable (UUID) async throws -> Void = { _ in }

    func setListHandler(_ handler: @escaping @Sendable (PostListQuery) async throws -> PostPage) { listHandler = handler }
    func setDetailHandler(_ handler: @escaping @Sendable (UUID) async throws -> PostDetail) { detailHandler = handler }
    func setUpdateHandler(_ handler: @escaping @Sendable (UUID, String) async throws -> TitleUpdateResult) { updateHandler = handler }
    func setDeleteHandler(_ handler: @escaping @Sendable (UUID) async throws -> Void) { deleteHandler = handler }

    func list(_ query: PostListQuery) async throws -> PostPage {
        listQueries.append(query)
        await listSignal.fire()
        return try await listHandler(query)
    }

    func detail(id: UUID) async throws -> PostDetail {
        detailIDs.append(id)
        await detailSignal.fire()
        return try await detailHandler(id)
    }

    func updateTitle(id: UUID, rawTitle: String) async throws -> TitleUpdateResult {
        titleUpdates.append((id, rawTitle))
        await updateSignal.fire()
        return try await updateHandler(id, rawTitle)
    }

    func delete(id: UUID) async throws {
        deletedIDs.append(id)
        await deleteSignal.fire()
        try await deleteHandler(id)
    }
}

// MARK: 하네스

/// 전시·상세 ViewModel이 공유하는 의존성 묶음(한 계정 세션 = 같은 조율기·장부·분배기).
@MainActor
struct FeedWorld {
    let topics = FakeTopicRepository()
    let posts = FakePostRepository()
    let likeRepo = FakeLikeRepository()
    let viewer: MutableViewer
    let clock: TestClock
    let broadcaster = LikeEventBroadcaster()
    let coordinator: LikeCoordinator
    let ledger: PostChangeLedger
    let analytics = RecordingAnalytics()

    init(userId: String? = FeedFixtures.userA, now: Date = FeedFixtures.noon(FeedFixtures.today)) {
        viewer = MutableViewer(userId: userId)
        clock = TestClock(now: now)
        coordinator = LikeCoordinator(repository: likeRepo, viewer: viewer, sink: broadcaster)
        ledger = PostChangeLedger(viewer: viewer)
    }

    func makeDisplay(initialDate: KSTDate? = nil, initialSort: PostSort? = nil) -> DisplayViewModel {
        DisplayViewModel(
            topics: topics, posts: posts, likes: coordinator, likeEvents: broadcaster, ledger: ledger,
            viewer: viewer, clock: clock, screenTracker: ScreenTracker(tracker: analytics),
            initialDate: initialDate, initialSort: initialSort
        )
    }

    func makeDetail(_ entry: PostDetailEntry) -> PostDetailViewModel {
        PostDetailViewModel(
            entry: entry, posts: posts, likes: coordinator, likeEvents: broadcaster, ledger: ledger,
            viewer: viewer, clock: clock, screenTracker: ScreenTracker(tracker: analytics)
        )
    }

    /// 상세 응답을 내 게시물/남의 게시물로 설정.
    func setDetail(_ detail: PostDetail) async {
        await posts.setDetailHandler { _ in detail }
    }
}

extension PostPage {
    var ids: [UUID] { posts.map(\.id) }
}

extension Array where Element == PostListItem {
    /// 범위를 벗어나도 크래시하지 않는 id 접근(구현 전에도 테스트가 실패로 끝나게 한다).
    func at(_ index: Int) -> UUID { indices.contains(index) ? self[index].id : UUID() }
}

extension DisplayViewModel {
    func itemID(_ index: Int) -> UUID { items.at(index) }
    func item(_ index: Int) -> PostListItem { items.indices.contains(index) ? items[index] : FeedFixtures.listItem(0) }
    func featuredID(_ index: Int) -> UUID { featured.at(index) }
}
