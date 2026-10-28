import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private typealias F = FeedFixtures

@MainActor
private struct ShellWorld {
    let toast = RecordingToast()
    let analytics = RecordingAnalytics()
    let gate: FakeUploadGate
    let shell: MainShellViewModel

    init(guest: Bool = false, gate: FakeUploadGate = FakeUploadGate()) {
        self.gate = gate
        shell = MainShellViewModel(
            access: guest ? .guest : .member, toast: toast,
            screens: ScreenTracker(tracker: analytics), uploadGate: gate
        )
    }

    var tab: MainTab { shell.selectedTab }
}

private let someEntry = PostDetailEntry.listItem(F.listItem(1))
private let otherEntry = PostDetailEntry.listItem(F.listItem(2))

@MainActor
@Suite("NAV 메인 셸(탭·업로드 버튼·쌓임)", .timeLimit(.minutes(1)))
struct MainShellViewModelTests {
    // MARK: 탭 상태

    @Test("TC-NAV-003 메인 첫 진입에는 홈이 선택되어 있고 쌓인 화면이 없어 하단 바가 보인다", arguments: [false, true])
    func startsOnHome(guest: Bool) {
        let w = ShellWorld(guest: guest)
        #expect(w.tab == .home)
        #expect(w.shell.path.isEmpty)
        #expect(w.shell.isBottomBarVisible)
        #expect(w.shell.displayRequest == nil)
        #expect(w.shell.recordRequest == nil)
    }

