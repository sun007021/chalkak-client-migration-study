import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// 전시 탭(날짜 이동·정렬·페이징·아카이브 추천 카드·좋아요)의 ViewModel. screen_view `display`.
///
/// 규칙 요약(구현 기준은 docs/spec/features/display-feed.md, 테스트는 DisplayViewModel*Tests):
/// - 로드 = `GET /topics?date=` → 응답 `topicDate`로 `GET /posts`. (날짜, 정렬) 단위로 캐시한다.
/// - 오늘이면 `.latest`(정렬 탭 3개), 지난 날짜면 `.archive`(popular 고정, 상위 5장 추천 + 전체 그리드).
/// - 날짜 이동은 `pendingDate`로 누적하고(연타) 성공해야 `selectedDate`가 바뀐다. 실패·404는 보던 전시를 유지하고 토스트.
/// - 오래된 응답은 `selectedDate`·`sort`와 맞는 것만 화면에 반영한다(캐시에는 남긴다).
/// - 좋아요는 `LikeCoordinator`에 맡기고 목록 응답은 `beginRevalidation()`/`merge`로 거친다.
/// - 토스트는 화면이 보일 때(`onAppear`~`onDisappear`)만 띄운다(D-20). 취소는 오류가 아니다.
@MainActor
@Observable
public final class DisplayViewModel {
    public enum State: Sendable, Equatable {
        /// 첫 로딩(보이는 사진 없음). 날짜 이동이 막힌다.
        case loading
        case loaded
        /// 주제 404이거나 사진 0장(첫 로딩/보이는 전시가 없을 때). "이 날 올라온 사진이 없어요".
        case empty
        /// 보이는 사진이 없을 때의 실패. 요청한 날짜를 유지하고 "다시 시도"를 보인다.
        case failed(Notice)
    }

    public enum Mode: Sendable, Equatable {
        case latest
        case archive
    }

    public enum OpenPostResult: Sendable, Equatable {
        /// 상세로 간다(시드 = 지금 화면에 보이는 값).
        case open(PostDetailEntry)
        /// 게스트: 이동하지 않고 토스트만(D-05).
        case blocked
    }

    /// 아카이브 추천 카드 수(FEATURED_PHOTO_COUNT).
    public static let featuredCount = 5
    /// 끝에서 이만큼 안쪽(마지막 3개 이내)에 닿으면 다음 페이지를 요청한다.
    public static let prefetchThreshold = 3

    // MARK: 상태

    public private(set) var state: State = .loading
    /// 화면에 그려진 전시의 날짜. 첫 로딩 중에는 요청한 날짜.
    public private(set) var selectedDate: KSTDate
    /// 이동 중인 목표 날짜(연타 누적의 기준). 성공하면 `selectedDate`가 되고 실패하면 비운다.
    public private(set) var pendingDate: KSTDate?
    /// 이동·선택 상한(KST 오늘). `onAppear`마다 시계로 다시 계산한다(D-19).
    public private(set) var upperBound: KSTDate
    /// 이동·선택 하한(FIRST_TOPIC_DATE). 서버 404여도 바꾸지 않는다.
    public var lowerBound: KSTDate { AppConstants.firstTopicDate }
    /// 지금 보여 주는 콘텐츠의 모드. 로드할 때마다 `selectedDate`와 오늘로 정한다(자정을 넘겨도 다음 로드부터 바뀐다).
    public private(set) var mode: Mode = .latest
    /// 요청에 쓰는 정렬. 아카이브는 `.popular`.
    public private(set) var sort: PostSort
    /// 오늘에서 고른 정렬(지난 날짜에 갔다 오면 복원한다).
    public private(set) var preferredSort: PostSort
    public private(set) var topic: Topic?
    /// 그리드 항목(좋아요 값은 조율기 병합 결과). 페이지를 누적한다.
    public private(set) var items: [PostListItem] = []
    public private(set) var hasNext = false
    /// 첫 페이지 재검증(정렬 변경, 탭 재선택, 피드 복귀, 날짜 이동 중 아님) 진행 중.
    public private(set) var isRefreshing = false
    public private(set) var isPaging = false
    /// 아카이브 추천 카드 페이저의 현재 페이지.
    public private(set) var featuredPage = 0
    public private(set) var toast: Notice?
    /// 전시 탭 재선택 때마다 올라가는 토큰(View가 맨 위로 스크롤).
    public private(set) var scrollToTopToken = 0
    /// 토큰 갱신 후에도 401(재인증 필요)이라 로그인 화면으로 보내야 한다.
    public private(set) var needsLogin = false

