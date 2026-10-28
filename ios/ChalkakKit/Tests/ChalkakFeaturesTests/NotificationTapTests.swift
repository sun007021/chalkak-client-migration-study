import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias N = NotiFixtures

@MainActor
@Suite("NOTI 알림함 행 탭·읽음 처리", .timeLimit(.minutes(1)))
struct NotificationInboxTapTests {
    private func inbox(_ w: NotiWorld, items: [NotificationItem]) async -> NotificationInboxViewModel {
        await w.repo.setPageHandler { _, _ in NotificationPage(currentPage: 1, pageSize: 20, hasNext: false, items: items) }
        return await w.loadedInbox()
    }

    // MARK: 목적지

    @Test("TC-NOTI-024 알 수 없는 type 행은 표시되고 탭해도 이동·읽음 호출이 없다(알림함에 머문다)")
    func unknownTypeRow() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .unknown("FUTURE_TYPE"), sourceType: nil, sourceId: nil)])
        #expect(vm.rows.count == 1)
        await vm.rowTapped(id: N.id(1))
        #expect(await w.repo.readRequests.isEmpty)
        #expect(w.navigator.destinations.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NOTI-025 TOPIC·REMINDER 행은 읽음 호출 없이 홈으로 이동한다", arguments: [NotificationType.topic, .reminder])
    func topicReminderRow(type: NotificationType) async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: type, sourceType: "TOPIC", sourceId: "11111111-1111-4111-8111-111111111127")])
        await vm.rowTapped(id: N.id(1))
        #expect(await w.repo.readRequests.isEmpty)
        guard case .home? = w.navigator.destinations.first, w.navigator.destinations.count == 1 else {
            Issue.record("홈으로 한 번 이동해야 한다: \(w.navigator.destinations)")
            return
        }
    }

    @Test("TC-NOTI-026 sourceType·sourceId가 null인 승인 행은 이동도 읽음 호출도 오류도 없다")
    func nullSourceRow() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved, sourceType: nil, sourceId: nil)])
        #expect(vm.rows.count == 1)
        await vm.rowTapped(id: N.id(1))
        #expect(await w.repo.readRequests.isEmpty)
        #expect(w.navigator.destinations.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NOTI-027 승인 행: 읽음 성공 후 게시물 상세로 이동한다")
    func approvedRow() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        await vm.rowTapped(id: N.id(1))
        #expect(await w.repo.readRequests == [N.id(1)])
        #expect(w.navigator.destinations == [.post(postId: N.post, opensAIResult: false)])
    }

    @Test("TC-NOTI-028 AI 리뷰 행: 읽음 후 게시물 상세 + AI 결과 자동 열기", arguments: [NotificationType.aiReviewCompleted, .aiReviewFailed])
    func aiRow(type: NotificationType) async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: type)])
        await vm.rowTapped(id: N.id(1))
        #expect(w.navigator.destinations == [.post(postId: N.post, opensAIResult: true)])
    }

    @Test("TC-NOTI-029 AI 알림의 sourceType이 POST가 아니거나 sourceId가 UUID가 아니면 이동하지 않는다")
    func badAISource() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [
            N.item(1, type: .aiReviewCompleted, sourceType: "NOTICE"), N.item(2, type: .aiReviewCompleted, sourceId: "not-a-uuid"),
        ])
        #expect(vm.rows.count == 2)
        await vm.rowTapped(id: N.id(1))
        await vm.rowTapped(id: N.id(2))
        #expect(w.navigator.destinations.isEmpty)
        #expect(await w.repo.readRequests.isEmpty)
    }

    @Test("TC-NOTI-030 공지 행: 읽음 성공 후 notificationId로 알림 상세가 열린다")
    func noticeRow() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(5, type: .notice, sourceType: "NOTICE", sourceId: "77777777-7777-4777-8777-777777777701")])
        await vm.rowTapped(id: N.id(5))
        #expect(w.navigator.destinations == [.notificationDetail(notificationId: N.id(5))])
    }

    @Test("TC-NOTI-031 반려 행: 읽음 성공 후 알림 상세가 열린다")
    func rejectedRow() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(2, type: .postRejected)])
        await vm.rowTapped(id: N.id(2))
        #expect(await w.repo.readRequests == [N.id(2)])
        #expect(w.navigator.destinations == [.notificationDetail(notificationId: N.id(2))])
    }

    // MARK: 읽음 결과

    @Test("TC-NOTI-032 읽음이 연결 실패면 토스트를 띄우고 이동은 하며 행의 미읽음 상태는 그대로다")
    func readNetworkFailure() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        await w.repo.setReadHandler { _ in throw FeedFailure.network }

        await vm.rowTapped(id: N.id(1))

        #expect(w.toast.messages == ["읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요."])
        #expect(w.navigator.destinations == [.post(postId: N.post, opensAIResult: false)])
        #expect(vm.row(1)?.isUnread == true)
    }

    @Test("TC-NOTI-033 읽음이 404면 토스트 \"더 이상 확인할 수 없는 알림이에요.\", 목록·미읽음 새로고침, 이동 안 함")
    func readNotFound() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        await w.repo.setReadHandler { _ in throw FeedFailure.notFound }

        await vm.rowTapped(id: N.id(1))

        #expect(w.toast.messages == ["더 이상 확인할 수 없는 알림이에요."])
        #expect(w.navigator.destinations.isEmpty)
        #expect(await w.repo.pageRequests == [1, 1], "목록 새로고침")
        #expect(w.unread.count == 1, "미읽음 새로고침")
    }

    @Test("TC-NOTI-034 읽음이 500·403·400이면 404와 같게 처리하고 이동하지 않는다", arguments: [
        FeedFailure.server(status: 500), .forbidden, .badRequest(message: nil),
    ])
    func readOtherFailures(failure: FeedFailure) async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        await w.repo.setReadHandler { _ in throw failure }

        await vm.rowTapped(id: N.id(1))

        #expect(w.toast.messages == ["더 이상 확인할 수 없는 알림이에요."])
        #expect(w.navigator.destinations.isEmpty)
        #expect(await w.repo.pageRequests == [1, 1])
    }

    @Test("TC-NOTI-035 읽음이 갱신 후에도 401이면 이동하지 않고 로그인 화면으로 간다(토스트 없음)")
    func readUnauthorized() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        await w.repo.setReadHandler { _ in throw FeedFailure.unauthorized }
        await vm.rowTapped(id: N.id(1))
        #expect(vm.needsLogin)
        #expect(w.navigator.destinations.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NOTI-036 읽음 성공 후 해당 행이 읽음으로 바뀌고 미읽음 점이 다시 조회된다")
    func readSuccessMarksRow() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved), N.item(2, type: .postRejected)])
        await vm.rowTapped(id: N.id(1))
        #expect(vm.row(1)?.isUnread == false)
        #expect(vm.row(2)?.isUnread == true)
        #expect(w.unread.count == 1)
    }

    @Test("TC-NOTI-037 이미 읽은 행을 다시 탭해도 로컬 readAt은 최초 값을 유지하고 성공 처리한다")
    func alreadyReadKeepsReadAt() async {
        let w = NotiWorld()
        let item = N.item(1, type: .postApproved, read: true)
        let vm = await inbox(w, items: [item])
        await vm.rowTapped(id: N.id(1))
        #expect(vm.row(1)?.readAt == item.readAt)
        #expect(w.navigator.destinations == [.post(postId: N.post, opensAIResult: false)])
    }

    @Test("TC-NOTI-038 같은 행을 빠르게 연타하면 읽음 PATCH 1회, 이동 1회다")
    func doubleTap() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        let hold = Hold()
        await w.repo.setReadHandler { _ in try await hold.wait() }

        let first = Task { await vm.rowTapped(id: N.id(1)) }
        guard await EventWait.signal(w.repo.readSignal, before: first) else {
            Issue.record("읽음 요청이 나가야 한다")
            return
        }
        await vm.rowTapped(id: N.id(1))
        await vm.rowTapped(id: N.id(1))
        await hold.open()
        await first.value

        #expect(await w.repo.readRequests.count == 1)
        #expect(w.navigator.destinations.count == 1)
    }

    @Test("TC-NOTI-039 읽음 PATCH 중 화면을 떠나면 응답이 와도 이동하지 않고 오류도 없다")
    func leavingDuringRead() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        let hold = Hold(ignoringCancellation: true)
        await w.repo.setReadHandler { _ in try await hold.wait() }

        let task = Task { await vm.rowTapped(id: N.id(1)) }
        guard await EventWait.signal(w.repo.readSignal, before: task) else {
            Issue.record("읽음 요청이 나가야 한다")
            return
        }
        vm.disappeared()
        await hold.open()
        await task.value

        #expect(w.navigator.destinations.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NOTI-040 읽음 PATCH 중 로그아웃·계정 전환(reset)이면 응답이 와도 이동하거나 이전 목록에 반영하지 않는다")
    func accountSwitchDuringRead() async {
        let w = NotiWorld()
        let vm = await inbox(w, items: [N.item(1, type: .postApproved)])
        let hold = Hold(ignoringCancellation: true)
        await w.repo.setReadHandler { _ in try await hold.wait() }

        let task = Task { await vm.rowTapped(id: N.id(1)) }
        guard await EventWait.signal(w.repo.readSignal, before: task) else {
            Issue.record("읽음 요청이 나가야 한다")
            return
        }
        vm.reset()
        w.handler.reset()
        await hold.open()
        await task.value

        #expect(w.navigator.destinations.isEmpty)
        #expect(vm.rows.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }
}

