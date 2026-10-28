import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias N = NotiFixtures

/// 취소되면 세지 않는 미읽음 재조회(화면 이탈로 취소된 재조회를 흉내 낸다).
@MainActor
private final class CancellationAwareUnread: UnreadRefreshing {
    private(set) var count = 0
    func refreshUnread() async {
        if !Task.isCancelled { count += 1 }
    }
}

@MainActor
private final class HookedNavigator: NotificationNavigating {
    var onNavigate: (@MainActor () -> Void)?
    private(set) var destinations: [NotificationDestination] = []
    func navigate(to destination: NotificationDestination) {
        destinations.append(destination)
        onNavigate?()
    }
}

@MainActor
@Suite("NOTI·PUSH 리뷰 반영 회귀", .timeLimit(.minutes(1)))
struct NotificationReviewTests {
    @Test("REQ-NOTI-029 읽음 성공 뒤 이동으로 화면을 떠나도 미읽음 재조회는 취소되지 않고 1회 끝난다")
    func unreadRefreshSurvivesLeavingOnNavigate() async {
        let repo = FakeNotificationRepository()
        let navigator = HookedNavigator()
        let unread = CancellationAwareUnread()
        let toast = RecordingToast()
        let handler = NotificationTapHandler(repository: repo, navigator: navigator, toast: toast, unread: unread)
        let vm = NotificationInboxViewModel(
            repository: repo, tapHandler: handler, toast: toast, clock: TestClock(now: N.now), screens: nil
        )
        await repo.setPageHandler { _, _ in NotificationPage(currentPage: 1, pageSize: 20, hasNext: false, items: [N.item(1, type: .postApproved)]) }
        await vm.appeared()
        navigator.onNavigate = { vm.disappeared() }

        await vm.rowTapped(id: N.id(1))

        #expect(navigator.destinations.count == 1)
        #expect(unread.count == 1)
    }

    @Test("REQ-NOTI-016 목록 새로고침은 진행 중인 행 탭(읽음 PATCH)을 취소하지 않는다")
    func refreshDoesNotCancelTap() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in NotificationPage(currentPage: 1, pageSize: 20, hasNext: false, items: [N.item(1, type: .postApproved)]) }
        let vm = await w.loadedInbox()
        let hold = Hold()
        await w.repo.setReadHandler { _ in try await hold.wait() }

        let tap = Task { await vm.rowTapped(id: N.id(1)) }
        guard await EventWait.signal(w.repo.readSignal, before: tap) else {
            Issue.record("읽음 요청이 나가야 한다")
            return
        }
        await vm.refresh()
        await hold.open()
        await tap.value

        #expect(w.navigator.destinations == [.post(postId: N.post, opensAIResult: false)])
        #expect(vm.row(1)?.isUnread == false)
    }

    @Test("REQ-NOTI-009 오류 화면에서 다시 보이면 로딩 상태로 돌아가 다시 불러온다")
    func errorThenAppearedShowsLoading() async {
        let w = NotiWorld()
        await w.repo.setPageHandler { _, _ in throw FeedFailure.server(status: 500) }
        let vm = await w.loadedInbox()
        #expect(vm.phase == .error("알림을 불러오지 못했어요"))

        let hold = Hold()
        await w.repo.setPageHandler { page, _ in
            try await hold.wait()
            return N.defaultPage(page)
        }
        let task = Task { await vm.appeared() }
        guard await EventWait.signal(w.repo.pageSignal, atLeast: 2, before: task) else {
            Issue.record("두 번째 요청이 나가야 한다")
            return
        }
        #expect(vm.phase == .loading)
        await hold.open()
        await task.value
        #expect(vm.phase == .content)
    }

    @Test("REQ-PUSH-031 새 탭이 준비된 상태로 오면 이전 보류분은 버리고 새 탭만 처리한다")
    func readyTapDropsOlderPending() async {
        let w = NotiWorld()
        let store = FakePendingPushStore()
        let coordinator = PushTapCoordinator(handler: w.handler, store: store, unread: w.unread)
        let a = PushPayload(type: "POST_APPROVED", notificationId: N.id(1), sourceType: "POST", sourceId: N.post)
        let b = PushPayload(type: "TOPIC")
        await coordinator.tapped(a, gate: .blocked)
        await coordinator.tapped(b, gate: .ready)
        await coordinator.gateChanged(.ready)

        #expect(w.navigator.destinations == [.home(refreshing: true)])
        #expect(await w.repo.readRequests.isEmpty)
        #expect(coordinator.pending == nil)
        #expect(store.stored == nil)
    }
}