    /// 오늘이면 정렬 탭 3개(최신순·인기순·랜덤순), 아카이브면 없음.
    public var availableSorts: [PostSort] { mode == .latest ? PostSort.allCases : [] }
    /// 아카이브면 상위 5장(`featuredCount`), 오늘이면 빈 배열.
    public var featured: [PostListItem] { mode == .archive ? Array(items.prefix(Self.featuredCount)) : [] }
    /// 첫 로딩(`state == .loading`) 중에는 날짜 이동을 막는다.
    public var isNavigationEnabled: Bool { state != .loading }
    public var canGoPrevious: Bool { isNavigationEnabled && (pendingDate ?? selectedDate) > lowerBound }
    public var canGoNext: Bool { isNavigationEnabled && (pendingDate ?? selectedDate) < upperBound }
    /// 머리글 설명: 오늘 "같은 주제에서 다른 시선을 느껴보세요", 아카이브 "가장 사람들이 좋아했던 사진들이에요".
    public var headerDescription: String { mode == .latest ? DisplayCopy.descLatest : DisplayCopy.descArchive }

    // MARK: 의존성

    private let topics: any TopicRepository
    private let posts: any PostRepository
    private let likes: LikeCoordinator
    private let likeEvents: LikeEventBroadcaster
    private let ledger: PostChangeLedger
    private let viewer: any ViewerContext
    private let clock: any AppClock
    private let screenTracker: ScreenTracker?

    // MARK: 내부 상태(화면이 읽지 않는다)

    private struct Key: Hashable {
        let date: KSTDate
        let sort: PostSort
    }

    /// (날짜, 정렬) 하나의 캐시. 첫 페이지(`head`)와 이어 붙인 뒤쪽 페이지(`tail`)를 따로 둬 첫 페이지 재검증이 뒤쪽을 건드리지 않는다.
    private struct Cached {
        var head: [PostListItem]
        var tail: [PostListItem] = []
        var hasNext: Bool
        var nextPage: Int
        var seed: String?
        var all: [PostListItem] { head + tail }

        mutating func update(_ postId: UUID, _ change: (inout PostListItem) -> Void) {
            for index in head.indices where head[index].id == postId { change(&head[index]) }
            for index in tail.indices where tail[index].id == postId { change(&tail[index]) }
        }

        mutating func remove(_ postId: UUID) {
            head.removeAll { $0.id == postId }
            tail.removeAll { $0.id == postId }
        }
    }

    /// 열 때 지정받은 정렬. 뷰어가 바뀌면 이 값으로 돌아간다(탭에서 고른 정렬 선호는 버린다).
    @ObservationIgnored private let initialSort: PostSort
    /// 지금 `items`가 속한 (날짜, 정렬)과 그때의 모드. 재검증이 실패하면 이쪽으로 되돌린다.
    @ObservationIgnored private var displayedKey: Key?
    @ObservationIgnored private var displayedMode: Mode = .latest
    @ObservationIgnored private var cache: [Key: Cached] = [:]
    @ObservationIgnored private let work = ActiveWork()
    @ObservationIgnored private var notices = NoticeSequence()
    @ObservationIgnored private var isVisible = false
    @ObservationIgnored private var owner: String?
    /// 뷰어가 바뀔 때마다 올라간다. 이전 계정의 늦은 응답을 알아보는 데 쓴다.
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var refreshToken = 0
    @ObservationIgnored private var pageToken = 0
    @ObservationIgnored private var initialLoadID = 0
    @ObservationIgnored private var activeInitialLoad: Int?

