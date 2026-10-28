import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias N = NotiFixtures
private typealias F = FeedFixtures

@MainActor
private struct ShellWorld {
    let toast = RecordingToast()
    let shell: MainShellViewModel

    init(guest: Bool = false) {
        shell = MainShellViewModel(access: guest ? .guest : .member, toast: toast, screens: nil, uploadGate: FakeUploadGate())
    }
}

@MainActor
@Suite("NOTI·PUSH 내비게이션 이동(목적지 → 화면)", .timeLimit(.minutes(1)))
struct MainShellNotificationTests {
    @Test("TC-NOTI-027 TC-PUSH-039 게시물 목적지는 내 게시물 상세(.mine)를 쌓고 AI 자동 열기 요청은 만들지 않는다")
    func postDestination() {
        let w = ShellWorld()
        w.shell.navigate(to: .post(postId: N.post, opensAIResult: false))
        #expect(w.shell.path == [.feed(.mine(postId: N.post, thumbnailURL: nil))])
        #expect(w.shell.consumeAIResultRequest() == nil)
    }

    @Test("TC-NOTI-028 TC-PUSH-040 AI 목적지는 게시물 상세와 AI 결과 자동 열기 요청(소비는 한 번)을 만든다")
    func aiDestination() {
        let w = ShellWorld()
        w.shell.navigate(to: .post(postId: N.post, opensAIResult: true))
        #expect(w.shell.path == [.feed(.mine(postId: N.post, thumbnailURL: nil))])
        #expect(w.shell.aiResultRequest?.postId == N.post)
        #expect(w.shell.consumeAIResultRequest()?.postId == N.post)
        #expect(w.shell.consumeAIResultRequest() == nil)
    }

    @Test("TC-PUSH-064 같은 게시물 상세가 이미 열려 있으면 새로 쌓지 않고 교체한다")
    func samePostIsReplaced() {
        let w = ShellWorld()
        w.shell.navigate(to: .post(postId: N.post, opensAIResult: false))
        w.shell.navigate(to: .post(postId: N.post, opensAIResult: true))
        #expect(w.shell.path.count == 1)
        #expect(w.shell.aiResultRequest?.postId == N.post)
    }

    @Test("TC-NOTI-030 TC-PUSH-042 알림 상세 목적지는 notificationId로 상세를 쌓고 같은 상세가 맨 위면 쌓지 않는다")
    func notificationDetailDestination() {
        let w = ShellWorld()
        w.shell.navigate(to: .notificationDetail(notificationId: N.id(5)))
        w.shell.navigate(to: .notificationDetail(notificationId: N.id(5)))
        #expect(w.shell.path == [.notificationDetail(notificationId: N.id(5))])
    }

    @Test("TC-PUSH-037 TOPIC 홈 이동은 쌓임을 비우고 홈 탭으로 가며 맨 위 + 새로고침 요청을 한 번 만든다")
    func topicHome() {
        let w = ShellWorld()
        _ = w.shell.selectTab(.display)
        w.shell.openNotifications()
        w.shell.navigate(to: .home(refreshing: true))
        #expect(w.shell.selectedTab == .home)
        #expect(w.shell.path.isEmpty)
        #expect(w.shell.consumeHomeRequest() != nil)
        #expect(w.shell.consumeHomeRequest() == nil)
    }

    @Test("TC-PUSH-038 REMINDER 홈 이동은 새로고침 요청 없이 홈으로만 간다")
    func reminderHome() {
        let w = ShellWorld()
        _ = w.shell.selectTab(.settings)
        w.shell.navigate(to: .home(refreshing: false))
        #expect(w.shell.selectedTab == .home)
        #expect(w.shell.consumeHomeRequest() == nil)
    }

    @Test("TC-PUSH-065 이미 홈에서 TOPIC 푸시를 눌러도 화면을 더 쌓지 않고 새로고침 요청만 만든다(연속 탭은 요청이 새로 생긴다)")
    func alreadyHome() {
        let w = ShellWorld()
        w.shell.navigate(to: .home(refreshing: true))
        let first = w.shell.homeRequest
        w.shell.navigate(to: .home(refreshing: true))
        #expect(w.shell.path.isEmpty)
        #expect(w.shell.selectedTab == .home)
        #expect(first != nil)
        #expect(w.shell.homeRequest != nil && w.shell.homeRequest != first)
    }

    @Test("REQ-NOTI-026 알림함 목적지: 쌓여 있지 않으면 쌓고, 이미 아래에 있으면 그 위 화면만 닫는다")
    func inboxDestination() {
        let w = ShellWorld()
        w.shell.navigate(to: .inbox)
        #expect(w.shell.path == [.notifications])

        w.shell.navigate(to: .notificationDetail(notificationId: N.id(2)))
        #expect(w.shell.path == [.notifications, .notificationDetail(notificationId: N.id(2))])
        w.shell.navigate(to: .inbox)
        #expect(w.shell.path == [.notifications], "알림함이 아래에 있으면 상세만 닫는다")
        w.shell.navigate(to: .inbox)
        #expect(w.shell.path == [.notifications])
    }

    @Test("REQ-NOTI-026 푸시로 열린 반려 상세(알림함 없음)에서 알림함으로 가면 알림함이 쌓인다")
    func inboxFromPushDetail() {
        let w = ShellWorld()
        w.shell.navigate(to: .notificationDetail(notificationId: N.id(2)))
        w.shell.navigate(to: .inbox)
        #expect(w.shell.path.last == .notifications)
    }

    @Test("REQ-NAV-017 게스트는 알림함 목적지로 갈 수 없다(토스트, 쌓임 없음)")
    func guestCannotOpenInbox() {
        let w = ShellWorld(guest: true)
        w.shell.navigate(to: .inbox)
        #expect(w.shell.path.isEmpty)
        #expect(w.toast.messages == [NavCopy.guestNotification])
    }
}