    @Test("TC-NAV-004 홈에서 전시·기록·설정 탭을 차례로 누르면 선택 표시가 따라오고 탭마다 destination 이벤트가 한 번씩 나간다")
    func tabsFollowSelection() {
        let w = ShellWorld()
        for tab in [MainTab.display, .record, .settings] {
            #expect(w.shell.selectTab(tab) == .selected)
            #expect(w.tab == tab)
        }
        #expect(w.analytics.events == [
            .bottomNavigationSelected(.display), .bottomNavigationSelected(.record), .bottomNavigationSelected(.settings),
        ])
    }

    @Test("TC-NAV-008 이미 선택된 탭을 다시 누르면 reselected이고 같은 탭 루트가 쌓이지 않으며 재선택도 destination 이벤트를 보낸다")
    func reselectDoesNotStack() {
        let w = ShellWorld()
        #expect(w.shell.selectTab(.display) == .selected)
        #expect(w.shell.selectTab(.display) == .reselected)
        #expect(w.tab == .display)
        #expect(w.shell.path.isEmpty)
        #expect(w.shell.selectTab(.home) == .selected)
        #expect(w.shell.selectTab(.home) == .reselected)
        #expect(w.analytics.events.count == 4)
    }

    // MARK: 업로드 버튼

    @Test("TC-NAV-005 인증 사용자의 업로드 버튼은 선택 탭을 바꾸지 않고 게이트를 1회 시작하며, 통과하면 업로드 화면이 쌓인다")
    func uploadButtonStartsGate() async {
        let w = ShellWorld(gate: FakeUploadGate(result: .open(topicDate: F.today)))
        w.shell.selectTab(.settings)
        let before = w.analytics.events.count

        await w.shell.startUpload()

        #expect(await w.gate.count == 1)
        #expect(w.tab == .settings)
        #expect(w.shell.path == [.upload(topicDate: F.today)])
        #expect(!w.shell.isBottomBarVisible)
        #expect(w.analytics.events.count == before, "업로드 버튼은 bottom_navigation_selected를 보내지 않는다")

        w.shell.pop()   // TC-NAV-006의 로직 구간: 닫으면 설정 탭으로 돌아온다
        #expect(w.tab == .settings)
        #expect(w.shell.path.isEmpty)
        #expect(w.shell.isBottomBarVisible)
    }

    @Test("TC-NAV-007 업로드 버튼을 연타해도 게이트 확인 중에는 요청이 1회이고 업로드 화면도 하나만 열린다")
    func uploadMashingRunsGateOnce() async {
        let hold = Hold()
        let w = ShellWorld(gate: FakeUploadGate(hold: hold))
        let first = Task { await w.shell.startUpload() }
        guard await EventWait.signal(w.gate.entered, before: first) else {
            Issue.record("게이트가 시작되어야 한다")
            return
        }

        await w.shell.startUpload()    // 확인 중 재탭
        await w.shell.startUpload()
        #expect(await w.gate.count == 1)
        #expect(w.shell.path.isEmpty)

        await hold.open()
        await first.value
        #expect(await w.gate.count == 1)
        #expect(w.shell.path == [.upload(topicDate: F.today)])

        await w.shell.startUpload()    // 끝난 뒤 다시 누르면 새 게이트(이미 업로드 화면이 있어도 중복해서 쌓지 않는다)
        #expect(w.shell.path == [.upload(topicDate: F.today)])
    }

    @Test("게이트가 통과하지 못하면(이미 작성·주제 없음·정지) 안내 토스트만 보이고 화면은 열리지 않는다. 문구가 없으면 토스트도 없다")
    func gateDeclined() async {
        let gate = FakeUploadGate(result: .declined(message: "이미 이 주제에 게시물을 작성했어요."))
        let w = ShellWorld(gate: gate)
        await w.shell.startUpload()
        #expect(w.toast.messages == ["이미 이 주제에 게시물을 작성했어요."])
        #expect(w.shell.path.isEmpty)

        await gate.setResult(.declined(message: nil))
        await w.shell.startUpload()
        #expect(w.toast.messages.count == 1)
        #expect(w.shell.path.isEmpty)
        #expect(!w.shell.needsLogin)
    }

    @Test("REQ-NAV-036 게이트가 갱신 후에도 401이면 로그인 화면으로 가야 하고(needsLogin) 소비하면 되돌린다")
    func gateLoginRequired() async {
        let w = ShellWorld(gate: FakeUploadGate(result: .loginRequired))
        await w.shell.startUpload()
        #expect(w.shell.needsLogin)
        #expect(w.shell.path.isEmpty)
        w.shell.consumeNeedsLogin()
        #expect(!w.shell.needsLogin)
    }

    // MARK: 게스트 제한 (네트워크·게이트 0건 + 토스트)

    @Test("TC-NAV-016 게스트가 기록 탭을 누르면 탭이 바뀌지 않고 토스트만 뜨며 이동 이벤트도 없다. 홈·전시·설정은 열린다")
    func guestRecordBlocked() throws {
        let w = ShellWorld(guest: true)
        #expect(w.shell.selectTab(.record) == .blocked)
        #expect(w.tab == .home)
        #expect(w.toast.messages == ["기록을 보려면 로그인이 필요해요"])
        #expect(w.analytics.events.isEmpty)

        #expect(w.shell.selectTab(.display) == .selected)
        #expect(w.shell.selectTab(.settings) == .selected)
        #expect(w.tab == .settings)
        #expect(w.toast.messages.count == 1)
    }

    @Test("TC-NAV-017 게스트가 업로드 버튼을 누르면 토스트만 뜨고 게이트(GET /posts/today)는 0회, 업로드 화면은 열리지 않는다")
    func guestUploadBlocked() async {
        let w = ShellWorld(guest: true)
        await w.shell.startUpload()
        #expect(await w.gate.count == 0)
        #expect(w.shell.path.isEmpty)
        #expect(w.toast.messages == ["게시물을 추가하려면 로그인이 필요해요"])
    }

    @Test("TC-NAV-018 게스트가 게시물 상세(전시 카드·랭킹·인기 사진)를 열려 하면 이동 없이 토스트만 뜬다")
    func guestFeedBlocked() {
        let w = ShellWorld(guest: true)
        w.shell.openFeed(someEntry)
        w.shell.openFeed(.mine(postId: F.postID(9), thumbnailURL: nil))
        #expect(w.shell.path.isEmpty)
        #expect(w.toast.messages == ["게시물 피드를 보려면 로그인이 필요해요", "게시물 피드를 보려면 로그인이 필요해요"])
    }

    @Test("TC-NAV-019 TC-NAV-023 게스트 좋아요 탭은 API 0건이고 토스트 문구는 nav.guest.like와 같다(공용 좋아요 조율기)")
    func guestLikeToast() async {
        let repo = FakeLikeRepository()
        let recorder = LikeEventRecorder()
        let coordinator = LikeCoordinator(repository: repo, viewer: StubViewer(userId: nil), sink: recorder)

        let result = coordinator.tap(postId: F.postID(1), current: LikeState(isLiked: false, likeCount: 3))

        #expect(result == .guestBlocked)
        #expect(await repo.calls.isEmpty)
        #expect(coordinator.state(for: F.postID(1)) == nil)
        let messages = recorder.events.compactMap { event -> String? in
            if case let .toast(notice) = event { notice.message } else { nil }
        }
        #expect(messages == [NavCopy.guestLike])
        #expect(NavCopy.guestLike == "좋아요를 누르려면 로그인이 필요해요")
    }

    @Test("TC-NAV-020 게스트가 홈 알림 벨을 누르면 알림함이 열리지 않고 토스트만 뜬다")
    func guestNotificationsBlocked() {
        let w = ShellWorld(guest: true)
        w.shell.openNotifications()
        #expect(w.shell.path.isEmpty)
        #expect(w.toast.messages == ["로그인 후 알림을 확인할 수 있어요"])
    }

    @Test("TC-NAV-022 게스트가 피드백 보내기를 누르면 화면이 열리지 않고 토스트만 뜬다")
    func guestFeedbackBlocked() {
        let w = ShellWorld(guest: true)
        w.shell.openFeedback()
        #expect(w.shell.path.isEmpty)
        #expect(w.toast.messages == ["피드백을 보내려면 로그인이 필요해요"])
    }

    @Test("게스트는 홈 주간 기록에서 기록 탭으로 갈 수 없다(토스트, 요청 없음)")
    func guestRecordRequestBlocked() {
        let w = ShellWorld(guest: true)
        w.shell.openRecord(date: F.today)
        #expect(w.tab == .home)
        #expect(w.shell.recordRequest == nil)
        #expect(w.toast.messages == ["기록을 보려면 로그인이 필요해요"])
    }

    @Test("TC-NAV-024 정지 회원도 셸에서는 기록·알림·설정·전시가 모두 열린다(제한은 쓰기 403 지점에서만)")
    func memberOpensEverything() {
        let w = ShellWorld()
        #expect(w.shell.selectTab(.record) == .selected)
        #expect(w.shell.selectTab(.settings) == .selected)
        #expect(w.shell.selectTab(.display) == .selected)
        w.shell.openNotifications()
        #expect(w.shell.path == [.notifications])
        #expect(w.toast.messages.isEmpty)
    }

    // MARK: 쌓임·뒤로가기

    @Test("TC-NAV-012 게시물 상세가 열리면 하단 바가 숨고 뒤로 가면 다시 보이며 직전 탭이 그대로다")
    func feedHidesBottomBar() {
        let w = ShellWorld()
        w.shell.selectTab(.display)
        w.shell.openFeed(someEntry)
        #expect(w.shell.path == [.feed(someEntry)])
        #expect(!w.shell.isBottomBarVisible)
        w.shell.pop()
        #expect(w.shell.isBottomBarVisible)
        #expect(w.tab == .display)
        w.shell.pop()   // 비어 있을 때 뒤로 가기는 아무 일도 없다
        #expect(w.shell.path.isEmpty)
    }

    @Test("TC-NAV-030 기록 탭에서 연 피드에서 뒤로 가면 기록 탭으로 돌아오고 탭 전환이 계속 동작한다")
    func backFromRecordFeedReturnsToRecord() {
        let w = ShellWorld()
        w.shell.selectTab(.record)
        w.shell.openFeed(.mine(postId: F.postID(5), thumbnailURL: nil))
        w.shell.pop()
        #expect(w.tab == .record)
        #expect(w.shell.selectTab(.display) == .selected)
    }

    @Test("TC-NAV-031 알림 벨을 연타해도 알림함은 하나만 쌓이고 뒤로 한 번에 홈으로 돌아온다")
    func notificationsMashing() {
        let w = ShellWorld()
        w.shell.openNotifications()
        w.shell.openNotifications()
        w.shell.openNotifications()
        #expect(w.shell.path == [.notifications])
        w.shell.pop()
        #expect(w.shell.path.isEmpty)
        #expect(w.tab == .home)
    }

    @Test("TC-NAV-032 전시 카드를 연타해도 피드는 하나만 쌓이고, 같은 게시물로 다시 가면 기존 화면을 교체하며, 다른 게시물은 새로 쌓인다")
    func feedMashingAndReplacement() {
        let w = ShellWorld()
        w.shell.selectTab(.display)
        w.shell.openFeed(someEntry)
        w.shell.openFeed(someEntry)
        #expect(w.shell.path == [.feed(someEntry)])

        let samePost = PostDetailEntry.mine(postId: F.postID(1), thumbnailURL: nil)   // 같은 게시물, 다른 진입 경로(푸시 등)
        w.shell.openFeed(samePost)
        #expect(w.shell.path == [.feed(samePost)])

        w.shell.openFeed(otherEntry)
        #expect(w.shell.path == [.feed(samePost), .feed(otherEntry)])
    }

    @Test("TC-NAV-035 홈 랭킹 더 보기는 전시 탭을 열고 해당 날짜를 인기순으로 요청하며 요청은 한 번만 소비된다")
    func displayRequestFromHome() {
        let w = ShellWorld()
        w.shell.openDisplay(date: F.yesterday, sort: .popular)
        #expect(w.tab == .display)
        #expect(w.shell.displayRequest?.date == F.yesterday)
        #expect(w.shell.displayRequest?.sort == .popular)
        let consumed = w.shell.consumeDisplayRequest()
        #expect(consumed?.date == F.yesterday)
        #expect(w.shell.displayRequest == nil)
        #expect(w.shell.consumeDisplayRequest() == nil)

        w.shell.selectTab(.home)
        w.shell.openDisplay(date: F.yesterday, sort: .popular)   // 같은 값을 다시 요청해도 새 요청이다
        let again = w.shell.displayRequest
        #expect(again != nil)
        #expect(again?.id != consumed?.id)
    }

    @Test("TC-HOME-031 홈 주간 기록 칸·보러가기는 기록 탭을 열고 날짜 요청을 전한다(날짜 없는 요청도 가능)")
    func recordRequestFromHome() {
        let w = ShellWorld()
        w.shell.openRecord(date: F.date(2026, 9, 29))
        #expect(w.tab == .record)
        #expect(w.shell.recordRequest?.date == F.date(2026, 9, 29))
        #expect(w.shell.consumeRecordRequest()?.date == F.date(2026, 9, 29))
        #expect(w.shell.recordRequest == nil)

        w.shell.selectTab(.home)
        w.shell.openRecord(date: nil)
        #expect(w.tab == .record)
        #expect(w.shell.recordRequest != nil)
        #expect(w.shell.recordRequest?.date == nil)
    }

    @Test("TC-NAV-036 TC-BANR-025 TC-BANR-027 배너를 누르면 배너 웹이 하나만 열리고(연타 무시) 게스트도 열린다. 뒤로 가면 홈이다")
    func issueWeb() {
        let url = URL(string: "https://web.example.test/issues/1")!
        for guest in [false, true] {
            let w = ShellWorld(guest: guest)
            w.shell.openIssue(url: url)
            w.shell.openIssue(url: url)
            #expect(w.shell.path == [.issue(url)])
            #expect(!w.shell.isBottomBarVisible)
            #expect(w.toast.messages.isEmpty)
            w.shell.pop()
            #expect(w.shell.path.isEmpty)
            #expect(w.tab == .home)
        }
    }

    @Test("TC-NAV-038 설정 → 사인 변경 → 미리보기가 쌓이고, 변경 성공 시 두 화면이 모두 닫혀 설정으로 돌아온다")
    func signatureChangeStack() {
        let w = ShellWorld()
        w.shell.selectTab(.settings)
        w.shell.openSignatureChange()
        w.shell.openSignaturePreview()
        #expect(w.shell.path == [.changeSignature, .changeSignaturePreview])
        w.shell.signatureChangeCompleted()
        #expect(w.shell.path.isEmpty)
        #expect(w.tab == .settings)
        #expect(w.shell.isBottomBarVisible)
    }

    @Test("TC-NAV-038 사인 변경 화면이 없을 때의 완료 신호는 아무 일도 없다(다른 쌓임을 건드리지 않는다)")
    func signatureCompletionLeavesOtherRoutes() {
        let w = ShellWorld()
        w.shell.openNotifications()
        w.shell.signatureChangeCompleted()
        #expect(w.shell.path == [.notifications])
    }

    @Test("REQ-NAV-039 REQ-NAV-040 게시물 삭제 성공 시 상세를 닫고 토스트 \"게시물을 삭제했어요\"를 한 번 띄운다")
    func postDeletedPopsAndToasts() {
        let w = ShellWorld()
        w.shell.selectTab(.display)
        w.shell.openFeed(someEntry)

        w.shell.postDeleted(postId: F.postID(1))

        #expect(w.shell.path.isEmpty)
        #expect(w.tab == .display)
        #expect(w.toast.messages == ["게시물을 삭제했어요"])
        #expect(w.toast.messages == [NavCopy.postDeleted])

        w.shell.postDeleted(postId: F.postID(1))   // 열려 있지 않으면 아무 일도 없다
        #expect(w.toast.messages.count == 1)
    }

    // MARK: 딥링크 없음, 계정 전환

    @Test("TC-NAV-045 앱 자체 딥링크(chalkak://, https 링크)로는 어떤 화면 이동도 일어나지 않는다", arguments: [
        "chalkak://home", "chalkak://feed/22222222-2222-4222-8222-222222222201", "https://chalkak.example.test/feed/1", "https://web.example.test/issues/1",
    ])
    func noAppDeepLinks(text: String) throws {
        let w = ShellWorld()
        w.shell.selectTab(.display)
        let handled = w.shell.handleExternalURL(try #require(URL(string: text)))
        #expect(handled == false)
        #expect(w.tab == .display)
        #expect(w.shell.path.isEmpty)
        #expect(w.shell.displayRequest == nil)
        #expect(w.shell.recordRequest == nil)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("TC-NAV-050 계정 전환(재로그인) 뒤에는 홈 탭이고 이전 계정의 쌓임·요청·로그인 필요 표시가 남지 않는다")
    func resetForNewSession() async {
        let w = ShellWorld(gate: FakeUploadGate(result: .loginRequired))
        w.shell.selectTab(.record)
        w.shell.openFeed(someEntry)
        w.shell.openDisplay(date: F.yesterday, sort: .popular)
        await w.shell.startUpload()
        #expect(w.shell.needsLogin)

        w.shell.resetForNewSession(access: .member)

        #expect(w.tab == .home)
        #expect(w.shell.path.isEmpty)
        #expect(w.shell.displayRequest == nil)
        #expect(w.shell.recordRequest == nil)
        #expect(!w.shell.needsLogin)
        #expect(w.shell.isBottomBarVisible)
    }

    @Test("TC-NAV-049 게스트 → 로그인 뒤 새 세션은 제한 없이 동작하고, 로그아웃 뒤 게스트 세션은 다시 제한된다")
    func accessChangesWithSession() {
        let w = ShellWorld(guest: true)
        #expect(w.shell.selectTab(.record) == .blocked)

        w.shell.resetForNewSession(access: .member)
        #expect(w.shell.access == .member)
        #expect(w.shell.selectTab(.record) == .selected)
        w.shell.openNotifications()
        #expect(w.shell.path == [.notifications])

        w.shell.resetForNewSession(access: .guest)
        #expect(w.shell.access == .guest)
        #expect(w.shell.selectTab(.record) == .blocked)
    }
}
