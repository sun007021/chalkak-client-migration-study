import Foundation
import Testing
import ChalkakCore
@testable import ChalkakFeatures

private let bannerURL = URL(string: "https://web.example.test/issues/1")!

@MainActor
@Suite("BANR 배너 웹뷰 화면(IssueWebViewModel)")
struct IssueWebViewModelTests {
    private func make(_ url: URL?) -> (IssueWebViewModel, RecordingToast, RecordingAnalytics) {
        let toast = RecordingToast()
        let analytics = RecordingAnalytics()
        return (IssueWebViewModel(url: url, toast: toast, screens: ScreenTracker(tracker: analytics)), toast, analytics)
    }

    @Test("TC-BANR-012 화면 제목은 항상 \"ISSUE\"이고 배너 주소를 로드하며, 보이면 screen_view issue를 1회 보낸다(재렌더 중복 없음)")
    func titleLoadAndScreenView() {
        let (vm, _, analytics) = make(bannerURL)
        #expect(vm.title == "ISSUE")
        #expect(vm.loadURL == bannerURL)
        #expect(vm.state == .loading)

        vm.appeared()
        vm.appeared()
        #expect(analytics.events == [.screenView(.issue, screenClass: nil)])
    }

    @Test("TC-BANR-017 https가 아니거나 호스트가 없는 주소는 로드하지 않고 \"링크를 열 수 없어요\"를 보인다", arguments: [
        "http://web.example.test/a", "javascript:alert(1)", "https://", "file:///a", "ftp://web.example.test/a",
    ])
    func unsafeLink(text: String) {
        let (valid, _, _) = make(bannerURL)
        #expect(valid.loadURL == bannerURL)   // 정상 주소는 로드

        let (vm, _, _) = make(URL(string: text))
        #expect(vm.loadURL == nil)
        #expect(vm.state == .unsafeLink("링크를 열 수 없어요"))
        let token = vm.reloadToken
        vm.retry()
        #expect(vm.loadURL == nil)
        #expect(vm.state == .unsafeLink("링크를 열 수 없어요"))
        #expect(vm.reloadToken == token, "안전하지 않은 주소는 다시 시도해도 로드하지 않는다")
    }

    @Test("TC-BANR-017 주소가 없으면(nil) 로드하지 않고 \"링크를 열 수 없어요\"를 보인다")
    func missingURL() {
        let (vm, _, _) = make(nil)
        #expect(vm.loadURL == nil)
        #expect(vm.state == .unsafeLink("링크를 열 수 없어요"))
    }

    @Test("TC-BANR-024 로드 실패는 \"페이지를 불러오지 못했어요\" 오류이고 다시 시도하면 같은 주소를 다시 로드(reloadToken 증가)한다")
    func loadFailureAndRetry() {
        let (vm, _, _) = make(bannerURL)
        vm.pageLoadFinished()
        #expect(vm.state == .loaded)

        vm.pageLoadFailed()
        #expect(vm.state == .failed("페이지를 불러오지 못했어요"))
        let token = vm.reloadToken

        vm.retry()
        #expect(vm.state == .loading)
        #expect(vm.reloadToken == token + 1)
        #expect(vm.loadURL == bannerURL)

        vm.pageLoadFinished()
        #expect(vm.state == .loaded)
    }

    @Test("TC-BANR-017 TC-BANR-018 최초 이동만 앱 안에서 허용하고 로드 완료 뒤 사용자 제스처 없는 이동은 차단한다")
    func decideTracksInitialLoad() {
        let (vm, _, _) = make(bannerURL)
        let initial = IssueWebNavigation(url: bannerURL, isMainFrame: true, isUserInitiated: false, opensNewWindow: false, isInitialLoad: false)
        // 뷰가 isInitialLoad를 직접 채우지 않아도 ViewModel이 최초 이동을 판별한다.
        #expect(vm.decide(initial) == .allow)
        vm.pageLoadFinished()
        let redirect = IssueWebNavigation(url: URL(string: "https://web.example.test/redirected"), currentURL: bannerURL, isMainFrame: true, isUserInitiated: false, opensNewWindow: false, isInitialLoad: false)
        #expect(vm.decide(redirect) == .block)
        let tap = IssueWebNavigation(url: URL(string: "https://other.example.test/a"), currentURL: bannerURL, isMainFrame: true, isUserInitiated: true, opensNewWindow: false, isInitialLoad: false)
        #expect(vm.decide(tap) == .openExternal)
    }

    @Test("TC-BANR-017 최초 로드는 배너 주소일 때만 인정한다: 다시 시도 뒤 다른 https 주소의 첫 이동은 Block이고, 배너 주소는 여전히 허용된다")
    func initialLoadMustMatchBannerURL() {
        let (vm, _, _) = make(bannerURL)
        #expect(vm.decide(IssueWebNavigation(url: bannerURL)) == .allow)
        vm.pageLoadFailed()
        vm.retry()
        #expect(vm.decide(IssueWebNavigation(url: URL(string: "https://other.example.test/x"))) == .block)
        #expect(vm.decide(IssueWebNavigation(url: bannerURL)) == .allow)
    }

    @Test("TC-BANR-017 사용자 정보가 있는 주소는 로드하지 않는다")
    func userinfoIsUnsafe() {
        let (vm, _, _) = make(URL(string: "https://user:pw@web.example.test/a"))
        #expect(vm.loadURL == nil)
        #expect(vm.state == .unsafeLink("링크를 열 수 없어요"))
    }

    @Test("다시 시도하면 같은 주소의 로드를 최초 이동으로 다시 허용한다")
    func retryAllowsInitialAgain() {
        let (vm, _, _) = make(bannerURL)
        let load = IssueWebNavigation(url: bannerURL)
        #expect(vm.decide(load) == .allow)
        vm.pageLoadFailed()
        vm.retry()
        #expect(vm.decide(load) == .allow)
    }

    @Test("TC-BANR-023 외부 브라우저가 없거나 열기에 실패하면 토스트를 띄우고, 성공하면 조용하다. 화면 상태는 그대로다")
    func externalOpenOutcomes() {
        let (vm, toast, _) = make(bannerURL)
        vm.pageLoadFinished()

        vm.externalOpenFinished(.opened)
        #expect(toast.messages.isEmpty)
        vm.externalOpenFinished(.noBrowser)
        vm.externalOpenFinished(.failed)

        #expect(toast.messages == ["링크를 열 수 있는 브라우저가 없어요", "브라우저에서 링크를 열지 못했어요"])
        #expect(vm.state == .loaded)
    }
}
