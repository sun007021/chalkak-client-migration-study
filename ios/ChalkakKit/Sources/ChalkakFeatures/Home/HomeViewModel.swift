import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// 홈 탭(screen_view `home`)의 ViewModel. docs/spec/features/home.md REQ-HOME-001~048.
///
/// 로드
/// - `homeAppeared()`가 처음 불리면 아래를 **병렬로** 시작하고 모두 끝나면 돌아온다. 각 섹션은 자기 응답이 오는 대로 반영되고 서로의 실패에 영향받지 않는다.
///   - 머리글+오늘 인기: `GET /topics?date=<KST 오늘>` → 응답 `topicDate`로 `GET /posts?sort=popular&page=1&pageSize=20`, 서버 순서 앞 5장
///   - 어제 랭킹: 같은 방식으로 KST 어제
///   - 이번 주 기록(로그인만): 오늘이 속한 일~토 7일이 걸친 달마다 `GET /posts/calendar` 후 합친다. 한 달이라도 실패하면 섹션 오류(부분 표시 없음)
///   - 히어로(로그인만): `GET /posts/today` 한 번 → D-06 표
///   - 배너: `BannerListViewModel`(항상 비인증, 게스트도 호출)
///   - 미읽음(로그인만): `GET /notifications/unread-status` (실패는 조용히 무시, 점 유지)
/// - 주제 404: 머리글 `.notReady`, 해당 랭킹 섹션은 오류가 아닌 `.ready([])`("아직 올라온 사진이 없어요").
/// - 게스트는 `/posts/today`, `/posts/calendar`, AI 카드, 미읽음을 부르지 않는다. 히어로는 `.empty(banned: false)`, 주간 기록은 7칸이 모두 빈 `.ready`.
/// - 히어로는 `/posts/today`와 주간 기록 결과로 계산한다: 썸네일은 캘린더의 같은 postId. 캘린더가 실패하거나 postId가 없어도 히어로는 Error가 되지 않고 썸네일만 nil이다.
///   알 수 없는 상태·모순된 응답(디코딩 실패=`invalidResponse`)과 그 밖의 실패는 `.error`, 404 `.noOpenTopic`, 403 `.empty(banned: true)`.
///
/// 새로고침·재로드
/// - `refresh()`(당겨서 새로고침): 보이는 콘텐츠를 유지한 채 `isRefreshing`만 켜고 모든 섹션(배너는 1페이지부터)을 다시 요청한다. 진행 중이면 무시(요청 세트 1회).
///   실패한 섹션은 기존 콘텐츠를 유지하고 새로고침 한 번당 토스트 최대 1건(네트워크 오류는 `FeedCopy.networkError`).
/// - `homeAppeared()`(처음 이후)·`appBecameActive()`: 화면을 비우지 않고 조용히 갱신한다(인디케이터·토스트 없음). 새 세대를 시작하므로 진행 중이던 이전 응답은 버린다.
///   KST 날짜가 마지막으로 불러온 날짜와 다르면 섹션을 `.loading`으로 되돌리는 전체 재로드(오늘·어제·주 범위·히어로)를 한다.
/// - `homeDisappeared()`: 진행 중 요청을 취소한다. 취소는 오류 상태·토스트가 되지 않고 이미 보이는 콘텐츠는 유지된다.
/// - 모든 응답은 시작 시점의 세대와 맞을 때만 반영한다(`reset()`도 세대를 올린다).
///
/// 상호작용(게스트 제한은 ViewModel이 직접 토스트로 막는다. 네트워크 0건):
/// - `heroTapped()`: `.empty(banned: false)` 회원 → `navigator.startUpload()`. 정지(`banned: true`) → 토스트 `home.hero.banned`, 요청·이동 없음. 게스트 → 토스트 `home.guest.upload`. 그 밖의 상태(사진 포함)는 아무 일도 없다.
/// - `rankingItemTapped`: 회원 → `openFeed(.listItem(item))`, 게스트 → 토스트 `home.guest.feed`. `moreTapped`: 오늘 인기/어제 랭킹 날짜의 `openDisplay(date:sort:.popular)`.
/// - `weekDayTapped(date)`: 기록이 있는 칸만 `openRecord(date:)`, 빈 칸은 무시. `weekMoreTapped()`: `openRecord(date: nil)`.
/// - `notificationTapped()`: 회원 `openNotifications()`, 게스트 토스트 `home.guest.notification`(미읽음 조회도 안 함). `bannerTapped`: 게스트도 `openIssue(url:)`.
/// - `retry(_:)`: 해당 섹션만 다시 요청한다(`.loading`으로 돌아간 뒤).
/// - `notificationsClosed()`·`pushReceived()`: 미읽음만 다시 조회한다.
/// - AI 카드: `aiCardPostId`는 히어로가 APPROVED 사진이고 그 응답의 `topicDate`가 KST 오늘일 때만 값이 있다(PENDING·VALIDATING·Empty·게스트·지난 주제는 nil).
/// - `PostChangeLedger`에 삭제·비공개가 기록되면 즉시 두 랭킹·주간 기록 칸에서 빼고, 히어로가 그 게시물이면 `.empty(banned: false)`로 바꾼다.
@MainActor
@Observable
public final class HomeViewModel: PostChangeObserver {
    public private(set) var topicHeader: TopicHeaderState = .loading
    public private(set) var week: SectionState<WeekRecord> = .loading
    /// 어제 랭킹 (`home.ranking-*`)
    public private(set) var ranking: SectionState<[PostListItem]> = .loading
    /// 오늘 인기있는 사진 (`home.popular-*`)
    public private(set) var popular: SectionState<[PostListItem]> = .loading
    public let banners: BannerListViewModel
    public private(set) var hasUnread = false
    public private(set) var isRefreshing = false
    /// 회원 전용 호출이 갱신 후에도 401이라 로그인 화면으로 가야 한다.
    public private(set) var needsLogin = false
    /// 마지막으로 불러오기 시작한 KST 오늘(자정 넘김 판정 기준). 아직 안 불렀으면 nil.
    public private(set) var loadedDate: KSTDate?
    public private(set) var access: MainAccess