    /// - Parameters:
    ///   - initialDate: 다른 화면이 날짜를 지정해 열 때(홈 더보기, 기록, 업로드 성공). 없으면 KST 오늘.
    ///   - initialSort: 지정해 열 때의 정렬(홈 더보기는 `.popular`). 없으면 최신순.
    public init(
        topics: any TopicRepository, posts: any PostRepository,
        likes: LikeCoordinator, likeEvents: LikeEventBroadcaster, ledger: PostChangeLedger,
        viewer: any ViewerContext, clock: any AppClock, screenTracker: ScreenTracker?,
        initialDate: KSTDate? = nil, initialSort: PostSort? = nil
    ) {
        self.topics = topics
        self.posts = posts
        self.likes = likes
        self.likeEvents = likeEvents
        self.ledger = ledger
        self.viewer = viewer
        self.clock = clock
        self.screenTracker = screenTracker
        let today = KST.date(of: clock.now)
        upperBound = today
        selectedDate = initialDate ?? today
        sort = initialSort ?? .recent
        preferredSort = initialSort ?? .recent
        self.initialSort = initialSort ?? .recent
        owner = viewer.userId?.lowercased()
        likeEvents.subscribe(self)
        ledger.addObserver(self)
    }

    // MARK: 생명주기

    /// 화면이 보일 때: 보임 표시 + `screen_view(display)` + 뷰어 변경 감지(바뀌었으면 캐시·시드·정렬 선호를 버리고 처음부터)
    /// + 상한 재계산 + 처음이면 로드, 이미 불러왔으면 재검증(피드·다른 탭에서 복귀, 보던 위치·정렬 유지).
    public func onAppear() async {
        isVisible = true
        screenTracker?.screenAppeared(.display)
        resetIfViewerChanged()
        upperBound = KST.date(of: clock.now)
        if state == .loaded { await revalidate() } else { await loadInitial() }
    }

    /// 화면이 사라질 때: 보임 해제, 진행 중 요청 취소(결과를 버리고 오류·토스트 없음). 재진입하면 다시 로드/재검증.
    public func onDisappear() {
        isVisible = false
        work.cancel()
        // 취소를 무시하고 늦게 끝나는 요청은 버리고(세대), 재진입이 다시 로드/재검증할 수 있게 진행 표시를 비운다.
        generation += 1
        refreshToken += 1
        pageToken += 1
        activeInitialLoad = nil
        pendingDate = nil
        isRefreshing = false
        isPaging = false
    }

    /// 전시 탭을 다시 누름: `scrollToTopToken` 증가 + 기존 전시를 유지한 채 첫 페이지 재검증(성공 교체, 실패 유지 + 토스트).
    public func tabReselected() async {
        scrollToTopToken += 1
        switch state {
        case .loaded: await revalidate()
        case .empty, .failed: await loadInitial()
        case .loading: break
        }
    }

    /// 오류 화면의 "다시 시도": 요청했던 같은 날짜·정렬로 다시 로드한다.
    public func retry() async {
        guard case .failed = state else { return }
        await loadInitial()
    }

    // MARK: 날짜

    public func goToPreviousDay() async {
        guard isNavigationEnabled else { return }
        let target = Self.day(before: pendingDate ?? selectedDate)
        guard target >= lowerBound else { return }
        await navigate(to: target)
    }

    public func goToNextDay() async {
        guard isNavigationEnabled else { return }
        let target = Self.day(after: pendingDate ?? selectedDate)
        guard target <= upperBound else { return }
        await navigate(to: target)
    }

    /// 날짜 선택. 범위 밖이면 가장 가까운 끝으로 맞추고(하한~상한), 지금 보는 날짜와 같으면 요청하지 않는다.
    public func select(date: KSTDate) async {
        guard isNavigationEnabled else { return }
        let target = min(max(date, lowerBound), upperBound)
        guard target != (pendingDate ?? selectedDate) else { return }
        await navigate(to: target)
    }

