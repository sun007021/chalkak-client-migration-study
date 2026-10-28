import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias Copy = AIReviewCopy

@MainActor
@Suite("AIR 폴링(D-03)", .timeLimit(.minutes(1)))
struct AIReviewPollingTests {
    /// NONE에서 시작해 POST 202를 받고 폴링이 300초 창 끝까지 도는 ViewModel을 만든다(진입 GET 1회 + 폴링 GET 99회, 마지막 advance 직전에 멈춤).
    private func startPolling(_ world: AIReviewWorld) async throws -> (vm: AIReviewViewModel, run: Task<Void, Never>) {
        await world.repo.setStatus([.ok(try AIFixtures.none()), .ok(try AIFixtures.processing())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing())])
        let vm = world.makeVM()
        await vm.onAppear()
        let run = Task { await vm.confirmStart() }
        return (vm, run)
    }

    // MARK: 간격

    @Test("TC-AIR-032 POST 202 직후 2.9초에는 폴링 GET이 0건이고 3.0초에 1건이다")
    func firstPollAtThreeSeconds() async throws {
        let world = AIReviewWorld()
        let (vm, run) = try await startPolling(world)
        try #require(await world.isSleeping(before: run))
        #expect(await world.repo.statusCalls == 1)
        world.clock.advance(by: .milliseconds(2900))
        #expect(await world.repo.statusCalls == 1)
        world.clock.advance(by: .milliseconds(100))
        try #require(await world.statusEntered(atLeast: 2, before: run))
        #expect(await world.repo.statusCalls == 2)
        vm.onDisappear()
        await run.value
    }

    @Test("TC-AIR-033 GET 응답이 3초보다 늦어도 동시에 두 요청이 진행되지 않는다")
    func slowResponseDoesNotOverlap() async throws {
        let world = AIReviewWorld()
        let hold = Hold()
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .ok(try AIFixtures.processing(), hold: hold), .ok(try AIFixtures.processing())])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: run))
        world.clock.advance(by: .seconds(3))
        try #require(await world.statusEntered(atLeast: 2, before: run))
        world.clock.advance(by: .seconds(3))
        world.clock.advance(by: .seconds(3))
        #expect(await world.repo.statusCalls == 2)
        #expect(await world.repo.maxConcurrentStatus == 1)
        await hold.open()
        vm.onDisappear()
        await run.value
        #expect(await world.repo.maxConcurrentStatus == 1)
    }

    // MARK: 창

    @Test("TC-AIR-034 화면 진입으로 시작한 폴링의 창은 진입 시각부터이고 서버 requestedAt은 기준이 아니다")
    func entryWindowIgnoresRequestedAt() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processingOldRequestedAt())])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(100, before: run))
        await run.value
        // 진입 GET 1 + 폴링 99(3~297초). requestedAt이 하루 전이라고 바로 멈추면 이 숫자가 작다.
        #expect(await world.repo.statusCalls == 100)
        #expect(vm.message?.message == Copy.pollTimeout)
    }

    @Test("TC-AIR-035 299.999초까지 폴링을 유지하고 300.000초에 GET 없이 멈추며 안내만 보인다")
    func windowEndsAtThreeHundredSeconds() async throws {
        let world = AIReviewWorld()
        let (vm, run) = try await startPolling(world)
        try #require(await world.tick(99, before: run))
        try #require(await world.isSleeping(before: run))
        #expect(await world.repo.statusCalls == 100)
        #expect(vm.message == nil)
        #expect(!vm.isStalled)

        world.clock.advance(by: .milliseconds(2999))
        #expect(await world.repo.statusCalls == 100)
        #expect(vm.message == nil)
        world.clock.advance(by: .milliseconds(1))
        await run.value

        #expect(await world.repo.statusCalls == 100)
        #expect(vm.isStalled)
        #expect(vm.message?.message == Copy.pollTimeout)
        #expect(vm.phase == .processing)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillProcessing, isEnabled: false))
        #expect(await world.repo.requestCalls == 1)
        #expect(world.clock.sleeperCount == 0)
    }

    @Test("TC-AIR-036 창이 끝난 뒤 화면에 다시 들어오면 GET부터 새 300초 창을 열고 POST는 다시 보내지 않는다")
    func reentryAfterStallOpensNewWindow() async throws {
        let world = AIReviewWorld()
        let (vm, first) = try await startPolling(world)
        try #require(await world.tick(100, before: first))
        await first.value
        try #require(vm.isStalled)

        vm.onDisappear()
        let second = Task { await vm.onAppear() }
        try #require(await world.tick(100, before: second))
        await second.value
        #expect(await world.repo.statusCalls == 200)
        #expect(await world.repo.requestCalls == 1)
        #expect(vm.isStalled)
        #expect(vm.message?.message == Copy.pollTimeout)
    }

    @Test("REQ-AIR-027 창이 끝난 뒤 refresh하면 안내가 사라지고 GET부터 새 300초 창을 연다")
    func refreshAfterStallOpensNewWindow() async throws {
        let world = AIReviewWorld()
        let (vm, first) = try await startPolling(world)
        try #require(await world.tick(100, before: first))
        await first.value
        try #require(vm.isStalled)
        #expect(vm.message?.message == Copy.pollTimeout)

        let second = Task { await vm.refresh() }
        try #require(await world.isSleeping(before: second))
        #expect(vm.message == nil)
        #expect(!vm.isStalled)
        #expect(await world.repo.statusCalls == 101)
        try #require(await world.tick(100, before: second))
        await second.value
        #expect(vm.isStalled)
        #expect(await world.repo.statusCalls == 200)
        #expect(await world.repo.requestCalls == 1)
    }

    // MARK: 종료 조건

    @Test("TC-AIR-038 폴링 중 COMPLETED를 받으면 폴링을 멈추고 결과를 표시한다")
    func pollCompleted() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .ok(try AIFixtures.processing()), .ok(try AIFixtures.completed())])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(2, before: run))
        await run.value
        #expect(vm.phase == .completed)
        #expect(vm.pill?.title == Copy.pillView)
        #expect(await world.repo.statusCalls == 3)
        #expect(world.clock.sleeperCount == 0)
    }

    @Test("TC-AIR-038 REQ-AIR-017 폴링 중 FAILED를 받으면 폴링을 멈추고 자동으로 재요청하지 않는다")
    func pollFailed() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .ok(try AIFixtures.failedCanRetry())])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(1, before: run))
        await run.value
        #expect(vm.phase == .failed)
        #expect(vm.pill?.title == Copy.pillRetry)
        #expect(await world.repo.requestCalls == 0)
        #expect(await world.repo.statusCalls == 2)
        #expect(world.clock.sleeperCount == 0)
    }

    // MARK: 폴링 중 오류

    @Test("TC-AIR-039 REQ-AIR-029 폴링 GET이 일시 오류여도 계속 폴링하고 메시지는 한 번만 보이며 복구되면 결과를 표시한다")
    func transientErrorsKeepPolling() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([
            .ok(try AIFixtures.processing()), .fail(FeedFailure.server(status: 500)),
            .fail(FeedFailure.network), .ok(try AIFixtures.completed()),
        ])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(1, before: run))
        try #require(await world.isSleeping(before: run))
        let first = try #require(vm.message)
        #expect(first.message == Copy.errorLoad)
        #expect(vm.phase == .processing)

        try #require(await world.tick(1, before: run))
        try #require(await world.isSleeping(before: run))
        #expect(vm.message == first)

        try #require(await world.tick(1, before: run))
        await run.value
        #expect(vm.phase == .completed)
        #expect(await world.repo.statusCalls == 4)
    }

    @Test("REQ-AIR-029 화면이 가려지면 폴링 오류 메시지를 지운다")
    func hidingClearsPollingMessage() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .fail(FeedFailure.network)])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(1, before: run))
        try #require(await world.isSleeping(before: run))
        #expect(vm.message?.message == Copy.errorNetwork)
        vm.onDisappear()
        await run.value
        #expect(vm.message == nil)
    }

    @Test("TC-AIR-041 폴링 중 GET 404이면 메시지 없이 조회 불가 상태로 바꾸고 더 조회하지 않는다")
    func pollNotFound() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .fail(FeedFailure.notFound)])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(1, before: run))
        await run.value
        #expect(vm.phase == .hidden)
        #expect(vm.pill == nil)
        #expect(vm.message == nil)
        #expect(await world.repo.statusCalls == 2)
        #expect(world.clock.sleeperCount == 0)
    }

    @Test("TC-AIR-029 폴링 중 401이면 폴링을 멈추고 재인증을 알린다")
    func pollUnauthorized() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .fail(FeedFailure.unauthorized)])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(1, before: run))
        await run.value
        #expect(vm.needsLogin)
        #expect(await world.repo.statusCalls == 2)
        #expect(world.clock.sleeperCount == 0)
    }

    // MARK: 화면 이탈

    @Test("TC-AIR-042 화면을 벗어나면 폴링을 멈추고 더 이상 GET을 보내지 않는다")
    func leavingStopsPolling() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing())])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: run))
        vm.onDisappear()
        await run.value
        #expect(world.clock.sleeperCount == 0)
        world.clock.advance(by: .seconds(30))
        #expect(await world.repo.statusCalls == 1)
    }

    @Test("TC-AIR-042 이탈 뒤 도착한 GET 응답은 상태를 갱신하지 않는다")
    func lateStatusResponseAfterLeavingIsDiscarded() async throws {
        let world = AIReviewWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .ok(try AIFixtures.completed(), hold: hold)])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(1, before: run))
        try #require(await world.statusEntered(atLeast: 2, before: run))
        vm.onDisappear()
        await hold.open()
        await run.value
        #expect(vm.phase != .completed)
        #expect(vm.review?.status != .completed)
        #expect(vm.sheet == nil)
    }

    @Test("TC-AIR-042 다시 보이면 GET부터 새 300초 창을 시작한다")
    func returningOpensNewWindow() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing())])
        let vm = world.makeVM()
        let first = Task { await vm.onAppear() }
        try #require(await world.tick(5, before: first))
        try #require(await world.isSleeping(before: first))
        #expect(await world.repo.statusCalls == 6)
        vm.onDisappear()
        await first.value

        world.clock.advance(by: .seconds(1000))
        let second = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: second))
        #expect(await world.repo.statusCalls == 7)
        try #require(await world.tick(100, before: second))
        await second.value
        #expect(await world.repo.statusCalls == 106)
        #expect(vm.message?.message == Copy.pollTimeout)
    }

    // MARK: 늦은 응답

    @Test("TC-AIR-043 수동 갱신 이후 이전 폴링 응답이 늦게 도착해도 완료된 결과를 덮어쓰지 않는다")
    func staleResponseDoesNotOverwriteManualRefresh() async throws {
        let world = AIReviewWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.repo.setStatus([
            .ok(try AIFixtures.processing()),
            .ok(try AIFixtures.processing(), hold: hold),
            .ok(try AIFixtures.completed()),
        ])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.tick(1, before: run))
        try #require(await world.statusEntered(atLeast: 2, before: run))
        await vm.refresh()
        #expect(vm.phase == .completed)
        await hold.open()
        vm.onDisappear()
        await run.value
        #expect(vm.phase == .completed)
        #expect(vm.review?.status == .completed)
        #expect(await world.repo.statusCalls == 3)
    }

    @Test("TC-AIR-044 게시물 A에서 B로 바뀌면 A의 늦은 GET 응답이 B의 상태를 덮어쓰지 않는다")
    func lateResponseFromPreviousPostIsDiscarded() async throws {
        let world = AIReviewWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.repo.setStatus([.ok(try AIFixtures.completed(), hold: hold)], for: postA)
        await world.repo.setStatus([.ok(try AIFixtures.none())], for: postB)
        let vm = world.makeVM(surface: .home)
        let run = Task { await vm.onAppear() }
        try #require(await world.statusEntered(atLeast: 1, before: run))
        vm.show(world.target(postB))
        await vm.onAppear()
        #expect(vm.phase == .none)
        await hold.open()
        await run.value
        #expect(vm.target.postId == postB)
        #expect(vm.phase == .none)
        #expect(vm.review?.status == AIReviewStatus.none)
    }

    @Test("TC-AIR-044 사용자 A 로그아웃·B 로그인 뒤 도착한 이전 GET 응답은 폐기한다")
    func lateResponseAfterAccountSwitchIsDiscarded() async throws {
        let world = AIReviewWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.repo.setStatus([.ok(try AIFixtures.completed(), hold: hold)])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.statusEntered(atLeast: 1, before: run))
        world.viewer.set(FeedFixtures.userB)
        await hold.open()
        await run.value
        #expect(vm.phase != .completed)
        #expect(vm.review == nil)
        #expect(vm.sheet == nil)

        // 낡은 응답은 상태를 바꾸지 않으므로, 계정 전환 알림이 새 계정으로 다시 확인해 `.checking`에 남지 않게 한다.
        await vm.viewerDidChange()
        #expect(vm.phase == .completed)
        #expect(vm.review?.status == .completed)
        #expect(world.clock.sleeperCount == 0)
        let calls = await world.repo.statusCalls
        await vm.viewerDidChange() // 계정이 그대로면 다시 조회하지 않는다
        #expect(await world.repo.statusCalls == calls)
    }

    @Test("REQ-AIR-027 창 종료 안내는 refresh를 시작하면 지워진다")
    func refreshClearsStallNotice() async throws {
        let world = AIReviewWorld()
        let (vm, run) = try await startPolling(world)
        try #require(await world.tick(100, before: run))
        await run.value
        try #require(vm.message?.message == Copy.pollTimeout)
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        await vm.refresh()
        #expect(vm.message == nil)
        #expect(vm.phase == .completed)
    }
}
