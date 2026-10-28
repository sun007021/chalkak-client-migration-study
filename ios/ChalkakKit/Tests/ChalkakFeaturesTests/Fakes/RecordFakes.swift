import Foundation
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 기록 탭(REC) 테스트용 Fake와 하네스. 홈의 `RecordingToast`·`RecordingNavigator`·`waitUntil`, 전시의 `Hold`·`FeedFixtures`를 함께 쓴다.

// MARK: 저장소 Fake

/// 월 목록·월별 달력 Fake. 호출을 세고 알린 뒤 핸들러 결과를 돌려준다. 기본 응답은 "월 목록 없음, 모든 달 비어 있음"이다.
actor FakeRecordRepository: RecordCalendarRepository {
    private(set) var monthsCount = 0
    private(set) var requestedMonths: [YearMonth] = []
    let monthsSignal = CallSignal()
    let calendarSignal = CallSignal()
    private var monthsHandler: @Sendable () async throws -> [YearMonth] = { [] }
    private var calendarHandler: @Sendable (YearMonth) async throws -> MonthlyCalendar = {
        MonthlyCalendar(year: $0.year, month: $0.month, posts: [])
    }

    func setMonths(_ handler: @escaping @Sendable () async throws -> [YearMonth]) { monthsHandler = handler }
    func setCalendar(_ handler: @escaping @Sendable (YearMonth) async throws -> MonthlyCalendar) { calendarHandler = handler }

    func months() async throws -> [YearMonth] {
        monthsCount += 1
        await monthsSignal.fire()
        return try await monthsHandler()
    }

    func calendar(_ month: YearMonth) async throws -> MonthlyCalendar {
        requestedMonths.append(month)
        await calendarSignal.fire()
        return try await calendarHandler(month)
    }

    func requestCount(for month: YearMonth) -> Int { requestedMonths.filter { $0 == month }.count }
}

// MARK: 이미지 저장 Fake

actor FakeCalendarRenderer: CalendarImageRendering {
    static let pngSignature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    private(set) var snapshots: [RecordCalendarSnapshot] = []
    private var result: Result<Data, any Error> = .success(pngSignature)

    func setResult(_ result: Result<Data, any Error>) { self.result = result }

    func renderPNG(of snapshot: RecordCalendarSnapshot) async throws -> Data {
        snapshots.append(snapshot)
        return try result.get()
    }
}

actor FakeCalendarSaver: CalendarImageSaving {
    struct Saved: Equatable, Sendable {
        let data: Data
        let fileName: String
    }

    private(set) var saved: [Saved] = []
    let signal = CallSignal()
    private var error: (any Error)?
    private var hold: Hold?

    func setError(_ error: (any Error)?) { self.error = error }
    func setHold(_ hold: Hold?) { self.hold = hold }

    func savePNG(_ data: Data, fileName: String) async throws {
        saved.append(Saved(data: data, fileName: fileName))
        await signal.fire()
        try await hold?.wait()
        if let error { throw error }
    }
}

extension RecordingNavigator: RecordNavigating {}

// MARK: Fixture 빌더 (shared/fixtures/record/* 와 같은 내용)

enum RecordFixtures {
    static let oct = YearMonth(year: 2026, month: 10)
    static let sep = YearMonth(year: 2026, month: 9)
    static let aug = YearMonth(year: 2026, month: 8)
    static let nov = YearMonth(year: 2026, month: 11)

    static let post1020 = UUID(uuidString: "22222222-2222-4222-8222-222222222290")!
    static let post1027Pending = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!
    static let post1031 = UUID(uuidString: "22222222-2222-4222-8222-222222222291")!
    static let post0917 = UUID(uuidString: "22222222-2222-4222-8222-222222222297")!
    static let post0930 = UUID(uuidString: "22222222-2222-4222-8222-222222222296")!

    static func thumbnail(_ postId: UUID) -> URL {
        URL(string: "https://cdn.example.test/posts/\(postId.uuidString.lowercased())/thumbnail.webp")!
    }

    static func post(_ date: KSTDate, _ postId: UUID, _ status: CalendarPostStatus = .approved) -> CalendarPost {
        CalendarPost(topicDate: date, postId: postId, thumbnailImageURL: thumbnail(postId), status: status)
    }