    /// 날짜 선택 시트의 연 목록(하한 연도~상한 연도).
    public var pickerYears: [Int] { Array(lowerBound.year...max(lowerBound.year, upperBound.year)) }
    /// 그 해에 고를 수 있는 월(첫 해는 하한 월부터, 마지막 해는 상한 월까지).
    public func pickerMonths(year: Int) -> [Int] {
        let first = year == lowerBound.year ? lowerBound.month : 1
        let last = year == upperBound.year ? upperBound.month : 12
        return first <= last ? Array(first...last) : []
    }
    /// 그 달에 고를 수 있는 일(첫 달은 하한 일부터, 마지막 달은 상한 일까지, 사이 달은 말일까지).
    public func pickerDays(year: Int, month: Int) -> [Int] {
        let first = (year, month) == (lowerBound.year, lowerBound.month) ? lowerBound.day : 1
        let last = (year, month) == (upperBound.year, upperBound.month) ? upperBound.day : Self.lastDay(year: year, month: month)
        return first <= last ? Array(first...last) : []
    }
    /// 휠이 가리킨 연·월·일 → 날짜. 없는 날(2월 30일)은 말일로, 범위 밖이면 가까운 끝으로 맞춘다.
    public func resolvedPickerDate(year: Int, month: Int, day: Int) -> KSTDate {
        guard let date = KSTDate.clamped(year: year, month: month, day: day) else { return selectedDate }
        return min(max(date, lowerBound), upperBound)
    }

    // MARK: 정렬·페이징

    /// 오늘(`.latest`)에서만 동작한다. 새 결과가 올 때까지 기존 사진을 유지하고, 본 적 있는 (날짜, 정렬)은 캐시를 즉시 보여 준 뒤 재검증한다.
    public func selectSort(_ sort: PostSort) async {
        guard mode == .latest, sort != self.sort, state == .loaded || state == .empty else { return }
        preferredSort = sort
        await revalidate()
    }

    /// 그리드 셀이 보일 때 부른다. 마지막 `prefetchThreshold`개 이내이고 `hasNext`이며 다른 요청(페이징·재검증)이 없을 때만 다음 페이지를 요청한다.
    public func itemAppeared(_ postId: UUID) async {
        guard state == .loaded, hasNext, !isPaging, !isRefreshing,
              let index = items.firstIndex(where: { $0.id == postId }),
              index >= items.count - Self.prefetchThreshold,
              let cached = cache[currentKey] else { return }
        // 시드를 잃은 랜덤은 서버가 400이므로 요청하지 않고 연속 로딩을 멈춘다.
        if sort == .random, !PostListQuery.isValidRandomSeed(cached.seed) { return }
        let key = currentKey
        pageToken += 1
        let token = pageToken
        isPaging = true
        await work.run { [self] in
            await loadNextPage(key: key, page: cached.nextPage, seed: cached.seed, token: token)
        }
    }

    /// 추천 카드 페이저의 현재 페이지(같은 날짜 재검증에서는 유지, 다른 날짜로 가면 0).
    public func setFeaturedPage(_ page: Int) {
        featuredPage = min(max(page, 0), max(featured.count - 1, 0))
    }

    // MARK: 사진·좋아요

    /// 사진 탭. 게스트는 API 없이 토스트 `guest.feed`와 `.blocked`, 로그인 사용자는 목록 값을 시드로 한 `.open`.
    public func openPost(_ postId: UUID) -> OpenPostResult {
        if viewer.isGuest {
            showToast(FeedCopy.guestFeed)
            return .blocked
        }
        guard let item = items.first(where: { $0.id == postId }) else { return .blocked }
        return .open(.listItem(item))
    }

    /// 하트 탭(그리드·추천 카드 공통). 조율기에 넘기고 같은 사진의 두 카드가 같은 값을 갖는다.
    public func likeTapped(_ postId: UUID) {
        guard let item = items.first(where: { $0.id == postId }) else { return }
        likes.tap(postId: postId, current: item.like)
    }

    public func dismissToast() {
        toast = nil
    }

    /// 앱이 `needsLogin`을 처리(로그인 화면으로 이동)한 뒤 비운다.
    public func consumeNeedsLogin() {
        needsLogin = false
    }

    // MARK: 로드

    /// 보이는 사진이 없을 때의 로드(첫 진입, 재진입, 다시 시도).
    private func loadInitial() async {
        guard activeInitialLoad == nil else { return }
        initialLoadID += 1
        let id = initialLoadID
        activeInitialLoad = id
        state = .loading
        await work.run { [self] in await loadDate(selectedDate, navigation: false) }
        if activeInitialLoad == id { activeInitialLoad = nil }
    }

    private func navigate(to target: KSTDate) async {
        pendingDate = target
        await work.run { [self] in await loadDate(target, navigation: true) }
    }

