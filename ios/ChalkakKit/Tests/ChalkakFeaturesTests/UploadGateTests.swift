import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private func blockedMessage(_ result: UploadGateResult) -> String? {
    if case let .blocked(notice) = result { notice.message } else { nil }
}

@MainActor
@Suite("UPL 업로드 진입 게이트", .timeLimit(.minutes(1)))
struct UploadGateTests {
    private let repo = FakePostCreationRepository()

    private func makeGate(guest: Bool = false) -> UploadGate {
        UploadGate(today: repo, viewer: StubViewer(userId: guest ? nil : FeedFixtures.userA))
    }

    @Test("TC-UPL-001 게스트가 누르면 API를 부르지 않고 로그인 필요 토스트를 낸다")
    func guestIsBlocked() async throws {
        let gate = makeGate(guest: true)
        let result = await gate.check()
        #expect(blockedMessage(result) == (try SharedCopy.require("upload.gate.login-required")))
        #expect(await repo.todayCount == 0)
    }

    @Test("TC-UPL-002 로그인·미작성이면 today를 1회 부르고 응답 topicDate를 고정해 통과시킨다")
    func notPostedProceeds() async {
        let gate = makeGate()
        let result = await gate.check()
        #expect(result == .proceed(topicDate: UploadFixtures.topicDate))
        #expect(await repo.todayCount == 1)
        #expect(!gate.isChecking)
    }

    @Test("TC-UPL-002 통과할 때 고정되는 날짜는 시계가 아니라 응답의 topicDate이다")
    func proceedUsesResponseTopicDate() async {
        await repo.setToday([.success(.notPosted(on: UploadFixtures.nextTopicDate))])
        let result = await makeGate().check()
        #expect(result == .proceed(topicDate: UploadFixtures.nextTopicDate))
    }

    @Test("TC-UPL-003 오늘 이미 작성(VALIDATING, PENDING, APPROVED)이면 업로드 화면을 열지 않고 안내한다", arguments: ModerationStatus.allCases)
    func alreadyPosted(status: ModerationStatus) async throws {
        await repo.setToday([.success(.posted(on: UploadFixtures.topicDate, status: status))])
        let result = await makeGate().check()
        #expect(blockedMessage(result) == (try SharedCopy.require("upload.gate.already-posted")))
        #expect(await repo.todayCount == 1)
    }

    @Test("TC-UPL-004 today가 404면 참여할 주제가 없다고 안내한다(message와 무관)")
    func noOpenTopic() async throws {
        await repo.setToday([.failure(FeedFailure.notFound)])
        let result = await makeGate().check()
        #expect(blockedMessage(result) == (try SharedCopy.require("upload.gate.no-open-topic")))
    }

    @Test("TC-UPL-005 today가 403이면 정지 안내를 하고 같은 요청을 다시 보내지 않는다")
    func banned() async throws {
        await repo.setToday([.failure(FeedFailure.banned)])
        let gate = makeGate()
        let result = await gate.check()
        #expect(blockedMessage(result) == (try SharedCopy.require("upload.gate.banned")))
        #expect(await repo.todayCount == 1)
    }

    @Test("TC-UPL-006 today가 갱신 뒤에도 401이면 로그인 화면으로 보내고 토스트는 없다")
    func unauthorizedGoesToLogin() async {
        await repo.setToday([.failure(FeedFailure.unauthorized)])
        let result = await makeGate().check()
        #expect(result == .loginRequired)
        #expect(await repo.todayCount == 1)
    }

    @Test("TC-UPL-007 서버 오류·연결 실패·계약 위반은 작성 여부 확인 실패 문구이고 업로드 화면은 열리지 않는다", arguments: [
        FeedFailure.server(status: 500), .network, .invalidResponse, .badRequest(message: nil), .forbidden,
    ])
    func genericFailure(error: FeedFailure) async throws {
        await repo.setToday([.failure(error)])
        let result = await makeGate().check()
        #expect(blockedMessage(result) == (try SharedCopy.require("upload.gate.check-failed")))
        #expect(await repo.todayCount == 1)
    }

    @Test("TC-UPL-008 계약 위반 응답(invalidResponse)은 일반 실패 문구로 처리한다")
    func contractViolation() async throws {
        await repo.setToday([.failure(FeedFailure.invalidResponse)])
        let result = await makeGate().check()
        #expect(blockedMessage(result) == (try SharedCopy.require("upload.gate.check-failed")))
    }

    @Test("TC-UPL-007 같은 문구가 연달아 나와도 알림 id가 달라 새 알림으로 보인다(D-20)")
    func repeatedNoticesHaveDistinctIds() async {
        let gate = makeGate(guest: true)
        let first = await gate.check()
        let second = await gate.check()
        guard case let .blocked(a) = first, case let .blocked(b) = second else {
            Issue.record("두 번 모두 blocked여야 한다")
            return
        }
        #expect(a.message == b.message)
        #expect(a.id != b.id)
    }

