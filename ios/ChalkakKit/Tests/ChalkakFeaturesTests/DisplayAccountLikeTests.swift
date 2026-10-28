import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

@MainActor
@Suite("DISP 전시 계정·게스트·좋아요", .timeLimit(.minutes(1)))
struct DisplayAccountLikeTests {
    @Test("TC-DISP-048 화면을 벗어나 요청이 취소되면 오류 토스트·오류 화면이 없고 재진입하면 다시 로드한다")
    func cancellationIsNotAnError() async {
        let world = FeedWorld()
        let hold = Hold()
        await world.topics.setHandler { date in
            try await hold.wait()
            return F.topic(date)
        }
        let vm = world.makeDisplay()
        let task = Task { await vm.onAppear() }
        await world.topics.signal.wait()
        vm.onDisappear()
        await task.value
        if case .failed = vm.state { Issue.record("취소가 오류 화면이 되면 안 된다") }
        #expect(vm.toast == nil)
        await hold.open()
        await vm.onAppear()
        #expect(vm.state == .loaded)
        #expect(await world.topics.requestedDates.count == 2)
    }

    @Test("TC-DISP-049 사용자가 바뀌면 이전 계정의 캐시·좋아요·seed가 새 화면에 보이지 않는다")
    func accountSwitchDropsPreviousState() async {
        let world = FeedWorld()
        await world.likeRepo.setAutoResolve(true)
        let vm = world.makeDisplay(initialSort: .random)
        await vm.onAppear()
        let liked = vm.itemID(0)
        vm.likeTapped(liked)
        await world.coordinator.settledAll()
        #expect(vm.item(0).isLiked)

        world.viewer.set(F.userB)
        let hold = Hold()
        await world.posts.setListHandler { query in
            try await hold.wait()
            return F.defaultPage(query)
        }
        let task = Task { await vm.onAppear() }
        await world.posts.listSignal.wait(atLeast: 2)
        #expect(vm.state == .loading)
        #expect(vm.items.isEmpty)
        let query = await world.posts.listQueries.last
        #expect(query?.page == 1)
        #expect(query?.randomSeed == nil)
        await hold.open()
        await task.value
        #expect(vm.items.first?.id == liked)
        #expect(vm.items.first?.isLiked == false)
        #expect(vm.items.first?.likeCount == 1)
    }

    @Test("TC-DISP-054 게스트가 사진을 누르면 토스트만 뜨고 상세 요청 0건이며 이동하지 않는다")
    func guestCannotOpenPost() async {
        let world = FeedWorld(userId: nil)
        let vm = world.makeDisplay()
        await vm.onAppear()
        let result = vm.openPost(vm.itemID(0))
        #expect(result == .blocked)
        #expect(vm.toast?.message == FeedCopy.guestFeed)
        #expect(await world.posts.detailIDs.isEmpty)
    }

    @Test("TC-DISP-055 사진을 누르면 목록의 현재 값을 시드로 상세에 넘기고 이 때 상세 요청은 보내지 않는다")
    func openPostPassesSeed() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let item = vm.item(2)
        vm.likeTapped(item.id)   // 낙관 반영된 값이 시드가 된다
        var seeded = item
        seeded.isLiked = true
        seeded.likeCount = item.likeCount + 1
        let result = vm.openPost(item.id)
        #expect(result == .open(.listItem(seeded)))
        #expect(await world.posts.detailIDs.isEmpty)
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.resolveNext()
        await world.coordinator.settledAll()
    }

    @Test("TC-LIKE-029 요청 진행 중 화면을 벗어나면 상태는 목록에 반영되고 토스트는 뜨지 않는다")
    func likeFailureWhileHiddenHasNoToast() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let item = vm.item(0)
        vm.likeTapped(item.id)
        #expect(vm.item(0).isLiked)
        await world.likeRepo.waitForCallCount(1)
        vm.onDisappear()
        await world.likeRepo.failNext(FeedFailure.server(status: 500))
        await world.coordinator.settledAll()
        #expect(vm.item(0).isLiked == item.isLiked)
        #expect(vm.item(0).likeCount == item.likeCount)
        #expect(vm.toast == nil)
    }

    @Test("TC-LIKE-029 화면이 보이는 동안의 실패는 롤백과 토스트를 함께 보인다")
    func likeFailureWhileVisibleShowsToast() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let item = vm.item(0)
        vm.likeTapped(item.id)
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.failNext(FeedFailure.server(status: 500))
        await world.coordinator.settledAll()
        #expect(vm.item(0).isLiked == item.isLiked)
        #expect(vm.toast?.message == FeedCopy.likeGeneric)
    }

    @Test("TC-LIKE-004 추천 카드와 그리드에 같은 사진이 있으면 좋아요 결과가 두 곳에 같이 반영된다")
    func featuredAndGridShareLikeState() async {
        let world = FeedWorld()
        await world.likeRepo.setAutoResolve(true)
        let vm = world.makeDisplay(initialDate: F.yesterday)
        await vm.onAppear()
        let id = vm.featuredID(0)
        vm.likeTapped(id)
        await world.coordinator.settledAll()
        #expect(vm.featured.first?.isLiked == true)
        #expect(vm.items.first { $0.id == id }?.isLiked == true)
        #expect(vm.featured.first == vm.items.first { $0.id == id })
    }

    @Test("TC-LIKE-010 좋아요가 404이면 해당 게시물이 목록과 캐시에서 빠진다")
    func likeNotFoundRemovesFromList() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let id = vm.itemID(0)
        vm.likeTapped(id)
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.failNext(FeedFailure.notFound)
        await world.coordinator.settledAll()
        #expect(!vm.items.contains { $0.id == id })
        #expect(vm.toast?.message == FeedCopy.likeGeneric)
        // 캐시에서도 빠져서 다른 정렬을 갔다 와도 되살아나지 않는다.
        await vm.selectSort(.popular)
        await vm.selectSort(.recent)
        #expect(!vm.items.contains { $0.id == id })
    }

    @Test("좋아요 재인증이 필요하면 needsLogin이 켜진다")
    func likeReauthenticationRequired() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        vm.likeTapped(vm.itemID(0))
        await world.likeRepo.waitForCallCount(1)
        await world.likeRepo.failNext(FeedFailure.unauthorized)
        await world.coordinator.settledAll()
        #expect(vm.needsLogin)
        #expect(vm.toast == nil)
    }

    @Test("삭제·제목 수정 변경이 기록되면 목록과 캐시에 반영된다")
    func ledgerChangesApplied() async {
        let world = FeedWorld()
        let vm = world.makeDisplay()
        await vm.onAppear()
        let removed = vm.itemID(0)
        let renamed = vm.itemID(1)
        world.ledger.record(.deleted(postId: removed))
        world.ledger.record(.titleChanged(postId: renamed, title: "새 제목"))
        #expect(!vm.items.contains { $0.id == removed })
        #expect(vm.items.first { $0.id == renamed }?.title == "새 제목")
        #expect(world.ledger.isRemoved(removed))
    }
}
