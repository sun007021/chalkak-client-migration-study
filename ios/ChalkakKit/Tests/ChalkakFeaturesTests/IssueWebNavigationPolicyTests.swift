import Foundation
import Testing
@testable import ChalkakFeatures

private typealias Decision = IssueWebNavigationPolicy.Decision

private func nav(
    _ url: String?, current: String? = "https://web.example.test/issues/1", mainFrame: Bool = true,
    user: Bool = false, newWindow: Bool = false, initial: Bool = false
) -> IssueWebNavigation {
    IssueWebNavigation(
        url: url.flatMap { URL(string: $0) }, currentURL: current.flatMap { URL(string: $0) }, isMainFrame: mainFrame,
        isUserInitiated: user, opensNewWindow: newWindow, isInitialLoad: initial
    )
}

@Suite("BANR 배너 웹뷰 링크 정책(순수 함수)")
struct IssueWebNavigationPolicyTests {
    @Test("TC-BANR-017 최초 로드: https이고 호스트가 있으면 앱 안에서 로드한다")
    func initialHTTPSAllowed() {
        #expect(IssueWebNavigationPolicy.decide(nav("https://web.example.test/issues/1", current: nil, initial: true)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav("https://web.example.test/issues/1?x=1#top", current: nil, initial: true)) == .allow)
    }

    @Test("TC-BANR-017 최초 로드: http·빈 문자열·호스트 없음·다른 스킴은 Block이다", arguments: [
        "http://web.example.test/issues/1", "", "https://", "https:///path", "file:///etc/hosts", "javascript:alert(1)", "ftp://web.example.test/a", "web.example.test/a",
    ])
    func initialUnsafeBlocked(text: String) {
        let valid = IssueWebNavigationPolicy.decide(nav("https://web.example.test/ok", current: nil, initial: true))
        #expect(valid == .allow)   // 정상 주소는 통과
        #expect(IssueWebNavigationPolicy.decide(nav(text, current: nil, initial: true)) == .block)
    }

    @Test("TC-BANR-017 최초 로드의 URL이 없으면(nil) Block이다")
    func initialMissingURL() {
        #expect(IssueWebNavigationPolicy.decide(nav("https://web.example.test/ok", current: nil, initial: true)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav(nil, current: nil, initial: true)) == .block)
    }

    @Test("TC-BANR-018 최초 로드 이후 사용자 탭 없는 이동(리다이렉트·스크립트)은 Block이다", arguments: [
        "https://web.example.test/redirected", "https://other.example.test/ad", "http://web.example.test/plain",
    ])
    func automaticNavigationBlocked(text: String) {
        #expect(IssueWebNavigationPolicy.decide(nav(text, user: true)) == .openExternal)   // 같은 링크라도 사용자가 눌렀다면 외부로 열린다
        #expect(IssueWebNavigationPolicy.decide(nav(text, user: false)) == .block)
    }

    @Test("TC-BANR-018 사용자 탭 없는 새 창 자동 열기는 Block이다")
    func automaticNewWindowBlocked() {
        #expect(IssueWebNavigationPolicy.decide(nav("https://web.example.test/popup", user: true, newWindow: true)) == .openExternal)
        #expect(IssueWebNavigationPolicy.decide(nav("https://web.example.test/popup", user: false, newWindow: true)) == .block)
    }

    @Test("TC-BANR-019 사용자가 누른 http(s) 링크는 일반·새 탭·같은 호스트·같은 URL 모두 외부 브라우저(OpenExternal)다", arguments: [
        ("https://other.example.test/page", false),
        ("http://other.example.test/page", false),
        ("https://web.example.test/other-page", false),
        ("https://web.example.test/issues/1", false),
        ("https://web.example.test/issues/1?utm=a", false),
        ("https://other.example.test/page", true),
        ("https://web.example.test/issues/1", true),
    ])
    func userLinksOpenExternally(text: String, newWindow: Bool) {
        #expect(IssueWebNavigationPolicy.decide(nav(text, user: true, newWindow: newWindow)) == .openExternal)
    }