    /// `GET /posts/today` 결과(히어로의 원천). 화면에 보이는 `hero`는 여기에 주간 기록의 썸네일을 합쳐 계산한다.
    private enum TodayResult: Equatable {
        case loading
        case status(TodayPostStatus)
        case noOpenTopic
        case banned
        case error
    }

    /// 로드 방식: `initial`은 실패를 섹션 오류로 보이고, `quiet`은 이미 보이는 콘텐츠를 실패로 지우지 않는다.
    private enum LoadMode { case initial, quiet }

    /// 응답을 버릴지 판정하는 단위(섹션별로 따로 다시 시도할 수 있다).
    private enum Slot: CaseIterable { case hero, week, ranking, popular, unread }

    private var today: TodayResult = .loading

    private var kstToday: KSTDate { KST.date(of: clock.now) }
    private var weekRecordValue: WeekRecord? {
        if case let .ready(record) = week { record } else { nil }
    }
    private func listItems(_ slot: Slot) -> [PostListItem]? {
        if case let .ready(items) = list(slot) { items } else { nil }
    }

    public var hero: HeroState {
        guard access == .member else { return .empty(banned: false) }
        switch today {
        case .loading: return .loading
        case .noOpenTopic: return .noOpenTopic
        case .banned: return .empty(banned: true)
        case .error: return .error
        case let .status(status):
            guard status.isPosted, let postId = status.postId, let moderation = status.moderationStatus else { return .empty(banned: false) }
            switch moderation {
            case .validating: return .processing
            case .pending: return .photo(postId: postId, thumbnailURL: thumbnail(of: postId), isPending: true)
            case .approved: return .photo(postId: postId, thumbnailURL: thumbnail(of: postId), isPending: false)
            }
        }
    }

    /// 히어로 문구: loading "오늘의 주제를 불러오는 중", noOpenTopic, empty `"{주제}" 사진을 공유하지 않았어요`(주제 제목은 머리글에서, 없으면 "오늘의 주제"), processing, error. 사진(photo)은 빈 문자열.
    public var heroText: String {
        switch hero {
        case .loading: HomeCopy.topicLoading
        case .noOpenTopic: HomeCopy.heroNoOpenTopic
        case .empty:
            if case let .ready(_, title) = topicHeader { HomeCopy.heroEmpty(topicTitle: title) } else { HomeCopy.heroEmpty(topicTitle: nil) }
        case .processing: HomeCopy.heroProcessing
        case .error: HomeCopy.heroError
        case .photo: ""
        }
    }

