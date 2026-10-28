import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

@MainActor
private struct TermsSUT {
    let viewModel: TermsViewModel
    let opener: FakeExternalOpener
    let analytics: RecordingAnalytics

    init(opener: FakeExternalOpener = FakeExternalOpener(), documentURLs: [LegalDocument: String]? = nil) {
        let analytics = RecordingAnalytics()
        self.opener = opener
        self.analytics = analytics
        self.viewModel = TermsViewModel(context: testContext, externalOpener: opener, screenTracker: ScreenTracker(tracker: analytics), documentURLs: documentURLs)
    }

    func agreeToBoth() {
        viewModel.toggleService()
        viewModel.togglePrivacy()
    }
}

@MainActor
@Suite("ONB 약관 동의 화면 상태", .timeLimit(.minutes(1)))
struct TermsViewModelTests {
    @Test("TC-ONB-002 처음 들어오면 체크가 모두 꺼져 있고 다음이 비활성이다")
    func initialState() {
        let sut = TermsSUT()
        #expect(!sut.viewModel.agreedToService)
        #expect(!sut.viewModel.agreedToPrivacy)
        #expect(!sut.viewModel.agreedToAll)
        #expect(!sut.viewModel.canProceed)
    }

    @Test("TC-ONB-003 전체 동의를 켜면 두 필수 항목이 모두 켜지고 다음이 활성이다")
    func agreeAllOn() {
        let sut = TermsSUT()
        sut.viewModel.toggleAll()
        #expect(sut.viewModel.agreedToService && sut.viewModel.agreedToPrivacy)
        #expect(sut.viewModel.agreedToAll)
        #expect(sut.viewModel.canProceed)
    }

    @Test("TC-ONB-004 전체 동의 상태에서 다시 누르면 모두 꺼진다")
    func agreeAllOff() {
        let sut = TermsSUT()
        sut.viewModel.toggleAll()
        sut.viewModel.toggleAll()
        #expect(!sut.viewModel.agreedToService && !sut.viewModel.agreedToPrivacy)
        #expect(!sut.viewModel.agreedToAll)
        #expect(!sut.viewModel.canProceed)
    }

    @Test("TC-ONB-005 필수 항목 하나만 켜면 전체 동의는 꺼진 표시이고 다음은 비활성이다", arguments: [true, false])
    func onlyOneItem(service: Bool) {
        let sut = TermsSUT()
        if service { sut.viewModel.toggleService() } else { sut.viewModel.togglePrivacy() }
        #expect(!sut.viewModel.agreedToAll)
        #expect(!sut.viewModel.canProceed)
    }

    @Test("TC-ONB-006 두 항목을 각각 켜면 전체 동의가 자동으로 켜지고 다음이 활성이다")
    func individualItemsTurnAllOn() {
        let sut = TermsSUT()
        sut.viewModel.toggleService()
        #expect(!sut.viewModel.agreedToAll)
        sut.viewModel.togglePrivacy()
        #expect(sut.viewModel.agreedToAll)
        #expect(sut.viewModel.canProceed)
    }

    @Test("TC-ONB-007 둘 다 켠 뒤 하나를 끄면 전체 동의가 꺼지고 다음이 비활성이다")
    func turningOneOffTurnsAllOff() {
        let sut = TermsSUT()
        sut.agreeToBoth()
        sut.viewModel.toggleService()
        #expect(!sut.viewModel.agreedToAll)
        #expect(!sut.viewModel.canProceed)
        #expect(sut.viewModel.agreedToPrivacy)
    }

    // MARK: 문서 보기

    @Test("TC-ONB-008 서비스 이용약관·개인정보 처리방침 보기는 각각 해당 문서를 앱 안 시트로 열고 문서 screen_view를 보낸다")
    func viewDocumentsInApp() async throws {
        let sut = TermsSUT()
        await sut.viewModel.viewDocument(.service)
        let service = try #require(URL(string: AppConstants.termsServiceURLString))
        #expect(sut.viewModel.presentedDocument == TermsDocumentPresentation(document: .service, url: service, title: try copy("onb.terms.doc.title.service")))
        sut.viewModel.documentDismissed()
        #expect(sut.viewModel.presentedDocument == nil)
        await sut.viewModel.viewDocument(.privacy)
        let privacy = try #require(URL(string: AppConstants.termsPrivacyURLString))
        #expect(sut.viewModel.presentedDocument == TermsDocumentPresentation(document: .privacy, url: privacy, title: try copy("onb.terms.doc.title.privacy")))
        #expect(sut.analytics.events == [.screenView(.termsOfService, screenClass: nil), .screenView(.privacyPolicy, screenClass: nil)])
        #expect(await sut.opener.opened.isEmpty)
        #expect(sut.viewModel.notice == nil)
    }