    @Test("TC-BANR-020 같은 문서 안의 앵커 이동은 웹뷰 안에서 처리하고, 새 탭 앵커는 외부로 보낸다")
    func anchors() {
        let current = "https://web.example.test/issues/1"
        #expect(IssueWebNavigationPolicy.decide(nav(current + "#section", current: current, user: true)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav(current + "#a", current: current + "#b", user: true)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav(current + "#section", current: current, user: true, newWindow: true)) == .openExternal)
        // 다른 문서의 앵커나 쿼리가 다른 같은 경로는 앵커 이동이 아니다.
        #expect(IssueWebNavigationPolicy.decide(nav("https://web.example.test/issues/2#section", current: current, user: true)) == .openExternal)
        #expect(IssueWebNavigationPolicy.decide(nav(current + "?page=2#section", current: current, user: true)) == .openExternal)
        // 사용자 탭이 없는 앵커 이동은 최초 이후 자동 이동이므로 Block.
        #expect(IssueWebNavigationPolicy.decide(nav(current + "#section", current: current, user: false)) == .block)
    }

    @Test("TC-BANR-021 http(s)가 아닌 스킴의 링크는 실행하지 않는다(Block)", arguments: [
        "tel:01012345678", "mailto:help@example.test", "intent://scan/#Intent;scheme=zxing;end", "javascript:alert(1)",
        "file:///var/mobile/secret", "chalkak://home", "kakao123://oauth", "sms:0101234", "data:text/html,hi", "about:blank",
    ])
    func nonHTTPSchemesBlocked(text: String) {
        #expect(IssueWebNavigationPolicy.decide(nav("https://other.example.test/a", user: true)) == .openExternal)   // 같은 제스처라도 http(s)는 외부로 열린다
        #expect(IssueWebNavigationPolicy.decide(nav(text, user: true)) == .block)
        #expect(IssueWebNavigationPolicy.decide(nav(text, user: true, newWindow: true)) == .block)
        #expect(IssueWebNavigationPolicy.decide(nav(text, user: false)) == .block)
    }

    @Test("TC-BANR-021 이동할 URL이 없으면 Block이다")
    func missingURLBlocked() {
        #expect(IssueWebNavigationPolicy.decide(nav("https://other.example.test/a", user: true)) == .openExternal)
        #expect(IssueWebNavigationPolicy.decide(nav(nil, user: true)) == .block)
    }

    @Test("TC-BANR-017 최초 로드의 https 스킴은 대소문자를 가리지 않고, 사용자 정보가 있는 주소는 Block이다")
    func initialSchemeCaseAndUserinfo() {
        #expect(IssueWebNavigationPolicy.decide(nav("HTTPS://web.example.test/a", current: nil, initial: true)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav("https://user:pw@web.example.test/a", current: nil, initial: true)) == .block)
        #expect(IssueWebNavigationPolicy.decide(nav("https://user@web.example.test/a", current: nil, initial: true)) == .block)
    }

    @Test("TC-BANR-022 하위 프레임에서도 http(s)·about:blank 외 스킴은 Block이다", arguments: [
        "data:text/html,hi", "javascript:alert(1)", "tel:01012345678", "file:///etc/hosts", "chalkak://home",
    ])
    func subframeUnsafeSchemesBlocked(text: String) {
        #expect(IssueWebNavigationPolicy.decide(nav("about:blank", mainFrame: false)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav("HTTPS://embed.example.test/v", mainFrame: false)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav(text, mainFrame: false)) == .block)
        #expect(IssueWebNavigationPolicy.decide(nav(nil, mainFrame: false)) == .block)
    }

    @Test("TC-BANR-022 하위 프레임(iframe) 이동은 앱 밖으로 열지 않고 프레임 안에서 처리한다", arguments: [true, false])
    func subframeStaysInside(user: Bool) {
        #expect(IssueWebNavigationPolicy.decide(nav("https://embed.example.test/video", mainFrame: false, user: user)) == .allow)
        #expect(IssueWebNavigationPolicy.decide(nav("https://web.example.test/issues/1", mainFrame: false, user: user)) == .allow)
    }
}
