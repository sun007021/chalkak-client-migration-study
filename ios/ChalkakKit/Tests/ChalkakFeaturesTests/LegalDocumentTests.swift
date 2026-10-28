import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakFeatures

@Suite("ONB 약관 문서 URL 판정", .timeLimit(.minutes(1)))
struct LegalDocumentTests {
    @Test("TC-ONB-009 가입 약관과 설정 약관이 쓰는 URL은 shared/constants.json의 TERMS_URLS와 같다")
    func urlsMatchSharedConstants() throws {
        let urls = try #require(try SharedConstants.object()["TERMS_URLS"] as? [String: String])
        #expect(LegalDocument.service.urlString == urls["service"])
        #expect(LegalDocument.privacy.urlString == urls["privacy"])
        #expect(LegalDocument.service.urlString == AppConstants.termsServiceURLString)
        #expect(LegalDocument.privacy.urlString == AppConstants.termsPrivacyURLString)
    }

    @Test("TC-ONB-009 공통 상수 URL은 모두 앱 안에서 열린다")
    func constantURLsOpenInApp() throws {
        for document in LegalDocument.allCases {
            let url = try #require(URL(string: document.urlString))
            #expect(LegalDocumentRouting.route(for: document.urlString) == .inApp(url))
        }
    }

    @Test("REQ-ONB-011 문서 화면 이름은 terms_of_service / privacy_policy이고 제목은 ko.json 키와 같다")
    func documentMetadata() throws {
        #expect(LegalDocument.service.analyticsScreen == .termsOfService)
        #expect(LegalDocument.privacy.analyticsScreen == .privacyPolicy)
        #expect(LegalDocument.service.title == (try SharedCopy.require("onb.terms.doc.title.service")))
        #expect(LegalDocument.privacy.title == (try SharedCopy.require("onb.terms.doc.title.privacy")))
    }

    @Test("TC-ONB-010 https이고 호스트가 notion.com·notion.so·notion.site(하위 도메인 포함)이면 앱 안에서 연다", arguments: [
        "https://www.notion.so/page", "https://x.notion.site/doc", "https://notion.com/p/1", "https://app.notion.com/p/abc?source=copy_link",
        "https://NOTION.SO/page",
    ])
    func inAppHosts(urlString: String) throws {
        let url = try #require(URL(string: urlString))
        #expect(LegalDocumentRouting.route(for: urlString) == .inApp(url))
    }

    @Test("TC-ONB-011 http, 호스트가 비슷한 URL, 경로에만 notion이 있는 URL, userinfo는 앱 안에서 열지 않는다", arguments: [
        "http://notion.so/page", "https://notion.com.evil.example/x", "https://evilnotion.so/x", "https://evil.example/notion.so",
        "https://notion.so@evil.example/x", "https://user:pw@notion.so/x", "http://www.notion.site/x",
    ])
    func notInApp(urlString: String) {
        let route = LegalDocumentRouting.route(for: urlString)
        if case .inApp = route { Issue.record("앱 안에서 열면 안 된다: \(urlString)") }
    }

    @Test("TC-ONB-011 허용 호스트가 아닌 https URL은 외부 브라우저로 넘긴다")
    func otherHttpsIsExternal() throws {
        let url = try #require(URL(string: "https://example.com/terms"))
        #expect(LegalDocumentRouting.route(for: "https://example.com/terms") == .external(url))
    }

    @Test("TC-ONB-011 빈 문자열·nil·문서가 아닌 scheme·해석 불가 값은 열지 않는다", arguments: [
        "", "   ", "javascript:alert(1)", "file:///etc/passwd", "mailto:a@b.c", "not a url", "tel:010",
    ])
    func unopenable(urlString: String) {
        #expect(LegalDocumentRouting.route(for: urlString) == .unopenable)
    }

    @Test("TC-ONB-011 nil도 열지 않는다")
    func nilIsUnopenable() {
        #expect(LegalDocumentRouting.route(for: nil) == .unopenable)
    }
}