    /// `posts-calendar__2026-10.json`: 10/20 APPROVED, 10/27 PENDING, 10/31 APPROVED
    static var octCalendar: MonthlyCalendar {
        MonthlyCalendar(year: 2026, month: 10, posts: [
            post(kst(2026, 10, 20), post1020),
            post(kst(2026, 10, 27), post1027Pending, .pending),
            post(kst(2026, 10, 31), post1031),
        ])
    }

    /// `posts-calendar__2026-10-shuffled.json`: 같은 데이터를 날짜 내림차순이 아닌 뒤섞인 순서로
    static var octShuffled: MonthlyCalendar {
        MonthlyCalendar(year: 2026, month: 10, posts: [
            post(kst(2026, 10, 27), post1027Pending, .pending),
            post(kst(2026, 10, 31), post1031),
            post(kst(2026, 10, 20), post1020),
        ])
    }

    /// `posts-calendar__2026-10-after-delete.json`: 10/27 게시물이 빠진 응답
    static var octAfterDelete: MonthlyCalendar {
        MonthlyCalendar(year: 2026, month: 10, posts: [
            post(kst(2026, 10, 20), post1020),
            post(kst(2026, 10, 31), post1031),
        ])
    }

    /// `posts-calendar__2026-09.json`: 9/17, 9/30 APPROVED
    static var sepCalendar: MonthlyCalendar {
        MonthlyCalendar(year: 2026, month: 9, posts: [
            post(kst(2026, 9, 17), post0917),
            post(kst(2026, 9, 30), post0930),
        ])
    }

    static func empty(_ month: YearMonth) -> MonthlyCalendar { MonthlyCalendar(year: month.year, month: month.month, posts: []) }

    /// 기본 달력 응답: 10월·9월은 fixture, 나머지는 빈 달.
    static func standardCalendar(_ month: YearMonth) -> MonthlyCalendar {
        switch month {
        case oct: octCalendar
        case sep: sepCalendar
        default: empty(month)
        }
    }
}

// MARK: 하네스

/// 기록 ViewModel 한 벌. 기본은 월 목록 [2026-10, 2026-09], 10월·9월 달력 fixture, 오늘 = 2026-10-27(KST 정오)이다.
@MainActor
struct RecordWorld {
    let repo = FakeRecordRepository()
    let renderer = FakeCalendarRenderer()
    let saver = FakeCalendarSaver()
    let viewer: MutableViewer
    let clock: TestClock
    let toast = RecordingToast()
    let navigator = RecordingNavigator()
    let ledger: PostChangeLedger
    let analytics = RecordingAnalytics()
    let access: MainAccess

    init(guest: Bool = false, now: Date = FeedFixtures.noon(FeedFixtures.today)) {
        access = guest ? .guest : .member
        viewer = MutableViewer(userId: guest ? nil : FeedFixtures.userA)
        clock = TestClock(now: now)
        ledger = PostChangeLedger(viewer: viewer)
    }

    /// 기본 응답을 깔고 ViewModel을 만든다.
    func makeRecord() async -> RecordViewModel {
        await repo.setMonths { [RecordFixtures.oct, RecordFixtures.sep] }
        await repo.setCalendar { RecordFixtures.standardCalendar($0) }
        return RecordViewModel(
            access: access, repository: repo, clock: clock, toast: toast, navigator: navigator,
            renderer: renderer, saver: saver, ledger: ledger, screens: ScreenTracker(tracker: analytics)
        )
    }

    /// 기본 응답으로 한 번 불러온 ViewModel(10월 표시).
    func loadedRecord() async -> RecordViewModel {
        let vm = await makeRecord()
        await vm.recordAppeared()
        return vm
    }
}

extension RecordViewModel {
    /// 보이는 달력의 게시물 id(날짜 오름차순이 아니라 응답 순서).
    var visiblePostIDs: [UUID] { calendar?.posts.map(\.postId) ?? [] }
    var visibleDates: Set<KSTDate> { Set(calendar?.posts.map(\.topicDate) ?? []) }
}