    /// 주제 → 첫 페이지. 날짜 이동은 성공해야 화면을 바꾸고(실패·404는 보던 전시 유지 + 토스트), 첫 로딩은 실패를 상태로 보인다.
    private func loadDate(_ date: KSTDate, navigation: Bool) async {
        let startGeneration = generation
        let sort = effectiveSort(for: date)
        let key = Key(date: date, sort: sort)
        do {
            let topic = try await fetchTopic(date)
            let revision = likes.beginRevalidation()
            let page = try await posts.list(PostListQuery(topicDate: date, sort: sort, randomSeed: seed(for: key), page: 1))
            guard generation == startGeneration, !Task.isCancelled else {
                abandonNavigation(date, navigation: navigation, generation: startGeneration)
                return
            }
            let entry = merged(page, key: key, since: revision)
            cache[key] = entry
            guard isCurrentTarget(date, navigation: navigation) else { return }   // 오래된 응답은 캐시에만 남긴다
            if date != selectedDate { featuredPage = 0 }
            selectedDate = date
            pendingDate = nil
            self.sort = sort
            mode = isLatest(date) ? .latest : .archive
            self.topic = topic
            isPaging = false
            pageToken += 1
            show(entry, key: key)
        } catch {
            guard generation == startGeneration else { return }
            let current = isCurrentTarget(date, navigation: navigation)
            if navigation, current { pendingDate = nil }
            guard current, !error.isCancellation, !Task.isCancelled else { return }
            handleLoadFailure(error, navigation: navigation)
        }
    }

    private func abandonNavigation(_ date: KSTDate, navigation: Bool, generation startGeneration: Int) {
        if navigation, generation == startGeneration, pendingDate == date { pendingDate = nil }
    }

    private func handleLoadFailure(_ error: any Error, navigation: Bool) {
        let failure = error as? FeedFailure
        if failure == .unauthorized { needsLogin = true }
        if navigation {
            if let text = failureText(failure, whenEmpty: false) { showToast(text) }
        } else if failure == .notFound {
            topic = nil
            items = []
            hasNext = false
            state = .empty
        } else {
            state = .failed(notices.make(failureText(failure, whenEmpty: true) ?? FeedCopy.displayError))
        }
    }

    /// 보이는 사진이 있을 때의 첫 페이지 재검증(탭 재선택, 정렬 변경, 복귀). 캐시가 있으면 먼저 보여 주고 성공하면 교체, 실패하면 유지 + 토스트.
    private func revalidate() async {
        let date = selectedDate
        let sort = effectiveSort(for: date)
        self.sort = sort
        mode = isLatest(date) ? .latest : .archive
        let key = Key(date: date, sort: sort)
        if let cached = cache[key] { show(cached, key: key) }
        refreshToken += 1
        let token = refreshToken
        isRefreshing = true
        let startGeneration = generation
        await work.run { [self] in await performRevalidation(key: key, token: token, generation: startGeneration) }
    }

    private func performRevalidation(key: Key, token: Int, generation startGeneration: Int) async {
        defer { if refreshToken == token { isRefreshing = false } }
        do {
            let topic = try await currentTopic(for: key.date)
            let revision = likes.beginRevalidation()
            let page = try await posts.list(PostListQuery(topicDate: key.date, sort: key.sort, randomSeed: seed(for: key), page: 1))
            guard generation == startGeneration, !Task.isCancelled else { return }
            let entry = merged(page, key: key, since: revision)
            cache[key] = entry
            guard currentKey == key else { return }
            self.topic = topic
            show(entry, key: key)
        } catch {
            guard generation == startGeneration, !error.isCancellation, !Task.isCancelled, currentKey == key else { return }
            // 정렬 변경 재검증이 실패하면 보이는 사진이 속한 정렬로 되돌린다(REQ-DISP-020, D-20): 기존 유지 + 토스트.
            if let shown = displayedKey, shown != key, shown.date == key.date {
                sort = shown.sort
                mode = displayedMode
                if displayedMode == .latest { preferredSort = shown.sort }
            }
            let failure = error as? FeedFailure
            if failure == .unauthorized { needsLogin = true }
            if let text = failureText(failure, whenEmpty: false) { showToast(text) }
        }
    }