    public var aiCardPostId: UUID? {
        guard access == .member, case let .status(status) = today, status.isPosted, status.moderationStatus == .approved,
              status.topicDate == kstToday else { return nil }
        return status.postId
    }

    @ObservationIgnored private let repositories: HomeRepositories
    @ObservationIgnored private let clock: any AppClock
    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let navigator: any HomeNavigating
    @ObservationIgnored private let ledger: PostChangeLedger?
    @ObservationIgnored private let screens: ScreenTracker?
    @ObservationIgnored private let work = ActiveWork()
    @ObservationIgnored private var revisions: [Slot: Int] = [:]
    /// 새로고침 한 번을 구분한다. 새 세대·화면 이탈·초기화가 올리면 이전 새로고침은 토스트도 인디케이터 해제도 하지 않는다.
    @ObservationIgnored private var refreshRun = 0
    @ObservationIgnored private var loadedYesterday: KSTDate?

    /// 한 번의 로드에서 모든 섹션이 함께 쓰는 날짜(로드 도중 자정을 넘겨도 섹션끼리 어긋나지 않는다).
    private struct LoadDates {
        let today: KSTDate
        let yesterday: KSTDate
    }

    /// 다시 시도는 마지막 로드의 날짜를 그대로 쓴다.
    private var lastDates: LoadDates {
        LoadDates(today: loadedDate ?? kstToday, yesterday: loadedYesterday ?? Self.yesterday(of: clock))
    }

    public init(
        access: MainAccess, repositories: HomeRepositories, clock: any AppClock,
        toast: any ToastPresenting, navigator: any HomeNavigating, ledger: PostChangeLedger? = nil,
        screens: ScreenTracker? = nil
    ) {
        self.access = access
        self.repositories = repositories
        self.clock = clock
        self.toast = toast
        self.navigator = navigator
        self.ledger = ledger
        self.screens = screens
        banners = BannerListViewModel(repository: repositories.banners)
        ledger?.addObserver(self)
    }

    // MARK: 생명주기

    public func homeAppeared() async {
        screens?.screenAppeared(.home)
        await reload()
    }

    /// 화면 이탈: 진행 중 요청을 취소한다. 취소는 오류가 아니고 이미 보이는 콘텐츠는 유지된다.
    public func homeDisappeared() {
        supersedeRuns()
        banners.cancel()
    }

    public func appBecameActive() async {
        guard loadedDate != nil else { return }
        await reload()
    }

    /// 당겨서 새로고침: 보이는 콘텐츠를 유지한 채 모든 섹션을 다시 요청하고, 실패하면 토스트를 최대 1건 띄운다.
    public func refresh() async {
        guard !isRefreshing else { return }
        supersedeRuns()
        let mode = prepareLoad()
        refreshRun += 1
        let run = refreshRun
        isRefreshing = true
        var failures: [(HomeSection, FeedFailure)] = []
        await work.run { [self] in failures = await loadAll(mode: mode, refreshing: true) }
        guard run == refreshRun else { return }
        isRefreshing = false
        if !Task.isCancelled, let text = toastText(for: failures) { toast.show(text) }
    }

    public func retry(_ section: HomeSection) async {
        let dates = lastDates
        await work.run { [self] in
            switch section {
            case .hero:
                guard access == .member else { return }
                today = .loading
                _ = await loadHero(mode: .initial)
            case .week:
                week = .loading
                _ = await loadWeek(dates: dates, mode: .initial)
            case .ranking:
                ranking = .loading
                _ = await loadRanking(.ranking, dates: dates, mode: .initial)
            case .popular:
                popular = .loading
                topicHeader = .loading
                _ = await loadRanking(.popular, dates: dates, mode: .initial)
            case .issue:
                await banners.retry()
            }
        }
    }

    public func notificationsClosed() async { await work.run { [self] in await loadUnread() } }
    public func pushReceived() async { await work.run { [self] in await loadUnread() } }

    public func consumeNeedsLogin() { needsLogin = false }

    /// 로그아웃·계정 전환: 진행 중 요청을 취소하고 모든 상태를 처음으로 되돌린다. 이전 계정의 늦은 응답은 버린다.
    /// 접근 모드가 바뀌면(게스트 ↔ 회원) `access`로 알려 준다.
    public func reset(access newAccess: MainAccess? = nil) {
        supersedeRuns()
        banners.reset()
        if let newAccess { access = newAccess }
        topicHeader = .loading
        week = .loading
        ranking = .loading
        popular = .loading
        today = .loading
        hasUnread = false
        needsLogin = false
        loadedDate = nil
        loadedYesterday = nil
    }