    @Test("TC-UPL-009 확인 중 연타하면 today는 1회만 나가고 나머지 탭은 무시된다")
    func tapsWhileCheckingAreIgnored() async {
        let hold = Hold()
        await repo.setToday([.success(UploadFixtures.notPosted)], hold: hold)
        let gate = makeGate()
        let first = Task { @MainActor in await gate.check() }
        #expect(await EventWait.signal(repo.todayEntered, before: first))
        #expect(gate.isChecking)
        #expect(await gate.check() == .ignored)
        #expect(await gate.check() == .ignored)
        await hold.open()
        #expect(await first.value == .proceed(topicDate: UploadFixtures.topicDate))
        #expect(await repo.todayCount == 1)
        #expect(!gate.isChecking)
    }

    @Test("TC-UPL-009 확인이 끝나면 다시 누를 수 있다")
    func canCheckAgainAfterFinish() async {
        let gate = makeGate()
        _ = await gate.check()
        _ = await gate.check()
        #expect(await repo.todayCount == 2)
    }

    @Test("TC-UPL-010 대기 중 화면을 정리하면 요청을 취소하고 업로드 화면은 열리지 않는다")
    func cancelWhileChecking() async {
        let hold = Hold()
        await repo.setToday([.success(UploadFixtures.notPosted)], hold: hold)
        let gate = makeGate()
        let task = Task { @MainActor in await gate.check() }
        #expect(await EventWait.signal(repo.todayEntered, before: task))
        gate.cancel()
        #expect(await task.value == .cancelled)
        #expect(!gate.isChecking)
    }

    @Test("TC-UPL-010 취소를 무시하고 뒤늦게 도착한 응답도 버려 업로드 화면이 열리지 않는다")
    func lateResponseAfterCancelIsDropped() async {
        let hold = Hold(ignoringCancellation: true)
        await repo.setToday([.success(UploadFixtures.notPosted)], hold: hold)
        let gate = makeGate()
        let task = Task { @MainActor in await gate.check() }
        #expect(await EventWait.signal(repo.todayEntered, before: task))
        gate.cancel()
        await hold.open()
        #expect(await task.value == .cancelled)
    }

    @Test("TC-UPL-010 취소 뒤 뒤늦게 도착한 403·401 응답도 토스트·로그인 이동을 만들지 않는다")
    func lateFailureAfterCancelIsDropped() async {
        let hold = Hold(ignoringCancellation: true)
        await repo.setToday([.failure(FeedFailure.banned)], hold: hold)
        let gate = makeGate()
        let task = Task { @MainActor in await gate.check() }
        #expect(await EventWait.signal(repo.todayEntered, before: task))
        gate.cancel()
        await hold.open()
        #expect(await task.value == .cancelled)
    }

    // MARK: NAV 포트(UploadEntryGating) 매핑

    @Test("TC-UPL-002 checkEntry는 통과를 open(topicDate)으로 옮긴다")
    func entryOpen() async {
        let gating: any UploadEntryGating = makeGate()
        #expect(await gating.checkEntry() == .open(topicDate: UploadFixtures.topicDate))
    }

    @Test("TC-UPL-001 checkEntry는 막힘을 declined(message: 토스트 문구)로 옮긴다")
    func entryDeclined() async throws {
        let guest: any UploadEntryGating = makeGate(guest: true)
        #expect(await guest.checkEntry() == .declined(message: try SharedCopy.require("upload.gate.login-required")))
        await repo.setToday([.success(UploadFixtures.posted)])
        let posted: any UploadEntryGating = makeGate()
        #expect(await posted.checkEntry() == .declined(message: try SharedCopy.require("upload.gate.already-posted")))
    }

    @Test("TC-UPL-006 checkEntry는 갱신 뒤 401을 loginRequired로 옮긴다")
    func entryLoginRequired() async {
        await repo.setToday([.failure(FeedFailure.unauthorized)])
        let gating: any UploadEntryGating = makeGate()
        #expect(await gating.checkEntry() == .loginRequired)
    }

    @Test("TC-UPL-009 TC-UPL-010 checkEntry는 연타(ignored)와 취소(cancelled)를 문구 없는 declined로 옮긴다")
    func entryIgnoredAndCancelled() async {
        let hold = Hold()
        await repo.setToday([.success(UploadFixtures.notPosted)], hold: hold)
        let gate = makeGate()
        let first = Task { @MainActor in await gate.checkEntry() }
        #expect(await EventWait.signal(repo.todayEntered, before: first))
        #expect(await gate.checkEntry() == .declined(message: nil))
        gate.cancel()
        #expect(await first.value == .declined(message: nil))
    }
}