    private func loadNextPage(key: Key, page requested: Int, seed: String?, token: Int) async {
        defer { if pageToken == token { isPaging = false } }
        let startGeneration = generation
        do {
            let revision = likes.beginRevalidation()
            let page = try await posts.list(PostListQuery(topicDate: key.date, sort: key.sort, randomSeed: seed, page: requested))
            guard generation == startGeneration, !Task.isCancelled else { return }
            // 재검증이 시드를 바꿨거나 첫 페이지가 다시 채워졌다면 이전 시드로 받은 페이지는 붙이지 않는다.
            guard var entry = cache[key], entry.nextPage == requested, entry.seed == seed else { return }
            var seen = Set(entry.all.map(\.id))
            let fresh = page.posts.compactMap { item -> PostListItem? in
                guard !ledger.isRemoved(item.id), seen.insert(item.id).inserted else { return nil }
                return withMergedLike(item, since: revision)
            }
            entry.tail += fresh
            entry.hasNext = page.hasNext
            entry.nextPage = requested + 1
            cache[key] = entry
            guard currentKey == key else { return }
            items = entry.all
            hasNext = entry.hasNext
        } catch {
            guard generation == startGeneration, !error.isCancellation, !Task.isCancelled else { return }
            let failure = error as? FeedFailure
            if key.sort == .random, case .badRequest = failure {
                // 시드를 잃은 랜덤 뒤쪽 페이지: 안내 없이 첫 페이지부터 다시 시작한다(REQ-DISP-021).
                cache[key] = nil
                refreshToken += 1
                isRefreshing = true
                await performRevalidation(key: key, token: refreshToken, generation: startGeneration)
                return
            }
            guard currentKey == key else { return }
            if failure == .unauthorized { needsLogin = true }
            if let text = failureText(failure, whenEmpty: false) { showToast(text) }
        }
    }

    // MARK: 보조

    private var currentKey: Key { Key(date: selectedDate, sort: sort) }

    private func isLatest(_ date: KSTDate) -> Bool { date >= KST.date(of: clock.now) }

    /// 오늘이면 고른 정렬, 지난 날짜면 인기순 고정.
    private func effectiveSort(for date: KSTDate) -> PostSort { isLatest(date) ? preferredSort : .popular }

    private func isCurrentTarget(_ date: KSTDate, navigation: Bool) -> Bool {
        navigation ? pendingDate == date : selectedDate == date
    }

    private func seed(for key: Key) -> String? { key.sort == .random ? cache[key]?.seed : nil }

    private func show(_ entry: Cached, key: Key) {
        displayedKey = key
        displayedMode = mode
        items = entry.all
        hasNext = entry.hasNext
        state = items.isEmpty ? .empty : .loaded
    }

    private func fetchTopic(_ date: KSTDate) async throws -> Topic {
        let topic = try await topics.topic(on: date)
        // 응답 topicDate가 요청 날짜와 다르면 잘못된 응답이다(REQ-DISP-002).
        guard topic.topicDate == date else { throw FeedFailure.invalidResponse }
        return topic
    }

    private func currentTopic(for date: KSTDate) async throws -> Topic {
        if let topic, topic.topicDate == date { return topic }
        return try await fetchTopic(date)
    }

    private func withMergedLike(_ item: PostListItem, since revision: LikeRevision) -> PostListItem {
        var item = item
        let like = likes.merge(server: item.like, for: item.id, since: revision)
        item.isLiked = like.isLiked
        item.likeCount = like.likeCount
        return item
    }

    /// 첫 페이지 응답을 캐시 항목으로 만든다. 삭제·비공개로 확인된 게시물과 중복은 거르고, 같은 시드의 캐시된 뒤쪽 페이지는 유지한다.
    private func merged(_ page: PostPage, key: Key, since revision: LikeRevision) -> Cached {
        var seen = Set<UUID>()
        let head = page.posts.compactMap { item -> PostListItem? in
            guard !ledger.isRemoved(item.id), seen.insert(item.id).inserted else { return nil }
            return withMergedLike(item, since: revision)
        }
        var entry = Cached(
            head: head, hasNext: page.hasNext, nextPage: page.currentPage + 1,
            seed: key.sort == .random ? page.randomSeed : nil
        )
        if let old = cache[key], !old.tail.isEmpty, key.sort != .random || old.seed == page.randomSeed {
            entry.tail = old.tail.filter { !seen.contains($0.id) && !ledger.isRemoved($0.id) }
            entry.hasNext = old.hasNext
            entry.nextPage = old.nextPage
        }
        if key.sort == .random, !PostListQuery.isValidRandomSeed(page.randomSeed) { entry.hasNext = false }
        return entry
    }