    // MARK: 상호작용

    public func heroTapped() async {
        if access == .guest {
            toast.show(HomeCopy.guestUpload)
            return
        }
        switch hero {
        case .empty(banned: false): await navigator.startUpload()
        case .empty(banned: true): toast.show(HomeCopy.heroBanned)
        default: break
        }
    }

    public func rankingItemTapped(_ item: PostListItem) {
        if access == .guest {
            toast.show(HomeCopy.guestFeed)
        } else {
            navigator.openFeed(.listItem(item))
        }
    }

    public func moreTapped(_ section: HomeSection) {
        let todayDate = loadedDate ?? kstToday
        switch section {
        case .popular: navigator.openDisplay(date: todayDate, sort: .popular)
        case .ranking: navigator.openDisplay(date: loadedYesterday ?? Self.yesterday(of: clock), sort: .popular)
        default: break
        }
    }

    public func weekDayTapped(_ date: KSTDate) {
        guard let day = weekRecordValue?.days.first(where: { $0.date == date }), day.post != nil else { return }
        navigator.openRecord(date: date)
    }

    public func weekMoreTapped() { navigator.openRecord(date: nil) }

    public func notificationTapped() {
        if access == .guest {
            toast.show(HomeCopy.guestNotification)
        } else {
            navigator.openNotifications()
        }
    }

    public func bannerTapped(_ banner: Banner) { navigator.openIssue(url: banner.webViewURL) }

    // MARK: 삭제·비공개 반영

    public func postChangeLedger(didRecord change: PostChange) {
        switch change {
        case let .deleted(postId), let .unavailable(postId):
            remove(postId)
        case let .titleChanged(postId, title):
            for slot in [Slot.ranking, .popular] {
                guard case var .ready(items) = list(slot) else { continue }
                for index in items.indices where items[index].id == postId { items[index].title = title }
                setList(slot, .ready(items))
            }
        }
    }

    // MARK: 불러오기

    /// 처음이면 전체를, 이후에는 화면을 비우지 않고 조용히 갱신한다. 날짜가 바뀌었으면 섹션을 비우고 전체 재로드한다.
    private func reload() async {
        supersedeRuns()
        let mode = prepareLoad()
        await work.run { [self] in _ = await loadAll(mode: mode, refreshing: false) }
    }

    /// KST 날짜가 마지막으로 불러온 날짜와 다르면 이전 날짜 콘텐츠를 비운다(전체 재로드는 `initial`).
    private func prepareLoad() -> LoadMode {
        guard let loaded = loadedDate else { return .initial }
        guard loaded != kstToday else { return .quiet }
        topicHeader = .loading
        week = .loading
        ranking = .loading
        popular = .loading
        today = .loading
        return .initial
    }

    /// 이전 세대의 요청을 취소하고 늦은 응답을 버리게 한다.
    private func supersedeRuns() {
        for slot in Slot.allCases { revisions[slot, default: 0] += 1 }
        refreshRun += 1
        isRefreshing = false
        work.cancel()
    }

    private func loadAll(mode: LoadMode, refreshing: Bool) async -> [(HomeSection, FeedFailure)] {
        let dates = LoadDates(today: kstToday, yesterday: Self.yesterday(of: clock))
        loadedDate = dates.today
        loadedYesterday = dates.yesterday
        async let hero = loadHero(mode: mode)
        async let week = loadWeek(dates: dates, mode: mode)
        async let ranking = loadRanking(.ranking, dates: dates, mode: mode)
        async let popular = loadRanking(.popular, dates: dates, mode: mode)
        async let issue = loadBanners()
        async let unread: Void = loadUnread()
        let failures = await [hero, week, ranking, popular, issue]
        await unread
        return failures.compactMap { $0 }
    }

