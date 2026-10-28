import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures
private typealias H = HomeFixtures

private func withID(_ item: PostListItem, _ id: UUID) -> PostListItem {
    PostListItem(
        id: id, authorId: item.authorId, originalImageURL: item.originalImageURL, thumbnailImageURL: item.thumbnailImageURL,
        signatureOriginalImageURL: item.signatureOriginalImageURL, signatureThumbnailImageURL: item.signatureThumbnailImageURL,
        title: item.title, submittedAt: item.submittedAt, likeCount: item.likeCount, isLiked: item.isLiked, isMine: item.isMine
    )
}

@MainActor
@Suite("HOME 새로고침·재로드·세션", .timeLimit(.minutes(1)))
struct HomeRefreshTests {
    /// 로딩이 끝난 홈. 히어로는 APPROVED 사진(주간 기록 없음)이다.
    private func loadedHome(guest: Bool = false, now: Date = F.noon(F.today)) async -> (HomeWorld, HomeViewModel) {
        let w = HomeWorld(guest: guest, now: now)
        let vm = w.makeHome()
        await w.todayRepo.setHandler { H.posted(.approved) }
        await vm.homeAppeared()
        return (w, vm)
    }

    // MARK: 당겨서 새로고침

    @Test("TC-HOME-035 새로고침 중에는 보이던 콘텐츠를 유지한 채 인디케이터만 보이고, 성공하면 교체한다")
    func refreshKeepsContentThenReplaces() async {
        let (w, vm) = await loadedHome()
        let hold = Hold()
        await w.todayRepo.setHandler {
            try await hold.wait()
            return H.posted(.validating)
        }
        let before = vm.popularIDs

        let task = Task { await vm.refresh() }
        guard await EventWait.signal(w.todayRepo.signal, atLeast: 2, before: task) else {
            Issue.record("새로고침이 /posts/today를 다시 불러야 한다")
            return
        }
        #expect(vm.isRefreshing)
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false), "새로고침 중에도 콘텐츠를 비우지 않는다")
        #expect(vm.popularIDs == before)

        await hold.open()
        await task.value
        #expect(!vm.isRefreshing)
        #expect(vm.hero == .processing)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-HOME-035 새로고침이 연결 실패로 끝나면 기존 콘텐츠를 유지하고 토스트 \"네트워크 연결을 확인해 주세요.\"를 한 번만 띄운다")
    func refreshFailureKeepsContentWithNetworkToast() async {
        let (w, vm) = await loadedHome()
        await w.todayRepo.setHandler { throw FeedFailure.network }
        await w.calendarRepo.setHandler { _ in throw FeedFailure.network }
        await w.posts.setListHandler { _ in throw FeedFailure.network }
        let before = (vm.hero, vm.popularIDs, vm.rankingIDs)

        await vm.refresh()

        #expect((vm.hero, vm.popularIDs, vm.rankingIDs) == before)
        #expect(vm.week.value != nil)
        #expect(vm.popular.value != nil)
        #expect(!vm.isRefreshing)
        #expect(w.toast.messages == ["네트워크 연결을 확인해 주세요."], "여러 섹션이 실패해도 새로고침 한 번에 토스트는 한 건이다")
    }

    @Test("TC-HOME-035 서버 오류로 실패해도 기존 콘텐츠는 지워지지 않고 오류 화면으로 바뀌지 않는다(토스트 1건)")
    func refreshServerFailureKeepsContent() async {
        let (w, vm) = await loadedHome()
        await w.todayRepo.setHandler { throw FeedFailure.server(status: 500) }
        await vm.refresh()
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
        #expect(w.toast.messages.count == 1)
    }

    @Test("TC-HOME-036 새로고침 중에 다시 당기거나 연타해도 요청 세트는 1회만 나간다")
    func refreshIsDeduplicated() async {
        let (w, vm) = await loadedHome()
        let hold = Hold()
        await w.todayRepo.setHandler {
            try await hold.wait()
            return H.posted(.approved)
        }
        let firstBannerCount = await w.bannerRepo.requests.count

        let task = Task { await vm.refresh() }
        guard await EventWait.signal(w.todayRepo.signal, atLeast: 2, before: task) else {
            Issue.record("새로고침이 시작되어야 한다")
            return
        }
        await vm.refresh()
        await vm.refresh()
        #expect(await w.todayRepo.count == 2, "초기 로드 1회 + 새로고침 1회")

        await hold.open()
        await task.value
        #expect(await w.todayRepo.count == 2)
        #expect(await w.bannerRepo.requests.count == firstBannerCount + 1)
        #expect(await w.unreadRepo.count == 2)
    }

    @Test("TC-HOME-035 새로고침은 배너를 1페이지부터 다시 받고, 모든 섹션을 다시 요청한다")
    func refreshReloadsEverythingFromFirstPage() async {
        let (w, vm) = await loadedHome()
        let topicCalls = await w.topics.requestedDates.count
        let calendarCalls = await w.calendarRepo.requestedMonths.count

        await vm.refresh()

        #expect(await w.topics.requestedDates.count == topicCalls + 2)
        #expect(await w.calendarRepo.requestedMonths.count == calendarCalls + 1)
        #expect(await w.todayRepo.count == 2)
        #expect(await w.bannerRepo.pages == [1, 1])
        #expect(await w.unreadRepo.count == 2)
    }

    @Test("TC-HOME-037 새로고침 A가 느리고 그 사이 B(홈 재표시)가 먼저 끝나면 A의 늦은 응답이 B의 최신 상태를 덮지 않는다")
    func staleRefreshDoesNotOverwriteNewer() async {
        let (w, vm) = await loadedHome()
        let stale = Hold(ignoringCancellation: true)
        let counter = Counter()
        await w.todayRepo.setHandler {
            switch await counter.next() {
            case 1:   // A: 새로고침(느린, 취소를 무시하는 늦은 응답)
                try await stale.wait()
                return H.posted(.validating)
            default:  // B: 홈 재표시 시 조용한 갱신
                return H.notPosted()
            }
        }

        let taskA = Task { await vm.refresh() }
        guard await EventWait.signal(w.todayRepo.signal, atLeast: 2, before: taskA) else {
            Issue.record("A가 시작되어야 한다")
            return
        }
        await vm.homeAppeared()
        #expect(vm.hero == .empty(banned: false), "B가 먼저 반영된다")

        await stale.open()
        await taskA.value
        #expect(vm.hero == .empty(banned: false), "A의 늦은 응답(Processing)이 B를 덮으면 안 된다")
        #expect(!vm.isRefreshing)
    }

    @Test("TC-HOME-038 홈이 화면 밖으로 나가면 진행 중 요청이 취소되고, 취소는 오류 토스트·오류 상태가 되지 않으며 보이던 콘텐츠가 유지된다")
    func cancellationIsNotAnError() async {
        let (w, vm) = await loadedHome()
        let hold = Hold()
        await w.todayRepo.setHandler {
            try await hold.wait()   // 취소되면 CancellationError
            return H.posted(.validating)
        }
        let task = Task { await vm.refresh() }
        guard await EventWait.signal(w.todayRepo.signal, atLeast: 2, before: task) else {
            Issue.record("새로고침이 시작되어야 한다")
            return
        }

        vm.homeDisappeared()
        await task.value

        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
        #expect(w.toast.messages.isEmpty)
        #expect(!vm.isRefreshing)
        #expect(vm.popular.value != nil)
    }

    @Test("TC-HOME-038 취소가 오류로 섞이지 않는다: 저장소가 CancellationError를 던져도 오류 상태·토스트가 없다")
    func cancellationErrorFromRepository() async {
        let (w, vm) = await loadedHome()
        await w.todayRepo.setHandler { throw CancellationError() }
        await w.calendarRepo.setHandler { _ in throw CancellationError() }
        await vm.refresh()
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
        #expect(vm.week.value != nil)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-HOME-039 TC-NAV-046 포그라운드 복귀 갱신은 인디케이터·토스트 없이 조용히 교체하고, 실패하면 기존 콘텐츠를 유지한다")
    func becameActiveRefreshesSilently() async {
        let (w, vm) = await loadedHome()
        let hold = Hold()
        await w.todayRepo.setHandler {
            try await hold.wait()
            return H.posted(.validating)
        }
        let task = Task { await vm.appBecameActive() }
        guard await EventWait.signal(w.todayRepo.signal, atLeast: 2, before: task) else {
            Issue.record("복귀 갱신이 시작되어야 한다")
            return
        }
        #expect(!vm.isRefreshing)
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
        await hold.open()
        await task.value
        #expect(vm.hero == .processing)

        await w.todayRepo.setHandler { throw FeedFailure.network }
        await vm.appBecameActive()
        #expect(vm.hero == .processing)
        #expect(w.toast.messages.isEmpty)
        #expect(!vm.isRefreshing)
    }

    @Test("REQ-HOME-040 다른 탭에서 홈이 다시 보이면 화면을 비우지 않고(Loading으로 돌아가지 않고) 조용히 모든 섹션을 갱신한다")
    func homeReappearsSilently() async {
        let (w, vm) = await loadedHome()
        let hold = Hold()
        await w.topics.setHandler { date in
            try await hold.wait()
            return F.topic(date)
        }
        let task = Task { await vm.homeAppeared() }
        guard await EventWait.signal(w.topics.signal, atLeast: 4, before: task) else {
            Issue.record("재표시 갱신이 시작되어야 한다")
            return
        }
        #expect(vm.popular.value?.count == 5)
        #expect(vm.ranking.value?.count == 5)
        #expect(vm.hero != .loading)
        #expect(vm.topicHeader != .loading)
        #expect(!vm.isRefreshing)
        await hold.open()
        await task.value
    }

    // MARK: KST 자정

    @Test("TC-HOME-040 KST 23:59:59에는 홈이 다시 보여도 날짜 기준이 그대로 10/27이다(날짜 변경 재로드 없음)")
    func justBeforeMidnight() async {
        let (w, vm) = await loadedHome(now: Instant.parse("2026-10-27T14:59:59Z")!)
        await vm.homeAppeared()
        #expect(vm.loadedDate == F.today)
        #expect(Set(await w.topics.requestedDates) == [F.today, F.yesterday])
        #expect(vm.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
    }

    @Test("TC-HOME-041 자정(KST 10/28 00:00)을 지나 홈이 다시 보이면 오늘 주제·어제 랭킹·주 범위·히어로를 새 날짜 기준으로 전부 다시 불러오고 이전 날짜 콘텐츠를 섞지 않는다")
    func fullReloadAfterMidnight() async {
        let (w, vm) = await loadedHome(now: Instant.parse("2026-10-27T14:59:59Z")!)
        let hold = Hold()
        await w.topics.setHandler { date in
            if date == kst(2026, 10, 28) { try await hold.wait() }
            return F.topic(date)
        }
        let todayCalls = await w.todayRepo.count
        w.clock.setNow(Instant.parse("2026-10-27T15:00:00Z")!)

        let task = Task { await vm.homeAppeared() }
        guard await EventWait.signal(w.topics.signal, atLeast: 4, before: task) else {
            Issue.record("날짜 변경 재로드가 시작되어야 한다")
            return
        }
        #expect(vm.loadedDate == kst(2026, 10, 28))
        #expect(vm.popular == .loading, "이전 날짜(10/27) 콘텐츠가 남아 있으면 안 된다")
        #expect(vm.topicHeader == .loading)

        await hold.open()
        await task.value
        let dates = await w.topics.requestedDates
        #expect(Set(dates) == [kst(2026, 10, 26), F.today, kst(2026, 10, 28)])
        #expect(vm.topicHeader == .ready(dateLabel: "10월 28일 · 오늘의 주제", title: "주제 2026-10-28"))
        #expect(vm.popularIDs == (1...5).map { w.rankingID(kst(2026, 10, 28), $0) })
        #expect(vm.rankingIDs == (1...5).map { w.rankingID(F.today, $0) }, "어제 랭킹은 10/27 기준")
        #expect(await w.todayRepo.count == todayCalls + 1)
        #expect(vm.weekDates.first == kst(2026, 10, 25))
    }

    @Test("TC-HOME-041 앱이 포그라운드로 돌아올 때도 날짜가 바뀌었으면 전체 재로드한다")
    func fullReloadOnBecameActive() async {
        let (w, vm) = await loadedHome(now: Instant.parse("2026-10-27T14:59:59Z")!)
        w.clock.setNow(Instant.parse("2026-10-27T15:00:01Z")!)
        await vm.appBecameActive()
        #expect(vm.loadedDate == kst(2026, 10, 28))
        #expect(Set(await w.topics.requestedDates).contains(kst(2026, 10, 28)))
        #expect(vm.topicHeader == .ready(dateLabel: "10월 28일 · 오늘의 주제", title: "주제 2026-10-28"))
    }

    @Test("TC-HOME-042 자정 직후 새 주제가 없으면 히어로 NoOpenTopic, 오늘 인기 빈 상태이고 어제 랭킹은 10/27 기준으로 다시 불러온다")
    func midnightWithoutNewTopic() async {
        let (w, vm) = await loadedHome(now: Instant.parse("2026-10-27T14:59:59Z")!)
        await w.topics.setHandler { date in
            if date == kst(2026, 10, 28) { throw FeedFailure.notFound }
            return F.topic(date)
        }
        await w.todayRepo.setHandler { throw FeedFailure.notFound }
        w.clock.setNow(Instant.parse("2026-10-27T15:00:00Z")!)

        await vm.homeAppeared()

        #expect(vm.hero == .noOpenTopic)
        #expect(vm.topicHeader == .notReady)
        #expect(vm.popular == .ready([]))
        #expect(vm.rankingIDs == (1...5).map { w.rankingID(F.today, $0) }, "어제 랭킹은 새 날짜 기준 어제(10/27)")
        #expect(vm.ranking.value?.isEmpty == false)
    }

    @Test("TC-HOME-043 토요일 10/31 23:59:59를 지나 일요일 11/1 00:00이 되면 이번 주 범위가 11/1~11/7로 바뀌고 달력 조회 월이 2026-11이 된다")
    func weekRolloverAtSaturdayMidnight() async {
        let (w, vm) = await loadedHome(now: Instant.parse("2026-10-31T14:59:59Z")!)
        #expect(vm.weekDates.first == kst(2026, 10, 25))
        #expect(await w.calendarRepo.requestedMonths == [YearMonth(year: 2026, month: 10)])

        w.clock.setNow(Instant.parse("2026-10-31T15:00:00Z")!)
        await vm.homeAppeared()

        #expect(vm.weekDates.first == kst(2026, 11, 1))
        #expect(vm.weekDates.last == kst(2026, 11, 7))
        #expect(await w.calendarRepo.requestedMonths.last == YearMonth(year: 2026, month: 11))
    }

    // MARK: 계정 전환

    @Test("TC-HOME-044 계정 전환(reset) 시 A의 히어로·주간·랭킹이 모두 지워지고, A 요청의 늦은 응답은 무시된다")
    func accountSwitchDropsLateResponses() async {
        let (w, vm) = await loadedHome()
        let stale = Hold(ignoringCancellation: true)
        await w.todayRepo.setHandler {
            try await stale.wait()
            return H.posted(.pending)   // 계정 A의 늦은 응답
        }
        let task = Task { await vm.homeAppeared() }
        guard await EventWait.signal(w.todayRepo.signal, atLeast: 2, before: task) else {
            Issue.record("A의 갱신이 시작되어야 한다")
            return
        }

        vm.reset()

        #expect(vm.hero == .loading)
        #expect(vm.week == .loading)
        #expect(vm.ranking == .loading)
        #expect(vm.popular == .loading)
        #expect(vm.topicHeader == .loading)
        #expect(vm.banners.state == .loading)
        #expect(!vm.hasUnread)
        #expect(vm.aiCardPostId == nil)
        #expect(vm.loadedDate == nil)

        await stale.open()
        await task.value
        #expect(vm.hero == .loading, "A의 늦은 응답이 B 화면을 채우면 안 된다")

        await w.todayRepo.setHandler { H.notPosted() }
        await vm.homeAppeared()
        #expect(vm.hero == .empty(banned: false))
        #expect(vm.week.value != nil)
    }

    // MARK: 오프라인

    @Test("TC-HOME-045 오프라인 첫 진입은 각 섹션 오류(+다시 시도)이고, 온라인 복귀 후 섹션별 다시 시도로 모두 로드된다")
    func offlineThenRecover() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let online = Counter()   // 0이면 오프라인
        let isOffline: @Sendable () async -> Bool = { await online.current() == 0 }
        await w.topics.setHandler { date in
            if await isOffline() { throw FeedFailure.network }
            return F.topic(date)
        }
        await w.posts.setListHandler { query in
            if await isOffline() { throw FeedFailure.network }
            return F.defaultPage(query)
        }
        await w.todayRepo.setHandler {
            if await isOffline() { throw FeedFailure.network }
            return H.posted(.approved)
        }
        await w.calendarRepo.setHandler { month in
            if await isOffline() { throw FeedFailure.network }
            return H.month(month.year, month.month, [H.calendarPost(F.today, postId: H.myPost)])
        }
        await w.bannerRepo.setHandler { page in
            if await isOffline() { throw FeedFailure.network }
            return H.bannerPage(page, ids: 1...3, hasNext: false)
        }

        await vm.homeAppeared()

        #expect(vm.hero == .error)
        #expect(vm.week.failureMessage != nil)
        #expect(vm.ranking.failureMessage != nil)
        #expect(vm.popular.failureMessage != nil)
        #expect(vm.topicHeader == .failed)
        #expect(vm.banners.state == .failed("ISSUE를 불러오지 못했어요. 다시 시도"))
        #expect(w.toast.messages.isEmpty)

        _ = await online.next()   // 온라인 복귀
        for section in HomeSection.allCases { await vm.retry(section) }

        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: H.thumbnail(H.myPost), isPending: false))
        #expect(vm.weekPostDates == [F.today])
        #expect(vm.ranking.value?.count == 5)
        #expect(vm.popular.value?.count == 5)
        #expect(vm.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
        if case let .items(items) = vm.banners.state { #expect(items.count == 3) } else { Issue.record("배너가 로드되어야 한다") }
    }

    // MARK: 삭제 반영

    @Test("TC-HOME-046 오늘 게시물을 삭제하면 히어로는 Empty, 주간 칸·랭킹에서 해당 게시물이 즉시 빠진다")
    func deletedPostDisappears() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let mine = H.myPost
        await w.todayRepo.setHandler { H.posted(.approved) }
        await w.calendarRepo.setHandler { month in
            H.month(month.year, month.month, [H.calendarPost(F.yesterday), H.calendarPost(F.today, postId: mine)])
        }
        await w.posts.setListHandler { query in
            // 내 게시물을 어제 랭킹·오늘 인기 모두에 포함
            return F.page((1...4).map { F.listItem($0) } + [withID(F.listItem(0, isMine: true), mine)])
        }
        await vm.homeAppeared()
        #expect(vm.rankingIDs.contains(mine))
        #expect(vm.popularIDs.contains(mine))
        #expect(vm.weekPostDates == [F.yesterday, F.today])

        w.ledger.record(.deleted(postId: mine))

        #expect(vm.hero == .empty(banned: false))
        #expect(!vm.rankingIDs.contains(mine))
        #expect(!vm.popularIDs.contains(mine))
        #expect(vm.weekPostDates == [F.yesterday])
        #expect(vm.aiCardPostId == nil)
        #expect(vm.rankingIDs.count == 4)
    }

    @Test("TC-HOME-046 삭제된 게시물은 홈이 다시 갱신될 때 늦게 도착한 목록 응답이 되살리지 못한다")
    func deletedPostNotResurrected() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        w.ledger.record(.deleted(postId: F.postID(1)))
        await w.posts.setListHandler { _ in F.page((1...3).map { F.listItem($0) }) }
        await vm.homeAppeared()
        #expect(vm.popularIDs == [F.postID(2), F.postID(3)])
    }

    // MARK: 알림 진입과 미읽음

    @Test("TC-HOME-048 회원이 알림 벨을 누르면 알림함으로 이동한다(미읽음 점은 그대로)")
    func bellOpensNotifications() async {
        let (w, vm) = await loadedHome()
        vm.notificationTapped()
        #expect(w.navigator.calls == [.notifications])
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-HOME-049 게스트가 알림 벨을 누르면 토스트만 뜨고 요청 0건이며 미읽음 조회도 하지 않는다")
    func guestBellBlocked() async {
        let (w, vm) = await loadedHome(guest: true)
        vm.notificationTapped()
        await vm.notificationsClosed()
        await vm.pushReceived()
        await vm.appBecameActive()
        #expect(w.toast.messages == ["로그인 후 알림을 확인할 수 있어요"])
        #expect(w.navigator.calls.isEmpty)
        #expect(await w.unreadRepo.count == 0)
        #expect(await w.todayRepo.count == 0)
        #expect(!vm.hasUnread)
    }

    @Test("TC-HOME-050 hasUnread=true면 미읽음 점이 켜지고 false면 꺼진다")
    func unreadDot() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.unreadRepo.setHandler { UnreadStatus(hasUnread: true) }
        await vm.homeAppeared()
        #expect(vm.hasUnread)

        await w.unreadRepo.setHandler { UnreadStatus(hasUnread: false) }
        await vm.notificationsClosed()
        #expect(!vm.hasUnread)
    }

    @Test("TC-HOME-051 홈이 보일 때·앱 복귀·알림함에서 돌아옴·푸시 수신마다 미읽음을 정확히 1회씩 다시 조회한다")
    func unreadRefetchTriggers() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(await w.unreadRepo.count == 1)
        await vm.homeAppeared()
        #expect(await w.unreadRepo.count == 2)
        await vm.appBecameActive()
        #expect(await w.unreadRepo.count == 3)
        await vm.notificationsClosed()
        #expect(await w.unreadRepo.count == 4)
        await vm.pushReceived()
        #expect(await w.unreadRepo.count == 5)
        // 알림함 복귀·푸시 수신은 미읽음만 다시 조회한다.
        #expect(await w.todayRepo.count == 3)
    }

    @Test("TC-HOME-052 미읽음 조회가 실패하면 점은 직전 값을 유지하고 토스트·오류 UI는 없다", arguments: [FeedFailure.network, FeedFailure.server(status: 500)])
    func unreadFailureIsSilent(failure: FeedFailure) async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.unreadRepo.setHandler { UnreadStatus(hasUnread: true) }
        await vm.homeAppeared()
        #expect(vm.hasUnread)

        await w.unreadRepo.setHandler { throw failure }
        await vm.notificationsClosed()
        await vm.appBecameActive()
        await vm.refresh()

        #expect(vm.hasUnread)
        #expect(w.toast.messages.isEmpty)
        #expect(vm.hero != .error)
    }

    @Test("TC-BANR-016 홈 재표시로 배너 새로고침이 진행 중일 때 당겨서 새로고침해도 배너를 다시 요청하고 isRefreshing이 해제된다")
    func pullRefreshDuringBannerRefresh() async {
        let (w, vm) = await loadedHome()
        let hold = Hold()
        let calls = Counter()
        await w.bannerRepo.setHandler { page in
            if await calls.next() == 1 { try await hold.wait() }   // 재표시가 보낸 배너 요청만 멈춘다
            return H.bannerPage(page, ids: 1...3, hasNext: false)
        }
        let appeared = Task { await vm.homeAppeared() }
        guard await EventWait.signal(w.bannerRepo.signal, atLeast: 2, before: appeared) else {
            Issue.record("재표시의 배너 요청이 시작되어야 한다")
            return
        }

        await vm.refresh()
        await appeared.value

        #expect(await w.bannerRepo.requests.count == 3)
        #expect(!vm.banners.isRefreshing)
        #expect(!vm.isRefreshing)
        if case .items = vm.banners.state {} else { Issue.record("배너가 보여야 한다: \(vm.banners.state)") }
    }

    @Test("TC-BANR-026 배너 웹을 열었다 돌아와도(홈이 다시 보여도) 홈에 쌓인 배너 목록이 유지된다")
    func bannersSurviveReappear() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.bannerRepo.setHandler { page in H.bannerPage(page, ids: page == 1 ? 1...10 : 11...20, hasNext: true) }
        await vm.homeAppeared()
        await vm.banners.itemAppeared(index: 9)
        guard case let .items(accumulated) = vm.banners.state else {
            Issue.record("배너가 누적되어야 한다")
            return
        }
        #expect(accumulated.count == 20)

        // 웹 화면을 닫고 돌아온 홈의 조용한 갱신이 진행 중일 때도 보이던 목록을 비우지 않는다.
        let hold = Hold()
        await w.bannerRepo.setHandler { page in
            try await hold.wait()
            return H.bannerPage(page, ids: 1...10, hasNext: true)
        }
        let task = Task { await vm.homeAppeared() }
        guard await EventWait.signal(w.bannerRepo.signal, atLeast: 3, before: task) else {
            Issue.record("배너 재조회가 시작되어야 한다")
            return
        }
        #expect(vm.banners.state == .items(accumulated))
        await hold.open()
        await task.value
    }
}