    private func failureText(_ failure: FeedFailure?, whenEmpty: Bool) -> String? {
        guard let failure else { return FeedCopy.displayError }
        if failure == .unauthorized { return whenEmpty ? FeedCopy.loginRequired : nil }
        return FeedCopy.message(for: failure, operation: .listPosts) ?? FeedCopy.displayError
    }

    /// 토스트는 화면이 보일 때만 담는다(D-20).
    private func showToast(_ message: String) {
        guard isVisible else { return }
        toast = notices.make(message)
    }

    private func resetIfViewerChanged() {
        let current = viewer.userId?.lowercased()
        guard current != owner else { return }
        owner = current
        work.cancel()
        generation += 1
        refreshToken += 1
        pageToken += 1
        activeInitialLoad = nil
        cache = [:]
        displayedKey = nil
        items = []
        hasNext = false
        topic = nil
        pendingDate = nil
        isRefreshing = false
        isPaging = false
        featuredPage = 0
        needsLogin = false
        toast = nil
        // 다른 계정에 이어 쓰지 않도록 탭에서 고른 정렬 선호는 버리고, 열 때 지정받은 정렬(홈 더보기의 인기순 등)로 돌아간다.
        sort = initialSort
        preferredSort = initialSort
        mode = isLatest(selectedDate) ? .latest : .archive
        state = .loading
    }

    private func updateItems(_ postId: UUID, _ change: (inout PostListItem) -> Void) {
        for index in items.indices where items[index].id == postId { change(&items[index]) }
        for key in Array(cache.keys) { cache[key]?.update(postId, change) }
    }

    private func remove(_ postId: UUID) {
        items.removeAll { $0.id == postId }
        for key in Array(cache.keys) { cache[key]?.remove(postId) }
        featuredPage = min(featuredPage, max(featured.count - 1, 0))
        if items.isEmpty, state == .loaded { state = .empty }
    }

    // MARK: 날짜 계산(연·월 경계)

    private static func day(before date: KSTDate) -> KSTDate {
        if date.day > 1, let previous = KSTDate(year: date.year, month: date.month, day: date.day - 1) { return previous }
        let (year, month) = date.month == 1 ? (date.year - 1, 12) : (date.year, date.month - 1)
        return KSTDate.clamped(year: year, month: month, day: 31) ?? date
    }

    private static func day(after date: KSTDate) -> KSTDate {
        if let next = KSTDate(year: date.year, month: date.month, day: date.day + 1) { return next }
        let (year, month) = date.month == 12 ? (date.year + 1, 1) : (date.year, date.month + 1)
        return KSTDate(year: year, month: month, day: 1) ?? date
    }

    private static func lastDay(year: Int, month: Int) -> Int {
        KSTDate.clamped(year: year, month: month, day: 31)?.day ?? 31
    }
}

extension DisplayViewModel: LikeEventSink {
    /// 상태 변경은 항상 목록·캐시에 반영, 토스트는 화면이 보일 때만, 404는 목록·캐시에서 제거, 재인증 필요는 `needsLogin`.
    public func likeCoordinator(didEmit event: LikeEvent) {
        switch event {
        case let .stateChanged(postId, like, _):
            updateItems(postId) { item in
                item.isLiked = like.isLiked
                item.likeCount = like.likeCount
            }
        case let .toast(notice):
            showToast(notice.message)
        case let .postUnavailable(postId):
            ledger.record(.unavailable(postId: postId))
            remove(postId)
        case .reauthenticationRequired:
            needsLogin = true
        }
    }
}

extension DisplayViewModel: PostChangeObserver {
    /// 삭제·비공개는 목록·캐시·추천 카드에서 제거, 제목 수정은 목록·캐시의 제목 갱신.
    public func postChangeLedger(didRecord change: PostChange) {
        switch change {
        case let .deleted(postId), let .unavailable(postId):
            remove(postId)
        case let .titleChanged(postId, title):
            updateItems(postId) { $0.title = title }
        }
    }
}
