import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

/// 기본 Fake 목록에서 (날짜, 정렬)의 `range`번째(누적 기준) 게시물 id들.
private func ids(_ date: KSTDate, _ sort: PostSort, _ range: ClosedRange<Int>) -> [UUID] {
    range.map { F.defaultID(date: date, sort: sort, index: $0) }
}

@MainActor
@Suite("DISP 전시 로드·정렬·아카이브", .timeLimit(.minutes(1)))
struct DisplayLoadSortTests {
    // MARK: 로딩, 실패

    @Test("TC-DISP-001 첫 응답 전에는 Loading이고 날짜 이동이 막힌다")
    func loadingBlocksNavigation() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        let hold = Hold()
        await world.topics.setHandler { date in
            try await hold.wait()
            return F.topic(date)
        }
        let task = Task { await vm.onAppear() }
        await world.topics.signal.wait()
        #expect(vm.state == .loading)
        #expect(!vm.isNavigationEnabled)
        #expect(!vm.canGoPrevious)
        #expect(!vm.canGoNext)
        #expect(vm.selectedDate == F.today)
        #expect(vm.sort == .recent)
        await hold.open()
        await task.value
        #expect(vm.state == .loaded)
        #expect(vm.isNavigationEnabled)
        #expect(vm.canGoPrevious)
        #expect(!vm.canGoNext)
        #expect(world.analytics.events == [.screenView(.display, screenClass: nil)])
    }

    @Test("TC-DISP-056 지정한 날짜·정렬로 열면 그 값으로 첫 요청을 보낸다(VM 구간)")
    func opensWithGivenDateAndSort() async {
        let past = FeedWorld()
        let pastVM = past.makeDisplay(initialDate: F.yesterday, initialSort: .popular)
        await pastVM.onAppear()
        #expect(await past.topics.requestedDates == [F.yesterday])
        #expect(await past.posts.listQueries.first?.topicDate == F.yesterday)
        #expect(pastVM.selectedDate == F.yesterday)
        #expect(pastVM.mode == .archive)

        let todayWorld = FeedWorld()
        let todayVM = todayWorld.makeDisplay(initialSort: .popular)
        await todayVM.onAppear()
        #expect(await todayWorld.posts.listQueries.first?.sort == .popular)
        #expect(todayVM.mode == .latest)
        #expect(todayVM.sort == .popular)
    }

    @Test("TC-DISP-050 첫 로딩이 실패하면 요청 날짜를 유지한 오류 상태이고 다시 시도하면 같은 날짜로 재요청한다(VM 구간)")
    func retryAfterFirstLoadFailure() async {
        let world = FeedWorld()
        let counter = Counter()
        await world.topics.setHandler { date in
            if await counter.next() == 1 { throw FeedFailure.network }
            return F.topic(date)
        }
        let vm = world.makeDisplay()
        await vm.onAppear()
        guard case let .failed(notice) = vm.state else {
            Issue.record("오류 상태여야 한다: \(vm.state)")
            return
        }
        #expect(notice.message == FeedCopy.networkError)
        #expect(vm.selectedDate == F.today)
        #expect(vm.items.isEmpty)
        await vm.retry()
        #expect(vm.state == .loaded)
        #expect(await world.topics.requestedDates == [F.today, F.today])
        #expect(vm.items.count == 20)
    }

    @Test("TC-DISP-010 재검증이 실패해도 사진을 유지하고 토스트만 띄운다")
    func revalidationFailureKeepsContent() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let before = vm.items
        await world.posts.setListHandler { _ in throw FeedFailure.server(status: 500) }
        await vm.tabReselected()
        #expect(vm.state == .loaded)
        #expect(vm.items == before)
        #expect(vm.toast?.message == FeedCopy.displayError)
        #expect(!vm.isRefreshing)
    }

    @Test("TC-DISP-010 다음 페이지가 실패해도 사진을 유지하고 오류 화면으로 바꾸지 않는다")
    func pagingFailureKeepsContent() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let before = vm.items
        await world.posts.setListHandler { _ in throw FeedFailure.network }
        await vm.itemAppeared(before.at(19))
        #expect(vm.state == .loaded)
        #expect(vm.items == before)
        #expect(vm.toast?.message == FeedCopy.networkError)
        #expect(!vm.isPaging)
    }

    // MARK: 정렬

    @Test("TC-DISP-011 오늘은 정렬 탭 3개가 보이고 기본은 최신순이며 선택에 따라 sort를 요청한다")
    func sortTabs() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        #expect(vm.availableSorts == [.recent, .popular, .random])
        #expect(vm.sort == .recent)
        #expect(await world.posts.listQueries.last?.sort == .recent)
        await vm.selectSort(.popular)
        #expect(vm.sort == .popular)
        #expect(await world.posts.listQueries.last?.sort == .popular)
        await vm.selectSort(.random)
        #expect(await world.posts.listQueries.last?.sort == .random)
    }

    @Test("TC-DISP-012 정렬을 바꾸면 응답이 올 때까지 기존 사진을 유지하고, 본 적 있는 정렬은 캐시를 즉시 보여 준 뒤 재검증한다")
    func sortChangeKeepsOldItemsAndUsesCache() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let recentIDs = vm.items.map(\.id)
        let popularHold = Hold()
        await world.posts.setListHandler { query in
            try await popularHold.wait()
            return F.defaultPage(query)
        }
        let first = Task { await vm.selectSort(.popular) }
        await world.posts.listSignal.wait(atLeast: 2)
        #expect(vm.sort == .popular)
        #expect(vm.items.map(\.id) == recentIDs)
        #expect(vm.isRefreshing)
        #expect(vm.state == .loaded)
        await popularHold.open()
        await first.value
        #expect(vm.items.map(\.id) == ids(F.today, .popular, 1...20))
        #expect(!vm.isRefreshing)

        // 본 적 있는 최신순으로 되돌아오면 재검증 응답 전에도 캐시가 보인다.
        let recheckHold = Hold()
        await world.posts.setListHandler { query in
            try await recheckHold.wait()
            return F.defaultPage(query)
        }
        let second = Task { await vm.selectSort(.recent) }
        await world.posts.listSignal.wait(atLeast: 3)
        #expect(vm.items.map(\.id) == recentIDs)
        #expect(vm.isRefreshing)
        await recheckHold.open()
        await second.value
        #expect(vm.items.map(\.id) == recentIDs)
    }

    @Test("TC-DISP-013 지난 날짜는 아카이브로 popular만 요청하고 정렬 탭 없이 상위 5장을 추천에 쓴다")
    func archiveMode() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialDate: F.yesterday)
        await vm.onAppear()
        #expect(vm.mode == .archive)
        #expect(vm.sort == .popular)
        #expect(vm.availableSorts.isEmpty)
        #expect(await world.posts.listQueries.map(\.sort) == [.popular])
        #expect(vm.featured.map(\.id) == ids(F.yesterday, .popular, 1...5))
        #expect(vm.items.map(\.id) == ids(F.yesterday, .popular, 1...20))
        #expect(vm.headerDescription == "가장 사람들이 좋아했던 사진들이에요")

        let todayVM = FeedWorld().makeDisplay()
        await todayVM.onAppear()
        #expect(todayVM.featured.isEmpty)
        #expect(todayVM.headerDescription == "같은 주제에서 다른 시선을 느껴보세요")
    }

    @Test("TC-DISP-043 아카이브에 5장 미만이면 있는 만큼만 추천에 쓰고 깨지지 않는다")
    func archiveWithFewPhotos() async {
        let world = FeedWorld()
        await world.posts.setListHandler { _ in F.page((1...3).map { F.listItem($0) }) }
        let vm = world.makeDisplay(initialDate: F.yesterday)
        await vm.onAppear()
        #expect(vm.state == .loaded)
        #expect(vm.featured.count == 3)
        #expect(vm.items.count == 3)
        #expect(!vm.hasNext)
    }

    @Test("TC-DISP-014 오늘에서 랜덤순을 보다 과거 날짜에 갔다 오면 랜덤순이 복원된다")
    func randomSortRestoredAfterArchive() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        await vm.selectSort(.random)
        await vm.goToPreviousDay()
        #expect(vm.mode == .archive)
        #expect(vm.sort == .popular)
        #expect(vm.preferredSort == .random)
        await vm.goToNextDay()
        #expect(vm.mode == .latest)
        #expect(vm.sort == .random)
        #expect(await world.posts.listQueries.last?.sort == .random)
        #expect(vm.availableSorts == [.recent, .popular, .random])
    }

    // MARK: 랜덤 시드

    @Test("TC-DISP-021 TC-DISP-018 랜덤 2페이지는 저장 seed를 보내고, 다른 정렬로 바꾸면 seed를 버려 보내지 않는다")
    func randomSeedSentThenDropped() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        let first = await world.posts.listQueries.first
        #expect(first?.page == 1)
        #expect(first?.randomSeed == nil)
        await vm.itemAppeared(vm.itemID(19))
        let second = await world.posts.listQueries.dropFirst().first
        #expect(second?.page == 2)
        #expect(second?.randomSeed == "seedA")
        await vm.selectSort(.recent)
        let recent = await world.posts.listQueries.last
        #expect(recent?.sort == .recent)
        #expect(recent?.randomSeed == nil)
    }

    @Test("TC-DISP-021 날짜를 바꾸면 새 날짜 첫 페이지는 seed 없이 요청한다")
    func newDateRequestsWithoutSeed() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        await vm.goToPreviousDay()
        let query = await world.posts.listQueries.last
        #expect(query?.topicDate == F.yesterday)
        #expect(query?.sort == .popular)
        #expect(query?.randomSeed == nil)
        #expect(query?.page == 1)
    }

    @Test("TC-DISP-017 랜덤 첫 페이지를 재검증할 때 저장 seed를 보내고 뒤쪽 페이지는 유지한다")
    func randomRevalidationSendsSeedKeepsTail() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        await vm.itemAppeared(vm.itemID(19))
        let loaded = vm.items.map(\.id)
        #expect(loaded.count == 40)
        await vm.tabReselected()
        let query = await world.posts.listQueries.last
        #expect(query?.sort == .random)
        #expect(query?.page == 1)
        #expect(query?.randomSeed == "seedA")
        #expect(vm.items.map(\.id) == loaded)
    }

    @Test("TC-DISP-019 seed 없는 랜덤 응답이면 2페이지를 요청하지 않고 연속 로딩을 멈춘다(VM 구간)")
    func randomWithoutSeedStopsPaging() async {
        let world = FeedWorld()
        await world.posts.setListHandler { query in
            F.page((1...20).map { F.listItem($0) }, page: query.page, hasNext: true, seed: nil)
        }
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        await vm.itemAppeared(vm.itemID(19))
        #expect(await world.posts.listQueries.count == 1)
        #expect(vm.toast == nil)
        #expect(vm.state == .loaded)
    }

    @Test("REQ-DISP-021 랜덤 뒤쪽 페이지가 400이면 사용자 안내 없이 첫 페이지부터 다시 시작한다")
    func randomLaterPage400RestartsFromFirstPage() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        let counter = Counter()
        await world.posts.setListHandler { query in
            if query.page == 2, await counter.next() == 1 { throw FeedFailure.badRequest(message: nil) }
            return F.defaultPage(query)
        }
        await vm.itemAppeared(vm.itemID(19))
        let queries = await world.posts.listQueries
        #expect(queries.map(\.page) == [1, 2, 1])
        #expect(vm.toast == nil)
        #expect(vm.state == .loaded)
        #expect(vm.items.count == 20)
    }

    // MARK: 아카이브 추천 페이지

    @Test("TC-DISP-042 같은 날짜를 다시 불러오면 추천 카드 페이지를 유지하고 다른 날짜로 가면 처음으로 돌아간다")
    func featuredPageKeptOnlyForSameDate() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialDate: F.yesterday)
        await vm.onAppear()
        vm.setFeaturedPage(3)
        await vm.tabReselected()
        #expect(vm.featuredPage == 3)
        vm.onDisappear()
        await vm.onAppear()
        #expect(vm.featuredPage == 3)
        await vm.goToPreviousDay()
        #expect(vm.selectedDate == F.date(2026, 10, 25))
        #expect(vm.featuredPage == 0)
    }

    // MARK: 재검증

    @Test("TC-DISP-044 탭 재선택은 맨 위로 보내고 기존 전시를 유지한 채 재검증해 성공하면 교체한다")
    func tabReselectReplacesOnSuccess() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let token = vm.scrollToTopToken
        await world.posts.setListHandler { query in
            var page = F.defaultPage(query)
            page.posts = page.posts.map { var item = $0; item.likeCount += 100; return item }
            return page
        }
        await vm.tabReselected()
        #expect(vm.scrollToTopToken == token + 1)
        #expect(vm.items.first?.likeCount == 101)
        #expect(vm.toast == nil)
    }

    @Test("TC-DISP-044 재검증이 실패하면 기존 전시를 유지하고 토스트를 띄운다")
    func tabReselectKeepsOnFailure() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let before = vm.items
        await world.posts.setListHandler { _ in throw FeedFailure.server(status: 503) }
        await vm.tabReselected()
        #expect(vm.items == before)
        #expect(vm.state == .loaded)
        #expect(vm.toast?.message == FeedCopy.displayError)
    }

    @Test("TC-DISP-045 피드에서 전시로 돌아오면 보던 정렬과 seed, 뒤쪽 페이지를 유지하고 다음 페이지도 같은 seed로 요청한다")
    func returnFromFeedKeepsSeedAndTail() async {
        let world = FeedWorld()
        await world.posts.setListHandler { query in
            var page = F.defaultPage(query)
            page.hasNext = query.page < 3
            return page
        }
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        await vm.itemAppeared(vm.itemID(19))
        let loaded = vm.items.map(\.id)
        vm.onDisappear()
        await vm.onAppear()
        let revalidation = await world.posts.listQueries.last
        #expect(revalidation?.page == 1)
        #expect(revalidation?.sort == .random)
        #expect(revalidation?.randomSeed == "seedA")
        #expect(vm.items.map(\.id) == loaded)
        #expect(vm.sort == .random)
        #expect(vm.selectedDate == F.today)
        await vm.itemAppeared(vm.itemID(vm.items.count - 1))
        let next = await world.posts.listQueries.last
        #expect(next?.page == 3)
        #expect(next?.randomSeed == "seedA")
    }

    @Test("TC-FEED-015 상세를 열었다 닫아도 전시의 날짜·정렬·사진이 유지된다(VM 구간)")
    func displayStateSurvivesOpeningDetail() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        await vm.selectSort(.popular)
        let loaded = vm.items.map(\.id)
        _ = vm.openPost(loaded.first ?? UUID())
        vm.onDisappear()
        await vm.onAppear()
        #expect(vm.selectedDate == F.today)
        #expect(vm.sort == .popular)
        #expect(vm.state == .loaded)
        #expect(vm.items.map(\.id) == loaded)
    }
}