    @Test("TC-ONB-014 문서를 열었다 닫아도 체크 상태가 유지된다")
    func checksSurviveDocument() async {
        let sut = TermsSUT()
        sut.viewModel.toggleService()
        await sut.viewModel.viewDocument(.privacy)
        sut.viewModel.documentDismissed()
        #expect(sut.viewModel.agreedToService)
        #expect(!sut.viewModel.agreedToPrivacy)
    }

    @Test("허용 호스트가 아닌 URL은 외부 브라우저로 열고 앱 안 시트는 열지 않는다")
    func externalDocument() async throws {
        let sut = TermsSUT(documentURLs: [.service: "https://example.com/terms", .privacy: AppConstants.termsPrivacyURLString])
        await sut.viewModel.viewDocument(.service)
        #expect(await sut.opener.opened == [try #require(URL(string: "https://example.com/terms"))])
        #expect(sut.viewModel.presentedDocument == nil)
        #expect(sut.viewModel.notice == nil)
    }

    @Test("TC-ONB-013 외부 브라우저로 열 수 없으면 '문서를 열 수 없어요'를 보인다")
    func externalOpenFails() async throws {
        let sut = TermsSUT(opener: FakeExternalOpener(succeeds: false), documentURLs: [.service: "https://example.com/terms", .privacy: AppConstants.termsPrivacyURLString])
        await sut.viewModel.viewDocument(.service)
        #expect(sut.viewModel.notice?.message == (try copy("onb.terms.doc.cannot-open")))
        #expect(sut.viewModel.presentedDocument == nil)
    }

    @Test("TC-ONB-013 열 수 없는 URL(빈 문자열)은 열기를 시도하지 않고 '문서를 열 수 없어요'를 보인다")
    func unopenableURL() async throws {
        let sut = TermsSUT(documentURLs: [.service: "", .privacy: AppConstants.termsPrivacyURLString])
        await sut.viewModel.viewDocument(.service)
        #expect(sut.viewModel.notice?.message == (try copy("onb.terms.doc.cannot-open")))
        #expect(await sut.opener.opened.isEmpty)
    }

    // MARK: 이동

    @Test("TC-ONB-015 두 항목 동의 후 다음이면 같은 가입 컨텍스트를 들고 사인 그리기로 간다")
    func nextGoesToSignature() {
        let sut = TermsSUT()
        sut.agreeToBoth()
        sut.viewModel.nextTapped()
        #expect(sut.viewModel.destination == .signature(testContext))
        sut.viewModel.consumeDestination()
        #expect(sut.viewModel.destination == nil)
    }

    @Test("TC-ONB-005 동의가 모자라면 다음을 눌러도 이동하지 않는다")
    func nextIgnoredWithoutConsent() {
        let sut = TermsSUT()
        sut.viewModel.toggleService()
        sut.viewModel.nextTapped()
        #expect(sut.viewModel.destination == nil)
    }

    @Test("TC-ONB-017 뒤로 가면 로그인으로 돌아가고 가입 컨텍스트와 동의 선택이 폐기된다")
    func backDiscards() {
        let sut = TermsSUT()
        sut.agreeToBoth()
        sut.viewModel.backTapped()
        #expect(sut.viewModel.destination == .login)
        #expect(sut.viewModel.context == nil)
        #expect(!sut.viewModel.agreedToService && !sut.viewModel.agreedToPrivacy)
        sut.viewModel.nextTapped()
        #expect(sut.viewModel.destination == .login)
    }

    @Test("TC-ONB-016 화면을 새로 만들면(벗어났다 다시 오면) 동의가 다시 초기 상태이다")
    func freshInstanceStartsUnconsented() {
        let first = TermsSUT()
        first.agreeToBoth()
        #expect(first.viewModel.canProceed)
        let second = TermsSUT()
        #expect(!second.viewModel.agreedToService && !second.viewModel.agreedToPrivacy)
        #expect(!second.viewModel.canProceed)
    }

    @Test("TC-ONB-049 화면이 보일 때 screen_view(terms)를 보낸다")
    func screenView() {
        let sut = TermsSUT()
        sut.viewModel.onAppear()
        #expect(sut.analytics.events == [.screenView(.terms, screenClass: nil)])
    }
}