    private func loadHero(mode: LoadMode) async -> (HomeSection, FeedFailure)? {
        guard access == .member else { return nil }
        let revision = begin(.hero)
        do {
            let status = try await repositories.today.todayStatus()
            guard isCurrent(.hero, revision) else { return nil }
            today = .status(withoutRemovedPost(status))
            return nil
        } catch {
            guard isCurrent(.hero, revision), !error.isCancellation else { return nil }
            let failure = Self.failure(error)
            switch failure {
            case .notFound:
                today = .noOpenTopic
                return nil
            case .banned:
                today = .banned
                return nil
            default:
                if failure == .unauthorized { needsLogin = true }
                if mode == .initial || today == .loading || today == .error { today = .error }
                return (.hero, failure)
            }
        }
    }

    private func loadWeek(dates snapshot: LoadDates, mode: LoadMode) async -> (HomeSection, FeedFailure)? {
        let dates = KST.week(containing: snapshot.today)
        guard access == .member else {
            week = .ready(weekRecord(dates: dates, posts: []))
            return nil
        }
        let revision = begin(.week)
        let repository = repositories.calendar
        do {
            // 한 달이라도 실패하면 부분 표시 없이 섹션 오류다.
            let months = try await withThrowingTaskGroup(of: MonthlyCalendar.self) { group in
                for month in KST.months(spannedBy: dates) {
                    group.addTask { try await repository.month(month) }
                }
                var all: [MonthlyCalendar] = []
                for try await month in group { all.append(month) }
                return all
            }
            guard isCurrent(.week, revision) else { return nil }
            week = .ready(weekRecord(dates: dates, posts: months.flatMap(\.posts)))
            return nil
        } catch {
            guard isCurrent(.week, revision), !error.isCancellation else { return nil }
            let failure = Self.failure(error)
            if failure == .unauthorized { needsLogin = true }
            if mode == .initial || weekRecordValue == nil { week = .failed(HomeCopy.weeklyError) }
            return (.week, failure)
        }
    }

    /// `.popular`는 오늘, `.ranking`은 어제의 주제를 받아 인기순 앞 5장을 담는다. 오늘 쪽은 머리글도 함께 채운다.
    private func loadRanking(_ slot: Slot, dates: LoadDates, mode: LoadMode) async -> (HomeSection, FeedFailure)? {
        let isToday = slot == .popular
        let section: HomeSection = isToday ? .popular : .ranking
        let date = isToday ? dates.today : dates.yesterday
        let revision = begin(slot)
        let title = isToday ? HomeCopy.rankingTodayTitle : HomeCopy.rankingYesterdayTitle
        // 1단계: 주제. 실패하면 머리글(오늘)과 섹션이 함께 바뀐다.
        let topic: Topic
        do {
            topic = try await repositories.topics.topic(on: date)
        } catch {
            guard isCurrent(slot, revision), !error.isCancellation else { return nil }
            let failure = Self.failure(error)
            if failure == .notFound {
                setList(slot, .ready([]))
                if isToday { topicHeader = .notReady }
                return nil
            }
            if failure == .unauthorized { needsLogin = true }
            if mode == .initial || listItems(slot) == nil {
                setList(slot, .failed(HomeCopy.rankingError(sectionTitle: title)))
            }
            if isToday, mode == .initial || !topicHeader.isReady { topicHeader = .failed }
            return (section, failure)
        }
        guard isCurrent(slot, revision) else { return nil }
        if isToday { topicHeader = .ready(dateLabel: HomeCopy.topicHeader(date), title: topic.title) }

        // 2단계: 목록. 실패는 머리글을 건드리지 않고 이 섹션에만 반영한다.
        do {
            let page = try await repositories.posts.list(PostListQuery(topicDate: topic.topicDate, sort: .popular, page: 1, pageSize: AppConstants.pageSize))
            guard isCurrent(slot, revision) else { return nil }
            let items = page.posts.filter { !(ledger?.isRemoved($0.id) ?? false) }.prefix(5)
            setList(slot, .ready(Array(items)))
            return nil
        } catch {
            guard isCurrent(slot, revision), !error.isCancellation else { return nil }
            let failure = Self.failure(error)
            if failure == .notFound {
                setList(slot, .ready([]))
                return nil
            }
            if failure == .unauthorized { needsLogin = true }
            if mode == .initial || listItems(slot) == nil {
                setList(slot, .failed(HomeCopy.rankingError(sectionTitle: title)))
            }
            return (section, failure)
        }
    }

    private func loadBanners() async -> (HomeSection, FeedFailure)? {
        switch banners.state {
        case .items, .hidden:
            guard let failure = await banners.refresh() else { return nil }
            return (.issue, failure)
        case .loading:
            await banners.loadFirstPage()
        case .failed:
            await banners.retry()
        }
        return nil
    }

