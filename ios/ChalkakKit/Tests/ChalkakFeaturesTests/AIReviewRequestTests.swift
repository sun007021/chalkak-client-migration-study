import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias Copy = AIReviewCopy

@MainActor
@Suite("AIR 시작 시트와 POST", .timeLimit(.minutes(1)))
struct AIReviewRequestTests {
    // MARK: 시트

    @Test("TC-AIR-020 시작 시트를 닫으면 POST 0건, '분석 시작하기'를 누르면 POST 1회이다")
    func startSheetCloseThenConfirm() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postCompleted())])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        #expect(vm.sheet == .start(isRetry: false))
        vm.dismissSheet()
        #expect(vm.sheet == nil)
        #expect(await world.repo.requestCalls == 0)

        await vm.tapPill()
        await vm.confirmStart()
        #expect(await world.repo.requestCalls == 1)
        #expect(vm.sheet == nil)
    }

    @Test("TC-AIR-020 홈 카드의 NONE 탭은 시작 시트를 열고, 실패 재요청은 시트 없이 바로 POST한다")
    func homeCardStartAndDirectRetry() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        let none = world.makeVM(surface: .home)
        await none.onAppear()
        await none.performCardAction()
        #expect(none.sheet == .start(isRetry: false))
        #expect(await world.repo.requestCalls == 0)

        let retryWorld = AIReviewWorld()
        await retryWorld.repo.setStatus([.ok(try AIFixtures.failedCanRetry())])
        await retryWorld.repo.setRequest([.ok(try AIFixtures.postProcessing())])
        let retry = retryWorld.makeVM(surface: .home)
        await retry.onAppear()
        let run = Task { await retry.performCardAction() }
        try #require(await retryWorld.isSleeping(before: run))
        #expect(retry.sheet == nil)
        #expect(await retryWorld.repo.requestCalls == 1)
        #expect(retry.phase == .processing)
        retry.onDisappear()
        await run.value
    }

    @Test("TC-AIR-020 REQ-AIR-036 retryDirectly도 시트 없이 바로 POST한다")
    func retryDirectly() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.failedCanRetry())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing())])
        let vm = world.makeVM(surface: .home)
        await vm.onAppear()
        let run = Task { await vm.retryDirectly() }
        try #require(await world.isSleeping(before: run))
        #expect(vm.sheet == nil)
        #expect(await world.repo.requestCalls == 1)
        vm.onDisappear()
        await run.value
    }

    // MARK: 성공 응답

    @Test("TC-AIR-022 POST 202 PROCESSING이면 분석중이 되고 폴링을 시작한다")
    func postProcessingStartsPolling() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing())])
        let vm = world.makeVM()
        await vm.onAppear()
        let run = Task { await vm.confirmStart() }
        try #require(await world.isSleeping(before: run))
        #expect(vm.phase == .processing)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillProcessing, isEnabled: false))
        #expect(await world.repo.requestCalls == 1)
        vm.onDisappear()
        await run.value
    }

    @Test("REQ-AIR-010 POST 응답을 기다리는 동안 비활성 알약 'AI 요청중'을 보인다")
    func requestingPill() async throws {
        let world = AIReviewWorld()
        let hold = Hold()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postCompleted(), hold: hold)])
        let vm = world.makeVM()
        await vm.onAppear()
        let run = Task { await vm.confirmStart() }
        try #require(await world.requestEntered(atLeast: 1, before: run))
        #expect(vm.phase == .requesting)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillRequesting, isEnabled: false))
        await hold.open()
        await run.value
    }

    @Test("TC-AIR-023 POST 응답을 기다리는 중 연타해도 추가 POST는 0건이고 응답 뒤에도 다시 보내지 않는다")
    func doubleTapSendsOnePost() async throws {
        let world = AIReviewWorld()
        let hold = Hold()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing(), hold: hold)])
        let vm = world.makeVM()
        await vm.onAppear()
        let run = Task { await vm.confirmStart() }
        try #require(await world.requestEntered(atLeast: 1, before: run))
        await vm.confirmStart()
        await vm.tapPill()
        await vm.retryDirectly()
        #expect(await world.repo.requestCalls == 1)
        await hold.open()
        try #require(await world.isSleeping(before: run))
        #expect(await world.repo.requestCalls == 1)
        vm.onDisappear()
        await run.value
    }

    @Test("TC-AIR-024 이미 완료된 리뷰의 POST 200 COMPLETED는 그대로 표시하고 폴링도 시트 자동 오픈도 없다")
    func postCompletedShowsResult() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postCompleted())])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.confirmStart()
        #expect(vm.phase == .completed)
        #expect(vm.pill?.title == Copy.pillView)
        #expect(vm.sheet == nil)
        #expect(world.clock.sleeperCount == 0)
        #expect(await world.repo.statusCalls == 1)
    }

    @Test("REQ-AIR-022 POST 응답이 FAILED이면 실패 상태로 바꾸되 시트를 열지 않고 자동 재요청하지 않는다")
    func postFailedShowsFailure() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.failedCannotRetry())])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.confirmStart()
        #expect(vm.phase == .failed)
        #expect(vm.sheet == nil)
        #expect(await world.repo.requestCalls == 1)
        #expect(world.clock.sleeperCount == 0)
    }

    @Test("TC-AIR-025 재요청 POST 202 뒤 폴링 창은 이번 POST 시각부터 300초이다(이전 requestedAt 무관)")
    func retryWindowStartsAtPost() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.failedCanRetry()), .ok(try AIFixtures.processing())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing())])
        let vm = world.makeVM()
        await vm.onAppear()
        world.clock.advance(by: .seconds(100))
        await vm.tapPill()
        #expect(vm.sheet == .start(isRetry: true))
        let run = Task { await vm.confirmStart() }
        try #require(await world.tick(99, before: run))
        try #require(await world.isSleeping(before: run))
        // 첫 조회 1 + POST 뒤 폴링 99(3~297초). 창이 POST 시각(100초)부터가 아니면 이 숫자가 달라진다.
        #expect(await world.repo.statusCalls == 100)
        try #require(await world.tick(1, before: run))
        await run.value
        #expect(await world.repo.statusCalls == 100)
        #expect(vm.message?.message == Copy.pollTimeout)
        #expect(await world.repo.requestCalls == 1)
    }

    // MARK: 실패 응답

    @Test("TC-AIR-026 POST 400은 서버 message를 그대로 보여 주고 이전 단계를 유지하며 자동 재요청하지 않는다", arguments: [
        ("ai-review-post__400-limit-reached", true), ("ai-review-post__400-disabled", false),
    ])
    func postBadRequestShowsServerMessage(fixture: String, fromFailed: Bool) async throws {
        let world = AIReviewWorld()
        let serverMessage = try AIFixtures.message(fixture)
        let initial = try fromFailed ? AIFixtures.failedCanRetry() : AIFixtures.none()
        await world.repo.setStatus([.ok(initial)])
        await world.repo.setRequest([.fail(FeedFailure.badRequest(message: serverMessage))])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        await vm.confirmStart()
        #expect(vm.message?.message == serverMessage)
        #expect(vm.phase == (fromFailed ? .failed : .none))
        #expect(await world.repo.calls == [.status(postA), .request(postA)])
        #expect(world.clock.sleeperCount == 0)
    }

    @Test("TC-AIR-027 정지 회원의 POST 403은 제한 안내를 보이고 이전 상태를 유지하며 재전송하지 않는다")
    func postBannedShowsRestriction() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.fail(FeedFailure.banned)])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        await vm.confirmStart()
        #expect(vm.message?.message == Copy.errorBanned)
        #expect(vm.phase == .none)
        #expect(await world.repo.calls == [.status(postA), .request(postA)])
    }

    @Test("TC-AIR-028 POST 404이면 알약을 숨기고 추가 조회를 막는다")
    func postNotFoundHides() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.fail(FeedFailure.notFound)])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        await vm.confirmStart()
        #expect(vm.phase == .hidden)
        #expect(vm.pill == nil)
        #expect(vm.message?.message == Copy.errorNotFound)
        #expect(await world.repo.calls == [.status(postA), .request(postA)])
        #expect(world.clock.sleeperCount == 0)
    }

    @Test("TC-AIR-029 POST 401이면 로그인 안내와 재인증 필요를 알리고 재전송하지 않는다")
    func postUnauthorized() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.fail(FeedFailure.unauthorized)])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        await vm.confirmStart()
        #expect(vm.needsLogin)
        #expect(vm.message?.message == Copy.errorLogin)
        #expect(await world.repo.requestCalls == 1)
    }

    @Test("TC-AIR-030 POST 응답이 유실되면 네트워크 문구를 보이고 POST를 반복하지 않으며 GET으로 서버 상태를 동기화한다")
    func postNetworkFailureSyncsWithGet() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none()), .ok(try AIFixtures.processing())])
        await world.repo.setRequest([.fail(FeedFailure.network)])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        let run = Task { await vm.confirmStart() }
        try #require(await world.isSleeping(before: run))
        #expect(vm.message?.message == Copy.errorNetwork)
        #expect(await world.repo.calls == [.status(postA), .request(postA), .status(postA)])
        #expect(vm.phase == .processing)
        vm.onDisappear()
        await run.value
        #expect(await world.repo.requestCalls == 1)
    }

    @Test("TC-AIR-031 POST 500·응답 검증 실패는 자동 재시도 없이 오류 문구를 보이고 GET으로 동기화한다", arguments: [
        FeedFailure.server(status: 500), FeedFailure.invalidResponse,
    ])
    func postServerErrorSyncsWithGet(failure: FeedFailure) async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.fail(failure)])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        await vm.confirmStart()
        #expect(vm.message?.message == Copy.errorLoad)
        #expect(await world.repo.calls == [.status(postA), .request(postA), .status(postA)])
        #expect(vm.phase == .none)
    }

    @Test("REQ-AIR-024 POST 409(방어적)는 문구 없이 GET으로 다시 조회한다")
    func postConflictResyncs() async throws {
        let world = AIReviewWorld()
        await world.repo.setStatus([.ok(try AIFixtures.none()), .ok(try AIFixtures.completed())])
        await world.repo.setRequest([.fail(FeedFailure.server(status: 409))])
        let vm = world.makeVM()
        await vm.onAppear()
        await vm.tapPill()
        await vm.confirmStart()
        #expect(vm.message == nil)
        #expect(await world.repo.calls == [.status(postA), .request(postA), .status(postA)])
        #expect(vm.phase == .completed)
    }

    // MARK: 화면 이탈 중 응답

    @Test("TC-AIR-042 REQ-AIR-023 POST 응답이 오기 전에 화면을 벗어나면 늦게 온 응답으로 상태를 바꾸지 않는다")
    func latePostResponseIsDiscarded() async throws {
        let world = AIReviewWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing(), hold: hold)])
        let vm = world.makeVM()
        await vm.onAppear()
        let run = Task { await vm.confirmStart() }
        try #require(await world.requestEntered(atLeast: 1, before: run))
        vm.onDisappear()
        await hold.open()
        await run.value
        #expect(vm.phase == .none)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillRequest, isEnabled: true))
        #expect(vm.sheet == nil)
        #expect(vm.message == nil)
        #expect(world.clock.sleeperCount == 0)
    }

    @Test("TC-AIR-044 POST 응답을 기다리다 계정이 바뀌면 늦게 온 응답을 폐기한다")
    func latePostResponseAfterAccountSwitch() async throws {
        let world = AIReviewWorld()
        let hold = Hold(ignoringCancellation: true)
        await world.repo.setStatus([.ok(try AIFixtures.none())])
        await world.repo.setRequest([.ok(try AIFixtures.postProcessing(), hold: hold)])
        let vm = world.makeVM()
        await vm.onAppear()
        let run = Task { await vm.confirmStart() }
        try #require(await world.requestEntered(atLeast: 1, before: run))
        world.viewer.set(FeedFixtures.userB)
        await hold.open()
        await run.value
        #expect(vm.phase != .processing)
        #expect(world.clock.sleeperCount == 0)

        // 진행 중인 작업이 없는데 `.checking`/`.requesting`에 굳지 않는다: 계정 전환 알림이 새 계정 기준으로 다시 확인한다.
        await vm.viewerDidChange()
        #expect(vm.phase == .none)
        #expect(vm.pill == AIReviewViewModel.Pill(title: Copy.pillRequest, isEnabled: true))
        #expect(await world.repo.requestCalls == 1)
    }
}
