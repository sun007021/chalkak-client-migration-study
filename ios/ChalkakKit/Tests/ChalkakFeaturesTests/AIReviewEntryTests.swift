import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias Copy = AIReviewCopy

@MainActor
@Suite("AIR 진입·알약·카드 상태", .timeLimit(.minutes(1)))
struct AIReviewEntryTests {
    // MARK: 진입

    @Test("TC-AIR-011 내 게시물 진입은 GET만 보내고 POST는 보내지 않는다")
    func entryOnlyReadsStatus() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(await world.repo.calls == [.status(postA)])
        #expect(vm.phase == .none)
        #expect(vm.sheet == nil)
    }

    @Test("TC-AIR-017 남의 게시물·게스트는 알약·카드가 없고 GET이 0건이다", arguments: ["not-mine", "guest"])
    func notMineOrGuestIsHidden(kind: String) async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        let vm = kind == "guest"
            ? world.makeVM(viewer: StubViewer(userId: nil))
            : world.makeVM(world.target(isMine: false))
        await vm.onAppear()
        #expect(await world.repo.calls.isEmpty)
        #expect(vm.phase == .hidden)
        #expect(vm.pill == nil)
        #expect(vm.card == nil)
    }

    @Test("TC-AIR-017 GET 404이면 알약·카드를 숨기고 폴링하지 않는다")
    func notFoundHides() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.fail(FeedFailure.notFound)])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.phase == .hidden)
        #expect(vm.pill == nil)
        #expect(vm.card == nil)
        #expect(world.clock.sleeperCount == 0)
        #expect(await world.repo.statusCalls == 1)
    }

    @Test("REQ-AIR-008 첫 GET을 기다리는 동안 비활성 알약 'AI 상태 확인중'을 보인다")
    func checkingPill() async throws {
        let world = AIReviewWorld()
        let hold = Hold()
        await world.repo.setStatus([.ok(try AIFixtures.none(), hold: hold)])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.statusEntered(atLeast: 1, before: run))
        #expect(vm.phase == .checking)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillChecking, isEnabled: false))
        await hold.open()
        await run.value
        #expect(vm.phase == .none)
    }

    // MARK: 상태별 알약·카드

    @Test("TC-AIR-012 NONE이면 'AI 피드백 받기'를 보이고 폴링하지 않는다")
    func nonePill() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillRequest, isEnabled: true))
        #expect(vm.card?.message == Copy.cardRequest)
        #expect(vm.card?.action == .start)
        #expect(world.clock.sleeperCount == 0)
        #expect(await world.repo.statusCalls == 1)
    }

    @Test("TC-AIR-013 PROCESSING이면 비활성 'AI 분석중'을 보이고 폴링을 시작한다")
    func processingPill() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing())])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: run))
        #expect(vm.phase == .processing)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillProcessing, isEnabled: false))
        #expect(vm.card?.message == Copy.cardProcessing)
        vm.onDisappear()
        await run.value
    }

    @Test("TC-AIR-014 COMPLETED이면 'AI 피드백 보기'만 있고 누르면 결과 시트가 열리며 폴링·재요청은 없다")
    func completedPill() async throws {
        let world = AIReviewWorld()
        let completed = try AIFixtures.completed()
        await world.repo.setStatus([.ok(completed)])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillView, isEnabled: true))
        #expect(vm.sheet == nil)
        #expect(!vm.canRetry)
        #expect(world.clock.sleeperCount == 0)
        await vm.tapPill()
        #expect(vm.sheet == .result(try #require(completed.result)))
        #expect(vm.card?.message == Copy.cardCompleted)
        #expect(vm.card?.action == .showResult)
        #expect(vm.card?.actionTitle == Copy.cardDetail)
        #expect(await world.repo.calls == [.status(postA)])
    }

    @Test("TC-AIR-015 FAILED + canRequestAgain=true이면 'AI 피드백 재요청'이고 누르면 재요청 시트가 열린다")
    func failedCanRetry() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.failedCanRetry())])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.phase == .failed)
        #expect(vm.canRetry)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillRetry, isEnabled: true))
        #expect(vm.card?.message == Copy.cardFailed)
        #expect(vm.card?.action == .retry)
        #expect(vm.card?.actionTitle == Copy.cardRetry)
        await vm.tapPill()
        #expect(vm.sheet == .start(isRetry: true))
        #expect(await world.repo.requestCalls == 0)
    }

    @Test("TC-AIR-015 REQ-AIR-017 FAILED + canRequestAgain=false이면 재요청 없이 'AI 피드백 실패'이고 실패 시트가 열린다")
    func failedCannotRetry() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.failedCannotRetry())])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(!vm.canRetry)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillFailed, isEnabled: true))
        #expect(vm.card?.action == nil)
        await vm.tapPill()
        #expect(vm.sheet == .failed(reason: Copy.failedNoMore))
        #expect(await world.repo.requestCalls == 0)
    }

    // MARK: 지난 주제

    @Test("TC-AIR-016 지난 주제의 FAILED는 canRequestAgain=true여도 재요청 없이 실패 시트에 '오늘 올린 사진만' 안내를 보인다")
    func pastTopicFailed() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.failedCanRetry())])
        let vm = world.makeVM(world.target(topicDate: FeedFixtures.yesterday))
        await vm.onAppear()
        #expect(!vm.canRequest)
        #expect(!vm.canRetry)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillFailed, isEnabled: true))
        await vm.tapPill()
        #expect(vm.sheet == .failed(reason: Copy.failedPast))
    }

    @Test("TC-AIR-016 REQ-AIR-004 지난 주제의 NONE이면 알약을 숨기고 시작 시트도 없다")
    func pastTopicNoneIsHidden() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        let vm = world.makeVM(world.target(topicDate: FeedFixtures.yesterday))
        await vm.onAppear()
        #expect(vm.phase == .hidden)
        #expect(vm.pill == nil)
        #expect(vm.card == nil)
        await vm.tapPill()
        #expect(vm.sheet == nil)
        #expect(await world.repo.requestCalls == 0)
    }

    @Test("TC-AIR-016 지난 주제도 이미 있는 완료 결과는 보여 준다")
    func pastTopicCompletedIsShown() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        let vm = world.makeVM(world.target(topicDate: FeedFixtures.yesterday))
        await vm.onAppear()
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillView, isEnabled: true))
    }

    @Test("TC-AIR-016 지난 주제도 진행 중이면 'AI 분석중'을 보이고 폴링한다")
    func pastTopicProcessingPolls() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing())])
        let vm = world.makeVM(world.target(topicDate: FeedFixtures.yesterday))
        let run = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: run))
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillProcessing, isEnabled: false))
        vm.onDisappear()
        await run.value
    }

    // MARK: KST 자정

    @Test("TC-AIR-045 KST 23:59:59에는 요청 버튼이 보이고 00:00:00에는 숨으며 POST를 보내지 않는다")
    func midnightHidesRequest() async throws {
        let world = AIReviewWorld()
        world.clock.setInstant("2026-10-27T23:59:59+09:00")
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.canRequest)
        #expect(vm.pill?.title == Copy.pillRequest)
        world.clock.setInstant("2026-10-28T00:00:00+09:00")
        #expect(!vm.canRequest)
        #expect(vm.pill == nil)
        await vm.confirmStart()
        #expect(await world.repo.requestCalls == 0)
    }

    @Test("TC-AIR-045 REQ-AIR-003 시트를 연 뒤 자정이 지나면 '분석 시작하기'를 눌러도 POST를 보내지 않는다")
    func midnightBetweenSheetAndConfirm() async throws {
        let world = AIReviewWorld()
        world.clock.setInstant("2026-10-27T23:59:59+09:00")
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing())])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        #expect(vm.sheet == .start(isRetry: false))
        world.clock.setInstant("2026-10-28T00:00:00+09:00")
        await vm.confirmStart()
        #expect(await world.repo.requestCalls == 0)
        #expect(vm.sheet == nil)
        #expect(vm.pill == nil)
    }

    @Test("TC-AIR-045 REQ-AIR-003 재요청 시트를 연 뒤 자정이 지나면 '분석 시작하기'가 시트를 닫고 POST를 보내지 않는다")
    func midnightClosesRetrySheet() async throws {
        let world = AIReviewWorld()
        world.clock.setInstant("2026-10-27T23:59:59+09:00")
        await world.repo.setStatus([.ok(try AIFixtures.failedCanRetry())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing())])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        #expect(vm.sheet == .start(isRetry: true))
        world.clock.setInstant("2026-10-28T00:00:00+09:00")
        await vm.confirmStart()
        #expect(vm.sheet == nil)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillFailed, isEnabled: true))
        #expect(await world.repo.requestCalls == 0)
    }

    @Test("TC-AIR-045 이미 진행 중인 리뷰는 자정이 지나도 결과 조회를 계속한다")
    func midnightKeepsPolling() async throws {
        let world = AIReviewWorld()
        world.clock.setInstant("2026-10-27T23:59:58+09:00")
        await world.repo.setStatus([.ok(try AIFixtures.processing()), .ok(try AIFixtures.processing()), .ok(try AIFixtures.completed())])
        let vm = world.makeVM()
        let run = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: run))
        world.clock.setInstant("2026-10-28T00:00:01+09:00")
        try #require(await world.tick(2, before: run))
        await run.value
        #expect(vm.phase == .completed)
        #expect(await world.repo.statusCalls == 3)
    }

    // MARK: 재진입·화면 간

    @Test("TC-AIR-019 상세로 다시 들어오면 완료 결과도 GET으로 갱신하고 자동 요청하지 않는다")
    func detailReentryRefreshesCompleted() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        let vm = world.makeVM(surface: .detail)
        await vm.onAppear()
        vm.onDisappear()
        await vm.onAppear()
        #expect(await world.repo.calls == [.status(postA), .status(postA)])
        #expect(vm.phase == .completed)
        #expect(vm.sheet == nil)
    }

    @Test("TC-AIR-018 홈으로 돌아올 때 같은 게시물의 완료 결과는 다시 조회하지 않고 유지한다")
    func homeKeepsCompletedOnReturn() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        let vm = world.makeVM(surface: .home)
        await vm.onAppear()
        vm.onDisappear()
        await vm.onAppear()
        #expect(await world.repo.statusCalls == 1)
        #expect(vm.phase == .completed)
    }

    @Test("TC-AIR-018 홈으로 돌아올 때 처리 중이었다면 조회를 재개한다")
    func homeResumesProcessingOnReturn() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing())])
        let vm = world.makeVM(surface: .home)
        let first = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: first))
        vm.onDisappear()
        await first.value
        let second = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: second))
        #expect(await world.repo.statusCalls == 2)
        vm.onDisappear()
        await second.value
    }

    @Test("TC-AIR-018 게시물이 달라지면 이전 완료 결과를 지우고 새 게시물을 조회한다")
    func homeClearsPreviousPostResult() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())], for: postA)
        await world.repo.setStatus([.ok(try AIFixtures.none())], for: postB)
        let vm = world.makeVM(surface: .home)
        await vm.onAppear()
        #expect(vm.phase == .completed)
        vm.show(world.target(postB))
        #expect(vm.target.postId == postB)
        #expect(vm.review == nil)
        #expect(vm.sheet == nil)
        await vm.onAppear()
        #expect(await world.repo.calls == [.status(postA), .status(postB)])
        #expect(vm.phase == .none)
        #expect(vm.review?.status == AIReviewStatus.none)
    }

    @Test("REQ-AIR-051 같은 게시물의 show는 상태를 유지하고, 같은 target이면 아무것도 하지 않으며, 다른 게시물이면 비운다")
    func showKeepsStateForSamePost() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        let vm = world.makeVM(surface: .home)
        await vm.onAppear()
        vm.show(world.target())
        #expect(vm.phase == .completed)
        #expect(vm.review != nil)
        // topicDate·isMine만 바뀌면 target만 갱신한다.
        vm.show(world.target(topicDate: FeedFixtures.yesterday))
        #expect(vm.target.topicDate == FeedFixtures.yesterday)
        #expect(vm.phase == .completed)
        #expect(vm.review?.status == .completed)
        await vm.onAppear()
        #expect(await world.repo.statusCalls == 1)
        vm.show(world.target(postB))
        #expect(vm.phase == .checking)
        #expect(vm.review == nil)
    }

    // MARK: 첫 GET 실패

    struct FirstFailure: Sendable, CustomTestStringConvertible {
        let failure: FeedFailure
        let text: String
        var testDescription: String { "\(failure)" }
    }

    nonisolated static let firstFailures: [FirstFailure] = [
        FirstFailure(failure: .network, text: Copy.errorNetwork),
        FirstFailure(failure: .server(status: 500), text: Copy.errorLoad),
        FirstFailure(failure: .invalidResponse, text: Copy.errorLoad),
    ]

    @Test("TC-AIR-040 첫 GET이 실패하면 오류 문구와 'AI 상태 다시 확인'을 보이고 누르면 GET을 다시 보낸다", arguments: firstFailures)
    func firstStatusFailureThenRecheck(testCase: FirstFailure) async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.fail(testCase.failure), .ok(try AIFixtures.none())])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.phase == .checkFailed)
        #expect(vm.message?.message == testCase.text)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillRecheck, isEnabled: true))
        #expect(world.clock.sleeperCount == 0)
        await vm.tapPill()
        #expect(await world.repo.statusCalls == 2)
        #expect(vm.phase == .none)
    }

    @Test("TC-AIR-029 첫 GET이 401이면 로그인 안내와 함께 재인증이 필요하다고 알리고 폴링하지 않는다")
    func firstStatusUnauthorized() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.fail(FeedFailure.unauthorized)])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.needsLogin)
        #expect(vm.message?.message == Copy.errorLogin)
        #expect(world.clock.sleeperCount == 0)
    }

    // MARK: 푸시 진입 자동 오픈

    @Test("TC-AIR-058 푸시 진입: 최신 GET이 COMPLETED면 결과 시트를 자동으로 연다")
    func pushOpensResultSheet() async throws {
        let world = AIReviewWorld()
        let completed = try AIFixtures.completed()
        await world.repo.setStatus([.ok(completed)])
        let vm = world.makeVM(opensSheetOnFirstResult: true)
        await vm.onAppear()
        #expect(await world.repo.calls == [.status(postA)])
        #expect(vm.sheet == .result(try #require(completed.result)))
    }

    @Test("TC-AIR-058 푸시 진입: 최신 GET이 FAILED면 실패 시트를 자동으로 연다", arguments: [true, false])
    func pushOpensFailedSheet(canRetry: Bool) async throws {
        let world = AIReviewWorld()
        let failed = try canRetry ? AIFixtures.failedCanRetry() : AIFixtures.failedCannotRetry()
        await world.repo.setStatus([.ok(failed)])
        let vm = world.makeVM(opensSheetOnFirstResult: true)
        await vm.onAppear()
        // 실패 시트는 "확인" 하나다. 재요청 가능이면 이유가 없고 재요청은 알약이 맡는다(REQ-AIR-015).
        #expect(vm.sheet == .failed(reason: canRetry ? nil : Copy.failedNoMore))
        #expect(vm.canRetry == canRetry)
    }

    @Test("TC-AIR-058 푸시 진입: 최신 GET이 NONE이면 시트를 열지 않는다")
    func pushDoesNotOpenForNone() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        let vm = world.makeVM(opensSheetOnFirstResult: true)
        await vm.onAppear()
        #expect(vm.sheet == nil)
        #expect(vm.phase == .none)
    }

    @Test("TC-AIR-058 푸시 진입: 최신 GET이 PROCESSING이면 시트 없이 알약만 'AI 분석중'이고 폴링한다")
    func pushDoesNotOpenForProcessing() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.processing())])
        let vm = world.makeVM(opensSheetOnFirstResult: true)
        let run = Task { await vm.onAppear() }
        try #require(await world.isSleeping(before: run))
        #expect(vm.sheet == nil)
        #expect(vm.pill?.title == Copy.pillProcessing)
        vm.onDisappear()
        await run.value
    }

    @Test("TC-AIR-058 자동 오픈은 한 번뿐이다: 닫고 뒤로 갔다 다시 와도 다시 열지 않는다")
    func pushOpensOnlyOnce() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        let vm = world.makeVM(opensSheetOnFirstResult: true)
        await vm.onAppear()
        try #require(vm.sheet != nil)
        vm.dismissSheet()
        #expect(vm.sheet == nil)
        vm.onDisappear()
        await vm.onAppear()
        #expect(await world.repo.statusCalls == 2)
        #expect(vm.sheet == nil)
    }

    @Test("TC-AIR-058 푸시가 아닌 일반 진입은 완료 결과여도 시트를 자동으로 열지 않는다")
    func normalEntryDoesNotAutoOpen() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.completed())])
        let vm = world.makeVM()
        await vm.onAppear()
        #expect(vm.sheet == nil)
    }
}