@MainActor
@Suite("NOTI·PUSH 탭 처리기(알림함 행과 푸시 공통)", .timeLimit(.minutes(1)))
struct NotificationTapHandlerTests {
    private let plan = NotificationTapPlan.markReadThenNavigate(notificationId: N.id(1), destination: .post(postId: N.post, opensAIResult: false))

    @Test("TC-PUSH-053 읽음 성공이면 이동하고 미읽음을 다시 조회한다")
    func success() async {
        let w = NotiWorld()
        let outcome = await w.handler.perform(plan)
        #expect(outcome == .navigated)
        #expect(await w.repo.readRequests == [N.id(1)])
        #expect(w.navigator.destinations == [.post(postId: N.post, opensAIResult: false)])
        #expect(w.unread.count == 1)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-PUSH-054 읽음이 연결 실패면 토스트 \"읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요.\" 후 이동한다")
    func networkFailure() async {
        let w = NotiWorld()
        await w.repo.setReadHandler { _ in throw FeedFailure.network }
        let outcome = await w.handler.perform(plan)
        #expect(outcome == .navigated)
        #expect(w.toast.messages == ["읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요."])
        #expect(w.navigator.destinations.count == 1)
    }

    @Test("TC-PUSH-055 읽음이 404면 토스트 \"더 이상 확인할 수 없는 알림이에요.\", 미읽음 새로고침, 이동 안 함")
    func notFound() async {
        let w = NotiWorld()
        await w.repo.setReadHandler { _ in throw FeedFailure.notFound }
        let outcome = await w.handler.perform(plan)
        #expect(outcome == .gone)
        #expect(w.toast.messages == ["더 이상 확인할 수 없는 알림이에요."])
        #expect(w.navigator.destinations.isEmpty)
        #expect(w.unread.count == 1)
    }

    @Test("TC-PUSH-056 읽음이 500·403이면 404와 같게 처리한다", arguments: [FeedFailure.server(status: 500), .forbidden])
    func otherFailures(failure: FeedFailure) async {
        let w = NotiWorld()
        await w.repo.setReadHandler { _ in throw failure }
        let outcome = await w.handler.perform(plan)
        #expect(outcome == .gone)
        #expect(w.toast.messages == ["더 이상 확인할 수 없는 알림이에요."])
        #expect(w.navigator.destinations.isEmpty)
    }

    @Test("TC-NOTI-035 읽음이 갱신 후에도 401이면 이동 없이 로그인으로 간다")
    func unauthorizedFromRow() async {
        let w = NotiWorld()
        await w.repo.setReadHandler { _ in throw FeedFailure.unauthorized }
        let outcome = await w.handler.perform(plan)
        #expect(outcome == .loginRequired)
        #expect(w.navigator.destinations.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-PUSH-057 푸시 탭의 읽음이 갱신 후에도 401이면 이동 없이 로그인으로 간다")
    func unauthorizedFromPush() async {
        let w = NotiWorld()
        await w.repo.setReadHandler { _ in throw FeedFailure.unauthorized }
        let outcome = await w.handler.perform(plan)
        #expect(outcome == .loginRequired)
        #expect(w.navigator.destinations.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("읽음 요청이 필요 없는 이동은 PATCH 없이 바로 이동하고, ignore는 아무 일도 하지 않는다")
    func plainNavigationAndIgnore() async {
        let w = NotiWorld()
        #expect(await w.handler.perform(.navigate(.inbox)) == .navigated)
        #expect(await w.handler.perform(.ignore) == .ignored)
        #expect(await w.repo.readRequests.isEmpty)
        #expect(w.navigator.destinations == [.inbox])
    }

    @Test("TC-NOTI-038 같은 알림의 읽음이 진행 중이면 두 번째 perform은 무시된다")
    func inFlightDuplicateIsIgnored() async {
        let w = NotiWorld()
        let hold = Hold()
        await w.repo.setReadHandler { _ in try await hold.wait() }
        let first = Task { await w.handler.perform(plan) }
        guard await EventWait.signal(w.repo.readSignal, before: first) else {
            Issue.record("읽음 요청이 나가야 한다")
            return
        }
        #expect(await w.handler.perform(plan) == .ignored)
        await hold.open()
        #expect(await first.value == .navigated)
        #expect(await w.repo.readRequests.count == 1)
        #expect(w.navigator.destinations.count == 1)
    }
}
