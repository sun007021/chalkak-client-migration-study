import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

/// 리뷰 반영: 재진입, 정렬 실패 복원, needsLogin 소비, 늦은 응답 방어.
@MainActor
@Suite("DISP·FEED 재진입·복원·늦은 응답", .timeLimit(.minutes(1)))
struct DisplayReviewTests {
    @Test("TC-DISP-048 첫 로드 중 나갔다 취소를 무시하는 요청이 끝나기 전에 다시 들어와도 다시 로드한다")
    func reappearBeforeCancelledLoadEnds() async {
        let world = FeedWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.topics.setHandler { date in
            try await hold.wait()
            return F.topic(date)
        }
        let vm = world.makeDisplay()
        let first = Task { await vm.onAppear() }
        await world.topics.signal.wait()
        vm.onDisappear()
        let second = Task { await vm.onAppear() }
        await world.topics.signal.wait(atLeast: 2)
        await hold.open()
        await first.value
        await second.value
        #expect(vm.state == .loaded)
        #expect(vm.items.count == 20)
    }

    @Test("REQ-DISP-020 정렬 재검증이 실패하면 보이는 정렬로 되돌리고 토스트를 띄우며 다시 고르면 요청한다")
    func sortRevalidationFailureRestoresSort() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let before = vm.items
        await world.posts.setListHandler { _ in throw FeedFailure.server(status: 500) }
        await vm.selectSort(.popular)
        #expect(vm.sort == .recent)
        #expect(vm.preferredSort == .recent)
        #expect(vm.items == before)
        #expect(vm.toast?.id == 1)
        #expect(vm.toast?.message == FeedCopy.displayError)
        #expect(!vm.isRefreshing)
        await world.posts.setListHandler { FeedFixtures.defaultPage($0) }
        await vm.selectSort(.popular)
        let queries = await world.posts.listQueries
        #expect(queries.count == 3)
        #expect(queries.last?.sort == .popular)
        #expect(vm.sort == .popular)
    }

    @Test("needsLogin은 소비하면 꺼진다(전시·상세)")
    func consumeNeedsLogin() async {
        let world = FeedWorld()
        let display = world.makeDisplay()
        await display.onAppear()
        display.likeTapped(display.itemID(0))
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.failNext(FeedFailure.unauthorized)
        await world.coordinator.settledAll()
        #expect(display.needsLogin)
        display.consumeNeedsLogin()
        #expect(!display.needsLogin)

        await world.setDetail(F.detail(77_001))
        let detail = world.makeDetail(.listItem(F.listItem(77_001)))
        await detail.onAppear()
        detail.likeTapped()
        await world.likeRepo.waitForCallCount(2)
        await world.likeRepo.failNext(FeedFailure.unauthorized)
        await world.coordinator.settledAll()
        #expect(detail.needsLogin)
        detail.consumeNeedsLogin()
        #expect(!detail.needsLogin)
    }

    @Test("재검증으로 시드가 바뀌면 이전 시드로 요청한 늦은 페이지는 붙지 않는다")
    func stalePageWithOldSeedNotAppended() async {
        let world = FeedWorld()
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        let late = Hold(ignoringCancellation: true)
        await world.posts.setListHandler { query in
            var page = F.defaultPage(query)
            if query.page == 2 { try await late.wait() } else { page.randomSeed = "seedB" }
            return page
        }
        let paging = Task { await vm.itemAppeared(vm.itemID(19)) }
        await world.posts.listSignal.wait(atLeast: 2)
        await vm.tabReselected()
        await late.open()
        await paging.value
        #expect(vm.items.count == 20)
    }

    @Test("목록에서 빠져 추천 카드가 줄면 추천 페이지가 범위 안으로 보정된다")
    func featuredPageClampedAfterRemoval() async {
        let world = FeedWorld()
        await world.posts.setListHandler { _ in F.page((1...5).map { F.listItem($0) }) }
        let vm = world.makeDisplay(initialDate: F.yesterday)
        await vm.onAppear()
        vm.setFeaturedPage(4)
        world.ledger.record(.deleted(postId: vm.featuredID(4)))
        #expect(vm.featured.count == 4)
        #expect(vm.featuredPage == 3)
    }

    @Test("화면을 나간 뒤 도착한 네트워크 오류는 상태를 오류로 바꾸지 않는다(전시·상세)")
    func lateFailureAfterDisappearIgnored() async {
        let world = FeedWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.topics.setHandler { _ in
            try await hold.wait()
            throw FeedFailure.network
        }
        let vm = world.makeDisplay()
        let task = Task { await vm.onAppear() }
        await world.topics.signal.wait()
        vm.onDisappear()
        await hold.open()
        await task.value
        #expect(vm.state == .loading)
        #expect(vm.toast == nil)

        let detailHold = Hold(ignoringCancellation: true)
        await world.posts.setDetailHandler { _ in
            try await detailHold.wait()
            throw FeedFailure.network
        }
        let detail = world.makeDetail(.mine(postId: F.postID(77_002), thumbnailURL: nil))
        let detailTask = Task { await detail.onAppear() }
        await world.posts.detailSignal.wait()
        detail.onDisappear()
        await detailHold.open()
        await detailTask.value
        #expect(detail.state == .loading)
        #expect(detail.toast == nil)
    }
}
