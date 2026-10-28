import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias N = NotiFixtures

private let approved = PushPayload(type: "POST_APPROVED", notificationId: N.id(1), sourceType: "POST", sourceId: N.post)
private let topic = PushPayload(type: "TOPIC", notificationId: nil, sourceType: "TOPIC", sourceId: UUID(uuidString: "11111111-1111-4111-8111-111111111127"))
private let approvedDestination = NotificationDestination.post(postId: N.post, opensAIResult: false)

@MainActor
private struct PushWorld {
    let w = NotiWorld()
    let store: FakePendingPushStore

    init(stored: PushPayload? = nil) { store = FakePendingPushStore(stored: stored) }

    func makeCoordinator() -> PushTapCoordinator {
        PushTapCoordinator(handler: w.handler, store: store, unread: w.unread)
    }
}

@MainActor
@Suite("PUSH 푸시 탭 게이트·보류", .timeLimit(.minutes(1)))
struct PushTapCoordinatorTests {
    @Test("TC-PUSH-039 준비된 상태의 탭은 읽음 후 바로 이동한다")
    func readyTapNavigates() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .ready)
        #expect(await p.w.repo.readRequests == [N.id(1)])
        #expect(p.w.navigator.destinations == [approvedDestination])
        #expect(coordinator.pending == nil)
    }

    @Test("TC-PUSH-037 TC-PUSH-038 TOPIC·REMINDER 탭은 읽음 호출 0건으로 홈으로 간다")
    func topicTap() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(topic, gate: .ready)
        await coordinator.tapped(PushPayload(type: "REMINDER"), gate: .ready)
        #expect(await p.w.repo.readRequests.isEmpty)
        #expect(p.w.navigator.destinations == [.home(refreshing: true), .home(refreshing: false)])
    }

    @Test("TC-PUSH-044 알 수 없는 type 탭은 읽음 0건으로 알림함으로 간다")
    func unknownTypeGoesToInbox() async {
        let p = PushWorld()
        await p.makeCoordinator().tapped(PushPayload(type: "FUTURE"), gate: .ready)
        #expect(await p.w.repo.readRequests.isEmpty)
        #expect(p.w.navigator.destinations == [.inbox])
    }

    @Test("TC-PUSH-058 로그아웃 상태의 탭은 앱만 열리고 이동 대기도 저장하지 않으며 이후 로그인해도 이동하지 않는다")
    func loggedOutDiscards() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .loggedOut)
        #expect(coordinator.pending == nil)
        #expect(p.store.stored == nil)
        #expect(p.store.saveCount == 0)

        await coordinator.gateChanged(.ready)
        #expect(p.w.navigator.destinations.isEmpty)
        #expect(await p.w.repo.readRequests.isEmpty)

        await coordinator.tapped(approved, gate: .ready) // 대조: 준비된 상태의 새 탭은 처리된다
        #expect(p.w.navigator.destinations == [approvedDestination])
    }

    @Test("TC-PUSH-059 게스트의 탭은 버리고 앱만 열린다")
    func guestDiscards() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .guest)
        await coordinator.gateChanged(.ready)
        #expect(p.w.navigator.destinations.isEmpty)
        #expect(p.store.stored == nil)

        await coordinator.tapped(approved, gate: .ready) // 대조
        #expect(p.w.navigator.destinations == [approvedDestination])
    }

    @Test("TC-PUSH-060 사인 미리보기 등 막힌 화면에서는 보류했다가 화면을 벗어난 뒤 처리한다")
    func blockedDefersThenProcesses() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .blocked)
        #expect(coordinator.pending == approved)
        #expect(p.w.navigator.destinations.isEmpty)
        #expect(await p.w.repo.readRequests.isEmpty)

        await coordinator.gateChanged(.ready)
        #expect(p.w.navigator.destinations == [approvedDestination])
        #expect(coordinator.pending == nil)
    }

    @Test("TC-PUSH-061 업로드·피드백 작성 중에는 이동을 차단하고 보류한다(화면을 벗어나기 전까지 반복 알림에도 처리하지 않는다)")
    func blockedStaysBlocked() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .blocked)
        await coordinator.gateChanged(.blocked)
        await coordinator.gateChanged(.mainNotReady)
        #expect(p.w.navigator.destinations.isEmpty)
        #expect(coordinator.pending == approved)
    }

    @Test("TC-PUSH-062 콜드 스타트 탭은 메인이 준비될 때까지 버퍼링했다가 정확히 1회만 소비한다")
    func coldStartBuffersAndConsumesOnce() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(topic, gate: .mainNotReady)
        #expect(p.w.navigator.destinations.isEmpty)

        await coordinator.gateChanged(.ready)
        await coordinator.gateChanged(.ready)
        #expect(p.w.navigator.destinations == [.home(refreshing: true)])
        #expect(p.store.stored == nil)
    }

    @Test("TC-PUSH-063 보류 중인 탭은 프로세스 종료 후 복원되고, 소비 뒤에는 저장되지 않으며, 새 탭은 이전 보류분을 교체한다")
    func pendingSurvivesProcessDeath() async {
        let p = PushWorld()
        let first = p.makeCoordinator()
        await first.tapped(approved, gate: .blocked)
        #expect(p.store.stored == approved)

        await first.tapped(topic, gate: .blocked) // 새 푸시 탭이 이전 보류분을 교체한다
        #expect(p.store.stored == topic)

        let restored = PushTapCoordinator(handler: p.w.handler, store: p.store, unread: p.w.unread)
        restored.restorePending()
        #expect(restored.pending == topic)

        await restored.gateChanged(.ready)
        #expect(p.w.navigator.destinations == [.home(refreshing: true)])
        #expect(p.store.stored == nil)
        #expect(restored.pending == nil)
    }

    @Test("TC-PUSH-052 같은 푸시가 두 번 탭되면 eventId로 걸러 내지 않고 각각 처리한다")
    func sameEventIsNotDeduplicated() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .ready)
        await coordinator.tapped(approved, gate: .ready)
        #expect(await p.w.repo.readRequests.count == 2)
        #expect(p.w.navigator.destinations.count == 2)
    }

    @Test("TC-PUSH-066 푸시 탭 뒤 로그인 계정이 바뀌면 대기 중인 이동을 버린다")
    func accountChangeDiscardsPending() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .blocked)
        #expect(coordinator.pending == approved)
        coordinator.accountChanged()
        #expect(coordinator.pending == nil)
        #expect(p.store.stored == nil)

        await coordinator.gateChanged(.ready)
        #expect(p.w.navigator.destinations.isEmpty)
    }

    @Test("TC-PUSH-058 보류 중 로그아웃·게스트가 되면 보류분을 버린다", arguments: [PushGate.loggedOut, .guest])
    func gateBecomingUnauthenticatedDiscards(gate: PushGate) async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .blocked)
        #expect(coordinator.pending == approved)
        await coordinator.gateChanged(gate)
        await coordinator.gateChanged(.ready)
        #expect(coordinator.pending == nil)
        #expect(p.w.navigator.destinations.isEmpty)
        #expect(p.store.stored == nil)
    }

    @Test("TC-PUSH-057 푸시 탭의 읽음이 갱신 후에도 401이면 로그인 화면으로 가고 대기 이동은 폐기한다")
    func unauthorizedReadDiscardsPending() async {
        let p = PushWorld()
        await p.w.repo.setReadHandler { _ in throw FeedFailure.unauthorized }
        let coordinator = p.makeCoordinator()
        await coordinator.tapped(approved, gate: .ready)
        #expect(coordinator.needsLogin)
        #expect(coordinator.pending == nil)
        #expect(p.store.stored == nil)
        #expect(p.w.navigator.destinations.isEmpty)
    }

    @Test("TC-PUSH-055 푸시 탭의 읽음이 404면 토스트와 함께 이동하지 않는다(접근할 수 없는 알림 내용을 보이지 않는다)")
    func notFoundTap() async {
        let p = PushWorld()
        await p.w.repo.setReadHandler { _ in throw FeedFailure.notFound }
        await p.makeCoordinator().tapped(approved, gate: .ready)
        #expect(p.w.toast.messages == ["더 이상 확인할 수 없는 알림이에요."])
        #expect(p.w.navigator.destinations.isEmpty)
    }

    @Test("TC-PUSH-071 TC-NOTI-050 푸시를 받으면(포그라운드·백그라운드) 미읽음을 다시 조회한다")
    func receivedRefreshesUnread() async {
        let p = PushWorld()
        let coordinator = p.makeCoordinator()
        await coordinator.received()
        #expect(p.w.unread.count == 1)
        #expect(p.w.navigator.destinations.isEmpty)
        #expect(await p.w.repo.readRequests.isEmpty)
    }
}
