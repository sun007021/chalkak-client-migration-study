import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias H = HomeFixtures

private func items(_ state: IssueSectionState) -> [UUID]? {
    if case let .items(banners) = state { banners.map(\.id) } else { nil }
}

/// 1페이지 10개(hasNext), 2페이지 10개(마지막).
private func twoPages(_ page: Int) -> BannerPage {
    page == 1 ? H.bannerPage(1, ids: 1...10, hasNext: true) : H.bannerPage(page, ids: 11...20, hasNext: false)
}

@MainActor
@Suite("BANR 배너 목록(최초 조회·페이징·새로고침)", .timeLimit(.minutes(1)))
struct BannerListViewModelTests {
    private func makeVM(_ repo: FakeBannerRepository, pageSize: Int = 10) -> BannerListViewModel {
        BannerListViewModel(repository: repo, pageSize: pageSize)
    }

    // MARK: 최초 조회

    @Test("TC-BANR-001 최초 조회는 page=1, pageSize=10이고 서버 순서 그대로 보여 준다")
    func firstPage() async {
        let repo = FakeBannerRepository()
        await repo.setHandler(twoPages)
        let vm = makeVM(repo)
        #expect(vm.state == .loading)

        await vm.loadFirstPage()

        #expect(await repo.requests == [FakeBannerRepository.Request(page: 1, pageSize: 10)])
        #expect(items(vm.state) == H.bannerIDs(1...10))
        #expect(vm.hasNext)
        #expect(vm.nextPage == 2)
        #expect(BannerListViewModel.prefetchDistance == 2)
    }

