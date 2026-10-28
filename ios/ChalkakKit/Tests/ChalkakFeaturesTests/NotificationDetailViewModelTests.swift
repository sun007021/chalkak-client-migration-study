import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias N = NotiFixtures

@MainActor
@Suite("NOTI 알림 상세", .timeLimit(.minutes(1)))
struct NotificationDetailViewModelTests {
    @Test("TC-NOTI-041 상세는 GET으로 불러오기만 하고 읽음 PATCH를 보내지 않는다")
    func loadsWithoutMarkingRead() async {
        let w = NotiWorld()
        let vm = w.makeDetail(2)
        #expect(vm.phase == .loading)

        await vm.appeared()

        #expect(await w.repo.detailRequests == [N.id(2)])
        #expect(await w.repo.readRequests.isEmpty)
        #expect(vm.phase == .content(N.detail(2)))
    }

    @Test("TC-NOTI-048 알림 상세가 보이면 screen_view notification_detail을 1회 보낸다")
    func screenView() async {
        let w = NotiWorld()
        let vm = w.makeDetail()
        await vm.appeared()
        await vm.appeared()
        #expect(w.analytics.events == [.screenView(.notificationDetail, screenClass: nil)])
    }

    @Test("TC-NOTI-045 상세 404면 이전 알림 정보 없이 gone 상태, 토스트 \"더 이상 확인할 수 없는 알림이에요.\", 미읽음 새로고침")
    func notFound() async {
        let w = NotiWorld()
        await w.repo.setDetailHandler { _ in throw FeedFailure.notFound }
        let vm = w.makeDetail()
        await vm.appeared()
        #expect(vm.phase == .gone)
        #expect(w.toast.messages == ["더 이상 확인할 수 없는 알림이에요."])
        #expect(w.unread.count == 1)
    }

    @Test("TC-NOTI-046 상세 로드가 500이면 오류 문구와 함께 다시 시도할 수 있고 시도하면 재요청한다")
    func serverErrorThenRetry() async {
        let w = NotiWorld()
        await w.repo.setDetailHandler { _ in throw FeedFailure.server(status: 500) }
        let vm = w.makeDetail()
        await vm.appeared()
        #expect(vm.phase == .error("알림을 불러오지 못했어요"))

        await w.repo.setDetailHandler { _ in N.detail(2) }
        await vm.retry()
        #expect(await w.repo.detailRequests.count == 2)
        #expect(vm.phase == .content(N.detail(2)))
    }

    @Test("TC-NOTI-046 상세 로드가 연결 실패면 \"네트워크 연결을 확인해 주세요.\"와 다시 시도 상태다")
    func networkError() async {
        let w = NotiWorld()
        await w.repo.setDetailHandler { _ in throw FeedFailure.network }
        let vm = w.makeDetail()
        await vm.appeared()
        #expect(vm.phase == .error("네트워크 연결을 확인해 주세요."))
    }

    @Test("REQ-NOTI-027 상세 401(갱신 후에도)은 로그인 화면으로 간다")
    func unauthorized() async {
        let w = NotiWorld()
        await w.repo.setDetailHandler { _ in throw FeedFailure.unauthorized }
        let vm = w.makeDetail()
        await vm.appeared()
        #expect(vm.needsLogin)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("REQ-NOTI-027 화면 이탈로 취소되면 상태·토스트가 바뀌지 않는다")
    func leavingCancels() async {
        let w = NotiWorld()
        let hold = Hold(ignoringCancellation: true)
        await w.repo.setDetailHandler { _ in
            try await hold.wait()
            return N.detail(2)
        }
        let vm = w.makeDetail()
        let task = Task { await vm.appeared() }
        guard await EventWait.signal(w.repo.detailSignal, before: task) else {
            Issue.record("상세 요청이 나가야 한다")
            return
        }
        vm.disappeared()
        await hold.open()
        await task.value
        #expect(vm.phase == .loading)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("REQ-NOTI-026 \"알림함으로\" 버튼은 알림함 목록으로 이동한다")
    func backToInbox() async {
        let w = NotiWorld()
        let vm = w.makeDetail()
        await vm.appeared()
        vm.backToInbox()
        #expect(w.navigator.destinations == [.inbox])
    }
}