    /// 실패는 조용히 무시하고 점은 직전 값을 유지한다.
    private func loadUnread() async {
        guard access == .member else { return }
        let revision = begin(.unread)
        do {
            let status = try await repositories.unread.unreadStatus()
            guard isCurrent(.unread, revision) else { return }
            hasUnread = status.hasUnread
        } catch {
            guard isCurrent(.unread, revision), !error.isCancellation else { return }
            if Self.failure(error) == .unauthorized { needsLogin = true }
        }
    }

    // MARK: 내부 보조

    private func begin(_ slot: Slot) -> Int {
        let next = (revisions[slot] ?? 0) + 1
        revisions[slot] = next
        return next
    }

    private func isCurrent(_ slot: Slot, _ revision: Int) -> Bool {
        revisions[slot] == revision && !Task.isCancelled
    }

    private func list(_ slot: Slot) -> SectionState<[PostListItem]> { slot == .popular ? popular : ranking }

    private func setList(_ slot: Slot, _ state: SectionState<[PostListItem]>) {
        if slot == .popular { popular = state } else { ranking = state }
    }

    private static func failure(_ error: any Error) -> FeedFailure {
        error as? FeedFailure ?? .invalidResponse
    }

    /// 어제(KST). KST는 고정 오프셋이라 24시간을 빼도 날짜 하나가 정확히 줄어든다.
    private static func yesterday(of clock: any AppClock) -> KSTDate {
        KST.date(of: clock.now.addingTimeInterval(-86_400))
    }

    /// 히어로 썸네일은 이번 주 기록의 같은 postId에서 찾고 없으면 nil(대체 배경).
    private func thumbnail(of postId: UUID) -> URL? {
        weekRecordValue?.days.lazy.compactMap(\.post).first { $0.postId == postId }?.thumbnailImageURL
    }

    /// 삭제·비공개로 확인된 내 게시물이면 미등록으로 본다(늦은 응답이 되살리지 못하게).
    private func withoutRemovedPost(_ status: TodayPostStatus) -> TodayPostStatus {
        guard let postId = status.postId, ledger?.isRemoved(postId) == true else { return status }
        return TodayPostStatus(topicDate: status.topicDate, isPosted: false, postId: nil, moderationStatus: nil)
    }

    private func weekRecord(dates: [KSTDate], posts: [CalendarPost]) -> WeekRecord {
        let days = dates.enumerated().map { index, date in
            let post = posts.first { $0.topicDate == date && !(ledger?.isRemoved($0.postId) ?? false) }
            return WeekDay(date: date, weekdayLabel: HomeCopy.weekdayLabels[index], post: post)
        }
        return WeekRecord(days: days)
    }

    private func remove(_ postId: UUID) {
        for slot in [Slot.ranking, .popular] {
            if case let .ready(items) = list(slot) { setList(slot, .ready(items.filter { $0.id != postId })) }
        }
        if case let .ready(record) = week {
            let days = record.days.map { day in
                day.post?.postId == postId ? WeekDay(date: day.date, weekdayLabel: day.weekdayLabel, post: nil) : day
            }
            week = .ready(WeekRecord(days: days))
        }
        if case let .status(status) = today, status.postId == postId {
            today = .status(TodayPostStatus(topicDate: status.topicDate, isPosted: false, postId: nil, moderationStatus: nil))
        }
    }

    /// 새로고침 한 번에 토스트는 최대 1건. 연결 실패가 하나라도 있으면 네트워크 문구, 아니면 처음 실패한 섹션의 문구.
    private func toastText(for failures: [(HomeSection, FeedFailure)]) -> String? {
        let shown = failures.filter { $0.1 != .unauthorized }
        guard let first = shown.first else { return nil }
        if shown.contains(where: { $0.1 == .network }) { return FeedCopy.networkError }
        switch first.0 {
        case .hero: return HomeCopy.heroError
        case .week: return HomeCopy.weeklyError
        case .ranking: return HomeCopy.rankingError(sectionTitle: HomeCopy.rankingYesterdayTitle)
        case .popular: return HomeCopy.rankingError(sectionTitle: HomeCopy.rankingTodayTitle)
        case .issue: return HomeCopy.issueError
        }
    }
}
