import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures
private typealias H = HomeFixtures

@MainActor
@Suite("HOME 히어로(D-06)·병렬 로드", .timeLimit(.minutes(1)))
struct HomeHeroTests {
    // MARK: 로딩과 병렬

    @Test("TC-HOME-001 히어로 응답 전에는 Loading(\"오늘의 주제를 불러오는 중\")이고 다른 섹션은 기다리지 않고 각자 그려진다")
    func heroLoadingDoesNotBlockOthers() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let hold = Hold()
        await w.todayRepo.setHandler {
            try await hold.wait()
            return H.posted(.approved)
        }

        let task = Task { await vm.homeAppeared() }
        let others = await reaches({
            vm.week != .loading && vm.ranking != .loading && vm.popular != .loading && vm.banners.state != .loading
        }, before: task)

        #expect(others, "히어로가 멈춰 있어도 다른 섹션은 응답이 오는 대로 그려져야 한다")
        #expect(vm.hero == .loading)
        #expect(vm.heroText == "오늘의 주제를 불러오는 중")
        #expect(vm.topicHeader == .ready(dateLabel: "10월 27일 · 오늘의 주제", title: "주제 2026-10-27"))
        #expect(vm.popularIDs.count == 5)

        await hold.open()
        await task.value
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
    }

    @Test("TC-HOME-034 TC-HOME-001 로그인 홈은 주제·랭킹 2종·주간·히어로·배너·미읽음 요청을 직렬이 아니라 동시에 시작한다")
    func requestsStartInParallel() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let hold = Hold()
        await w.topics.setHandler { date in
            try await hold.wait()
            return F.topic(date)
        }
        await w.todayRepo.setHandler {
            try await hold.wait()
            return H.notPosted()
        }
        await w.calendarRepo.setHandler { month in
            try await hold.wait()
            return H.month(month.year, month.month, [])
        }
        await w.bannerRepo.setHandler { page in
            try await hold.wait()
            return H.bannerPage(page, ids: 1...3, hasNext: false)
        }
        await w.unreadRepo.setHandler {
            try await hold.wait()
            return UnreadStatus(hasUnread: false)
        }
        let (topics, today, calendar, banners, unread) = (w.topics, w.todayRepo, w.calendarRepo, w.bannerRepo, w.unreadRepo)

        let task = Task { await vm.homeAppeared() }
        let allStarted = await EventWait.happens({
            await topics.signal.wait(atLeast: 2)   // 오늘·어제
            await today.signal.wait()
            await calendar.signal.wait()
            await banners.signal.wait()
            await unread.signal.wait()
        }, before: task)
        #expect(allStarted, "모든 섹션 요청이 서로의 응답을 기다리지 않고 먼저 시작되어야 한다")
        #expect(await w.topics.requestedDates.count == 2)

        await hold.open()
        await task.value
        #expect(vm.popular.value?.count == 5)
        #expect(vm.ranking.value?.count == 5)
    }

    // MARK: 히어로 상태 매핑

    @Test("TC-HOME-002 /posts/today 404는 NoOpenTopic이고 일반 Error와 구분되며 업로드 진입이 막힌다")
    func noOpenTopic() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { throw FeedFailure.notFound }
        await vm.homeAppeared()
        #expect(vm.hero == .noOpenTopic)
        #expect(vm.heroText == "지금은 참여할 수 있는 주제가 없어요")

        await vm.heroTapped()
        #expect(w.navigator.calls.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-HOME-003 TC-HOME-010 isPosted=false(반려 후 포함)는 Empty이고 \"{주제}\" 사진을 공유하지 않았어요를 보인다. Error가 아니다")
    func empty() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { H.notPosted() }
        await vm.homeAppeared()
        #expect(vm.hero == .empty(banned: false))
        #expect(vm.heroText == "\"주제 2026-10-27\" 사진을 공유하지 않았어요")
    }

    @Test("TC-HOME-003 주제 제목을 알 수 없으면 \"오늘의 주제\"로 대체한다")
    func emptyWithoutTopicTitle() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.topics.setHandler { date in
            if date == F.today { throw FeedFailure.notFound }
            return F.topic(date)
        }
        await vm.homeAppeared()
        #expect(vm.hero == .empty(banned: false))
        #expect(vm.heroText == "\"오늘의 주제\" 사진을 공유하지 않았어요")
    }

    @Test("TC-HOME-004 VALIDATING은 Processing이고 주간 기록에 해당 postId가 없어도 유지된다")
    func processing() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { H.posted(.validating) }
        await vm.homeAppeared()
        #expect(vm.hero == .processing)
        #expect(vm.heroText == "사진을 처리하고 있어요")
        #expect(vm.week.value?.recordedCount == 0)
    }

    @Test("TC-HOME-005 PENDING은 검수 대기 배지 사진이고 썸네일은 주간 기록의 같은 postId에서 가져오며 게시물 상세는 부르지 않는다")
    func pendingUsesCalendarThumbnail() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { H.posted(.pending) }
        await w.calendarRepo.setHandler { month in
            H.month(month.year, month.month, [H.calendarPost(F.yesterday), H.calendarPost(F.today, postId: H.myPost, status: .pending)])
        }
        await vm.homeAppeared()
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: H.thumbnail(H.myPost), isPending: true))
        #expect(await w.posts.detailIDs.isEmpty)
        #expect(vm.aiCardPostId == nil)
    }

    @Test("TC-HOME-006 APPROVED는 배지 없는 사진이다. 사진을 눌러도 이동하지 않고 상세 API도 부르지 않는다(카탈로그와 spec 충돌: spec 따름)")
    func approvedPhotoIsNotTappable() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { H.posted(.approved) }
        await w.calendarRepo.setHandler { month in
            H.month(month.year, month.month, [H.calendarPost(F.today, postId: H.myPost)])
        }
        await vm.homeAppeared()
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: H.thumbnail(H.myPost), isPending: false))
        #expect(vm.heroText.isEmpty)

        await vm.heroTapped()
        #expect(w.navigator.calls.isEmpty)
        #expect(await w.posts.detailIDs.isEmpty)
    }

    @Test("TC-HOME-007 주간 기록이 실패하거나 같은 postId가 없어도 히어로는 Error가 아니라 상태만 보이고 썸네일은 대체(nil)다")
    func heroSurvivesCalendarProblems() async {
        let failing = HomeWorld()
        let failingVM = failing.makeHome()
        await failing.todayRepo.setHandler { H.posted(.approved) }
        await failing.calendarRepo.setHandler { _ in throw FeedFailure.server(status: 500) }
        await failingVM.homeAppeared()
        #expect(failingVM.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
        #expect(failingVM.week == .failed("기록을 불러오지 못했어요"))

        let missing = HomeWorld()
        let missingVM = missing.makeHome()
        await missing.todayRepo.setHandler { H.posted(.pending) }
        await missing.calendarRepo.setHandler { month in H.month(month.year, month.month, [H.calendarPost(F.yesterday)]) }
        await missingVM.homeAppeared()
        #expect(missingVM.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: true))
    }

    @Test("TC-HOME-008 /posts/today 403(정지)은 Empty와 같은 모양이고, 누르면 정지 안내만 보이며 같은 요청을 다시 보내지 않는다")
    func bannedHero() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { throw FeedFailure.banned }
        await vm.homeAppeared()
        #expect(vm.hero == .empty(banned: true))
        #expect(vm.heroText == "\"주제 2026-10-27\" 사진을 공유하지 않았어요")

        await vm.heroTapped()
        await vm.heroTapped()
        #expect(w.toast.messages == ["이용이 정지되어 게시물을 작성할 수 없어요.", "이용이 정지되어 게시물을 작성할 수 없어요."])
        #expect(w.navigator.calls.isEmpty)
        #expect(await w.todayRepo.count == 1)
    }

    @Test("TC-HOME-009 서버 오류·연결 실패는 Error(\"사진 상태를 불러오지 못했어요\")이고 다시 시도하면 /posts/today만 1회 다시 보내 성공 상태로 바뀐다", arguments: [
        FeedFailure.server(status: 500), FeedFailure.network,
    ])
    func errorThenRetry(failure: FeedFailure) async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let counter = Counter()
        await w.todayRepo.setHandler {
            if await counter.next() == 1 { throw failure }
            return H.posted(.approved)
        }
        await vm.homeAppeared()
        #expect(vm.hero == .error)
        #expect(vm.heroText == "사진 상태를 불러오지 못했어요")
        let topicCalls = await w.topics.requestedDates.count
        let calendarCalls = await w.calendarRepo.requestedMonths.count

        await vm.retry(.hero)

        #expect(await w.todayRepo.count == 2)
        #expect(vm.hero == .photo(postId: H.myPost, thumbnailURL: nil, isPending: false))
        #expect(await w.topics.requestedDates.count == topicCalls, "히어로 다시 시도는 다른 섹션을 다시 부르지 않는다")
        #expect(await w.calendarRepo.requestedMonths.count == calendarCalls)
        #expect(await w.bannerRepo.requests.count == 1)
    }

    @Test("히어로 다시 시도는 응답 전까지 Loading으로 돌아간다")
    func retryShowsLoading() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let hold = Hold()
        let counter = Counter()
        await w.todayRepo.setHandler {
            if await counter.next() == 1 { throw FeedFailure.server(status: 500) }
            try await hold.wait()
            return H.posted(.validating)
        }
        await vm.homeAppeared()
        #expect(vm.hero == .error)

        let task = Task { await vm.retry(.hero) }
        guard await EventWait.signal(w.todayRepo.signal, atLeast: 2, before: task) else {
            Issue.record("다시 시도가 /posts/today를 불러야 한다")
            return
        }
        #expect(vm.hero == .loading)
        await hold.open()
        await task.value
        #expect(vm.hero == .processing)
    }

    @Test("TC-HOME-011 알 수 없는 상태·모순된 응답(invalidResponse)은 앱이 깨지지 않고 히어로 Error로 처리한다")
    func invalidResponseIsError() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await w.todayRepo.setHandler { throw FeedFailure.invalidResponse }
        await vm.homeAppeared()
        #expect(vm.hero == .error)
        #expect(vm.week.value != nil, "다른 섹션은 정상이다")
    }

    @Test("REQ-HOME-048 회원 전용 호출이 갱신 후에도 401이면 로그인 화면으로 가야 한다(needsLogin). 배너는 토큰을 쓰지 않아 영향이 없다")
    func unauthorizedNeedsLogin() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        #expect(!vm.needsLogin)
        await w.todayRepo.setHandler { throw FeedFailure.unauthorized }
        await vm.homeAppeared()
        #expect(vm.needsLogin)

        let guest = HomeWorld(guest: true)
        let guestVM = guest.makeHome()
        await guest.bannerRepo.setHandler { _ in throw FeedFailure.unauthorized }
        await guestVM.homeAppeared()
        #expect(!guestVM.needsLogin)
        #expect(guestVM.banners.state == .failed("ISSUE를 불러오지 못했어요. 다시 시도"))
    }

    // MARK: 업로드 진입, AI 카드

    @Test("히어로 Empty를 누르면 업로드 진입 게이트를 시작한다(회원)")
    func emptyHeroStartsUpload() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(vm.hero == .empty(banned: false))
        await vm.heroTapped()
        #expect(w.navigator.calls == [.upload])
        #expect(w.toast.messages.isEmpty)
    }

    @Test("히어로가 로딩·처리 중·사진일 때는 눌러도 업로드를 시작하지 않는다")
    func nonEmptyHeroDoesNotStartUpload() async {
        let w = HomeWorld()
        let vm = w.makeHome()
        let hold = Hold()
        await w.todayRepo.setHandler {
            try await hold.wait()
            return H.posted(.validating)
        }
        let task = Task { await vm.homeAppeared() }
        guard await EventWait.signal(w.todayRepo.signal, before: task) else {
            Issue.record("히어로 조회가 시작되어야 한다")
            return
        }
        await vm.heroTapped()   // 로딩 중
        await hold.open()
        await task.value
        await vm.heroTapped()   // 처리 중
        #expect(vm.hero == .processing)
        #expect(w.navigator.calls.isEmpty)
    }

    @Test("TC-HOME-054 AI 카드는 히어로가 APPROVED이고 응답 topicDate가 KST 오늘일 때만 postId를 갖고, 그 밖의 상태에서는 없다", arguments: [
        ("approved", true), ("pending", false), ("validating", false), ("empty", false), ("noOpenTopic", false),
        ("error", false), ("approvedOldTopic", false),
    ])
    func aiCardEligibility(scenario: String, visible: Bool) async {
        let w = HomeWorld()
        let vm = w.makeHome()
        switch scenario {
        case "approved": await w.todayRepo.setHandler { H.posted(.approved) }
        case "pending": await w.todayRepo.setHandler { H.posted(.pending) }
        case "validating": await w.todayRepo.setHandler { H.posted(.validating) }
        case "empty": await w.todayRepo.setHandler { H.notPosted() }
        case "noOpenTopic": await w.todayRepo.setHandler { throw FeedFailure.notFound }
        case "error": await w.todayRepo.setHandler { throw FeedFailure.network }
        default: await w.todayRepo.setHandler { H.posted(.approved, topicDate: F.yesterday) }   // 지난 주제(T11)
        }
        await vm.homeAppeared()
        #expect((vm.aiCardPostId != nil) == visible, "\(scenario)")
        if visible { #expect(vm.aiCardPostId == H.myPost) }
    }

    @Test("TC-HOME-054 게스트는 AI 카드가 없다")
    func guestHasNoAICard() async {
        let w = HomeWorld(guest: true)
        let vm = w.makeHome()
        await vm.homeAppeared()
        #expect(vm.aiCardPostId == nil)

        let member = HomeWorld()
        let memberVM = member.makeHome()
        await member.todayRepo.setHandler { H.posted(.approved) }
        await memberVM.homeAppeared()
        #expect(memberVM.aiCardPostId == H.myPost, "같은 응답이라도 회원은 카드가 있다")
    }

    // MARK: 게스트

    @Test("TC-HOME-012 TC-NAV-014 TC-BANR-009 게스트는 /posts/today·/posts/calendar·미읽음 호출 0건, 히어로 Empty, 주간 기록은 빈 7칸이고 주제·랭킹·배너만 부른다")
    func guestHome() async {
        let w = HomeWorld(guest: true)
        let vm = w.makeHome()

        await vm.homeAppeared()

        #expect(await w.todayRepo.count == 0)
        #expect(await w.calendarRepo.requestedMonths.isEmpty)
        #expect(await w.unreadRepo.count == 0)
        #expect(vm.hero == .empty(banned: false))
        #expect(vm.week.value?.days.count == 7)
        #expect(vm.week.value?.recordedCount == 0)
        #expect(vm.weekDates == [kst(2026, 10, 25), kst(2026, 10, 26), kst(2026, 10, 27), kst(2026, 10, 28), kst(2026, 10, 29), kst(2026, 10, 30), kst(2026, 10, 31)])
        #expect(Set(await w.topics.requestedDates) == [F.today, F.yesterday])
        #expect(vm.popularIDs.count == 5)
        #expect(vm.ranking.value?.count == 5)
        #expect(await w.bannerRepo.requests == [FakeBannerRepository.Request(page: 1, pageSize: 10)])
        if case .items = vm.banners.state {} else { Issue.record("배너는 게스트도 보여야 한다: \(vm.banners.state)") }
        #expect(!vm.hasUnread)
    }

    @Test("TC-BANR-009 TC-HOME-020 게스트의 랭킹이 모두 실패해도 배너는 독립적으로 표시된다")
    func guestBannerIndependentOfRankingFailure() async {
        let w = HomeWorld(guest: true)
        let vm = w.makeHome()
        await w.posts.setListHandler { _ in throw FeedFailure.server(status: 500) }
        await vm.homeAppeared()
        #expect(vm.ranking.failureMessage == "어제 랭킹 사진을 불러오지 못했어요")
        #expect(vm.popular.failureMessage == "오늘 인기있는 사진 사진을 불러오지 못했어요")
        if case let .items(items) = vm.banners.state { #expect(items.count == 3) } else { Issue.record("배너가 보여야 한다") }
    }

    @Test("TC-HOME-013 게스트가 히어로를 누르면 토스트만 뜨고 네트워크 요청과 이동은 0건이다")
    func guestHeroTap() async {
        let w = HomeWorld(guest: true)
        let vm = w.makeHome()
        await vm.homeAppeared()
        let before = await w.posts.listQueries.count

        await vm.heroTapped()

        #expect(w.toast.messages == ["게시물을 추가하려면 로그인이 필요해요"])
        #expect(w.navigator.calls.isEmpty)
        #expect(await w.todayRepo.count == 0)
        #expect(await w.posts.listQueries.count == before)
    }
}