    @Test("TC-BANR-010 REQ-BANR-006 최초 조회 실패는 ISSUE 자리에 \"ISSUE를 불러오지 못했어요. 다시 시도\" 오류이고, 다시 시도하면 로딩 뒤 목록이 보인다")
    func firstFailureShowsErrorThenRetry() async {
        let repo = FakeBannerRepository()
        let counter = Counter()
        let hold = Hold()
        await repo.setHandler { page in
            if await counter.next() == 1 { throw FeedFailure.server(status: 500) }
            try await hold.wait()
            return H.bannerPage(page, ids: 1...3, hasNext: false)
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        #expect(vm.state == .failed("ISSUE를 불러오지 못했어요. 다시 시도"))

        let task = Task { await vm.retry() }
        guard await EventWait.signal(repo.signal, atLeast: 2, before: task) else {
            Issue.record("다시 시도가 1페이지를 다시 요청해야 한다")
            return
        }
        #expect(vm.state == .loading)
        await hold.open()
        await task.value
        #expect(items(vm.state) == H.bannerIDs(1...3))
        #expect(await repo.pages == [1, 1])
    }

    @Test("TC-BANR-010 성공했지만 배너가 0개이면 ISSUE 섹션 전체를 숨긴다")
    func emptyHidesSection() async {
        let repo = FakeBannerRepository()
        await repo.setHandler { page in BannerPage(currentPage: page, pageSize: 10, hasNext: false, banners: []) }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        #expect(vm.state == .hidden)
    }

    @Test("TC-BANR-004 hasNext가 false이면 목록 끝에 닿아도 추가 요청을 보내지 않는다")
    func noNextPage() async {
        let repo = FakeBannerRepository()
        await repo.setHandler { page in H.bannerPage(page, ids: 1...10, hasNext: false) }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        await vm.itemAppeared(index: 9)
        await vm.itemAppeared(index: 9)
        #expect(await repo.pages == [1])
        #expect(!vm.hasNext)
    }

    @Test("TC-BANR-008 요청이 취소되면(화면 이탈) 오류 상태로 바뀌지 않고 섹션 상태가 변하지 않는다")
    func cancellationDoesNotChangeState() async {
        let repo = FakeBannerRepository()
        let hold = Hold()
        await repo.setHandler { page in
            try await hold.wait()   // 취소되면 CancellationError
            return H.bannerPage(page, ids: 1...3, hasNext: false)
        }
        let vm = makeVM(repo)
        let task = Task { await vm.loadFirstPage() }
        guard await EventWait.signal(repo.signal, before: task) else {
            Issue.record("조회가 시작되어야 한다")
            return
        }

        vm.cancel()
        await task.value
        #expect(vm.state == .loading)

        let throwing = FakeBannerRepository()
        await throwing.setHandler { _ in throw CancellationError() }
        let second = makeVM(throwing)
        await second.loadFirstPage()
        #expect(second.state == .loading, "취소는 오류(.failed)가 아니다")
    }

    // MARK: 페이징

    @Test("TC-BANR-012 마지막 카드가 보이면 다음 페이지(page=2)를 1회만 요청해 10개씩 누적하고, 로딩 중에는 중복 요청하지 않는다")
    func paginationAccumulates() async {
        let repo = FakeBannerRepository()
        await repo.setHandler(twoPages)
        let vm = makeVM(repo)
        await vm.loadFirstPage()

        await vm.itemAppeared(index: 0)   // 목록 앞쪽은 다음 페이지를 부르지 않는다
        await vm.itemAppeared(index: 3)
        #expect(await repo.pages == [1])

        let hold = Hold()
        await repo.setHandler { page in
            try await hold.wait()
            return twoPages(page)
        }
        let task = Task { await vm.itemAppeared(index: 9) }
        guard await EventWait.signal(repo.signal, atLeast: 2, before: task) else {
            Issue.record("마지막 카드에서 page=2를 요청해야 한다")
            return
        }
        #expect(vm.isLoadingMore)
        await vm.itemAppeared(index: 9)   // 로딩 중 중복 요청 없음
        await vm.itemAppeared(index: 8)
        #expect(await repo.pages == [1, 2])

        await hold.open()
        await task.value
        #expect(!vm.isLoadingMore)
        #expect(items(vm.state) == H.bannerIDs(1...20), "서버 순서 그대로 누적")
        #expect(!vm.hasNext)

        await vm.itemAppeared(index: 19)   // 마지막 페이지 뒤에는 요청 없음
        #expect(await repo.pages == [1, 2])
    }

    @Test("REQ-BANR-007 목록이 로딩 중·오류·숨김일 때는 카드가 보여도 추가 요청이 없다")
    func noPagingWithoutItems() async {
        let repo = FakeBannerRepository()
        await repo.setHandler { _ in throw FeedFailure.network }
        let vm = makeVM(repo)
        await vm.itemAppeared(index: 0)
        await vm.loadFirstPage()
        await vm.itemAppeared(index: 0)
        #expect(await repo.pages == [1])
    }

    @Test("TC-BANR-013 추가 페이지가 실패하면 쌓인 목록을 유지하고, 다시 끝에 닿으면 같은 페이지를 다시 요청하며 중복 id는 한 번만 보여 준다")
    func pagingFailureRetriesSamePage() async {
        let repo = FakeBannerRepository()
        let attempts = Counter()
        await repo.setHandler { page in
            if page == 1 { return H.bannerPage(1, ids: 1...10, hasNext: true) }
            if await attempts.next() == 1 { throw FeedFailure.server(status: 500) }
            return H.bannerPage(2, ids: 10...19, hasNext: false)   // 10번이 1페이지와 겹친다
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()

        await vm.itemAppeared(index: 9)
        #expect(items(vm.state) == H.bannerIDs(1...10), "실패해도 쌓인 목록은 그대로다")
        #expect(!vm.isLoadingMore)
        #expect(vm.nextPage == 2)
        #expect(vm.hasNext)

        await vm.itemAppeared(index: 9)
        #expect(await repo.pages == [1, 2, 2], "같은 페이지 번호로 다시 요청한다")
        #expect(items(vm.state) == H.bannerIDs(1...19), "겹친 id는 한 번만")
    }

    @Test("TC-BANR-014 빈 추가 페이지는 기존 목록을 유지하고 조회를 종료한다(hasNext=true여도 이후 요청 없음)")
    func emptyExtraPageEndsPaging() async {
        let repo = FakeBannerRepository()
        await repo.setHandler { page in
            page == 1 ? H.bannerPage(1, ids: 1...10, hasNext: true) : BannerPage(currentPage: page, pageSize: 10, hasNext: true, banners: [])
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        await vm.itemAppeared(index: 9)
        #expect(items(vm.state) == H.bannerIDs(1...10))
        #expect(!vm.hasNext)

        await vm.itemAppeared(index: 9)
        #expect(await repo.pages == [1, 2])
    }

    // MARK: 새로고침

    @Test("TC-BANR-015 새로고침은 누적 목록을 새 1페이지로 교체하고 다음 요청을 page=2부터 다시 시작한다")
    func refreshReplacesAndRestartsPaging() async {
        let repo = FakeBannerRepository()
        let firstPageCalls = Counter()
        await repo.setHandler { page in
            if page == 1 {
                return await firstPageCalls.next() == 1 ? H.bannerPage(1, ids: 1...10, hasNext: true) : H.bannerPage(1, ids: 31...40, hasNext: true)
            }
            return H.bannerPage(page, ids: 11...20, hasNext: true)
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        await vm.itemAppeared(index: 9)
        #expect(items(vm.state)?.count == 20)
        #expect(vm.nextPage == 3)

        let failure = await vm.refresh()

        #expect(failure == nil)
        #expect(items(vm.state) == H.bannerIDs(31...40))
        #expect(vm.nextPage == 2)
        #expect(!vm.isRefreshing)
        await vm.itemAppeared(index: 9)
        #expect(await repo.pages == [1, 2, 1, 2])
    }

    @Test("TC-BANR-011 새로고침이 실패하면 기존 배너를 유지하고 실패를 돌려준다(토스트는 홈이 띄운다)")
    func refreshFailureKeepsBanners() async {
        let repo = FakeBannerRepository()
        let counter = Counter()
        await repo.setHandler { page in
            if await counter.next() == 1 { return H.bannerPage(page, ids: 1...3, hasNext: false) }
            throw FeedFailure.network
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()

        let failure = await vm.refresh()

        #expect(failure == .network)
        #expect(items(vm.state) == H.bannerIDs(1...3))
        #expect(!vm.isRefreshing)
    }

    @Test("TC-BANR-011 새로고침이 빈 성공 응답이면 기존 배너를 지우고 섹션을 숨긴다")
    func refreshEmptyClearsBanners() async {
        let repo = FakeBannerRepository()
        let counter = Counter()
        await repo.setHandler { page in
            await counter.next() == 1
                ? H.bannerPage(page, ids: 1...3, hasNext: false)
                : BannerPage(currentPage: page, pageSize: 10, hasNext: false, banners: [])
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        #expect(items(vm.state)?.count == 3)

        let failure = await vm.refresh()

        #expect(failure == nil)
        #expect(vm.state == .hidden)
    }

    @Test("새로고침 중에는 보이던 목록을 유지하고 추가 페이지 요청을 보내지 않는다")
    func refreshingBlocksPaging() async {
        let repo = FakeBannerRepository()
        await repo.setHandler(twoPages)
        let vm = makeVM(repo)
        await vm.loadFirstPage()

        let hold = Hold()
        await repo.setHandler { page in
            try await hold.wait()
            return twoPages(page)
        }
        let task = Task { await vm.refresh() }
        guard await EventWait.signal(repo.signal, atLeast: 2, before: task) else {
            Issue.record("새로고침이 시작되어야 한다")
            return
        }
        #expect(vm.isRefreshing)
        #expect(items(vm.state) == H.bannerIDs(1...10))
        await vm.itemAppeared(index: 9)
        #expect(await repo.pages == [1, 1])
        await hold.open()
        _ = await task.value
    }

    @Test("TC-BANR-016 새로고침 이전에 보낸 추가 페이지의 늦은 응답은 새 목록·상태를 덮어쓰지 않는다")
    func lateExtraPageAfterRefreshIsDropped() async {
        let repo = FakeBannerRepository()
        let stale = Hold(ignoringCancellation: true)
        let firstPageCalls = Counter()
        await repo.setHandler { page in
            if page == 1 {
                return await firstPageCalls.next() == 1 ? H.bannerPage(1, ids: 1...10, hasNext: true) : H.bannerPage(1, ids: 21...30, hasNext: true)
            }
            try await stale.wait()
            return H.bannerPage(2, ids: 11...20, hasNext: false)
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        let loadMore = Task { await vm.itemAppeared(index: 9) }
        guard await EventWait.signal(repo.signal, atLeast: 2, before: loadMore) else {
            Issue.record("추가 페이지 요청이 시작되어야 한다")
            return
        }

        _ = await vm.refresh()
        #expect(items(vm.state) == H.bannerIDs(21...30))

        await stale.open()
        await loadMore.value
        #expect(items(vm.state) == H.bannerIDs(21...30), "늦게 도착한 11~20이 섞이면 안 된다")
        #expect(vm.nextPage == 2)
        #expect(vm.hasNext)
        #expect(!vm.isLoadingMore)
    }

    @Test("TC-BANR-016 새로고침 중 첫 페이지를 다시 불러와도 isRefreshing이 남지 않고 추가 페이지 요청이 다시 동작한다")
    func loadFirstPageDuringRefreshReleasesRefreshing() async {
        let repo = FakeBannerRepository()
        let hold = Hold()
        let firstPageCalls = Counter()
        await repo.setHandler { page in
            if page == 1, await firstPageCalls.next() == 2 { try await hold.wait() }   // 새로고침의 요청만 멈춘다
            return page == 1 ? H.bannerPage(1, ids: 1...10, hasNext: true) : H.bannerPage(2, ids: 11...20, hasNext: false)
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()

        let refreshing = Task { await vm.refresh() }
        guard await EventWait.signal(repo.signal, atLeast: 2, before: refreshing) else {
            Issue.record("새로고침이 시작되어야 한다")
            return
        }
        #expect(vm.isRefreshing)

        await vm.loadFirstPage()
        _ = await refreshing.value

        #expect(!vm.isRefreshing)
        await vm.itemAppeared(index: 9)
        #expect(items(vm.state) == H.bannerIDs(1...20))
    }

    @Test("TC-BANR-016 TC-BANR-008 화면 이탈(취소) 뒤 늦게 도착한 추가 페이지는 적용하지 않는다")
    func lateExtraPageAfterCancelIsDropped() async {
        let repo = FakeBannerRepository()
        let stale = Hold(ignoringCancellation: true)
        await repo.setHandler { page in
            if page == 1 { return H.bannerPage(1, ids: 1...10, hasNext: true) }
            try await stale.wait()
            return H.bannerPage(2, ids: 11...20, hasNext: false)
        }
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        let loadMore = Task { await vm.itemAppeared(index: 9) }
        guard await EventWait.signal(repo.signal, atLeast: 2, before: loadMore) else {
            Issue.record("추가 페이지 요청이 시작되어야 한다")
            return
        }

        vm.cancel()
        await stale.open()
        await loadMore.value

        #expect(items(vm.state) == H.bannerIDs(1...10))
        #expect(!vm.isLoadingMore)
        #expect(vm.nextPage == 2, "취소된 요청은 다음 페이지 번호를 바꾸지 않는다")
    }

    @Test("계정 전환(reset) 시 목록을 비우고 로딩으로 돌아간다")
    func resetClears() async {
        let repo = FakeBannerRepository()
        await repo.setHandler(twoPages)
        let vm = makeVM(repo)
        await vm.loadFirstPage()
        #expect(items(vm.state)?.count == 10)
        vm.reset()
        #expect(vm.state == .loading)
        #expect(vm.nextPage == 2)
        #expect(!vm.hasNext)
    }

    @Test("pageSize를 지정하면 그 값으로 요청한다")
    func customPageSize() async {
        let repo = FakeBannerRepository()
        let vm = makeVM(repo, pageSize: 5)
        await vm.loadFirstPage()
        #expect(await repo.requests == [FakeBannerRepository.Request(page: 1, pageSize: 5)])
    }
}
