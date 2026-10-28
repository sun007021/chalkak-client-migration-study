import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

private let newThumbURL = URL(string: "https://cdn.example.test/settings/new-thumbnail.png")!
private let settingsViewed = AnalyticsEvent.screenView(.settings, screenClass: nil)

@MainActor
@Suite("SET 설정 탭 구성·생명주기", .timeLimit(.minutes(1)))
struct SettingsScreenTests {
    // MARK: 구성

    @Test("REQ-SET-001 회원의 설정 탭은 앱 설정, 푸시 알림, 계정, 피드백, 정보 및 약관 순서이고 로그인 버튼은 없다")
    func memberSections() {
        let w = SettingsWorld()
        #expect(w.vm.sections == [.app, .push, .account, .feedback, .info])
        #expect(!w.vm.showsLoginButton)
    }

    @Test("REQ-SET-002 TC-SET-008 게스트는 로그인 버튼만 보이고 사인·푸시 설정 API 호출이 0건이다")
    func guestSeesOnlyLogin() async {
        let w = SettingsWorld(guest: true)
        #expect(w.vm.showsLoginButton, "게스트는 로그인 버튼이 보여야 한다")
        #expect(w.vm.sections.isEmpty)
        await w.vm.screenAppeared()
        await w.vm.toggle(.topic, to: false)
        await w.vm.appBecameActive()
        #expect(await w.signatureRepo.lookupCount == 0)
        #expect(await w.repo.fetchCount == 0)
        #expect(await w.repo.updates.isEmpty)
        #expect(await w.permission.requestCount == 0)
        #expect(w.analytics.events == [settingsViewed], "화면은 보이므로 screen_view는 나간다")
    }

    @Test("REQ-SET-005 TC-SET-049 버전정보 행의 값은 앱 버전 문자열 그대로이다")
    func versionText() {
        #expect(SettingsWorld(appVersion: "1.1.1").vm.versionText == "1.1.1")
        #expect(SettingsWorld(appVersion: "2.0.0").vm.versionText == "2.0.0")
    }

    // MARK: 분석

    @Test("REQ-SET-003 TC-SET-052 설정이 보이면 screen_view(settings)가 1회 나가고 같은 화면 재호출은 중복 전송하지 않는다")
    func screenViewOnce() async {
        let w = SettingsWorld()
        await w.vm.screenAppeared()
        await w.vm.screenAppeared()
        #expect(w.analytics.events == [settingsViewed])
    }

    // MARK: 사인·푸시 독립 로드

    @Test("TC-SET-002 사인 조회와 푸시 설정 조회는 서로 독립으로 시작한다(사인이 멈춰도 푸시가 먼저 반영된다)")
    func signatureStallDoesNotBlockPush() async {
        let hold = Hold()
        let w = SettingsWorld(signatureHolds: [hold])
        let task = Task { await w.vm.screenAppeared() }
        let pushStarted = await EventWait.signal(w.repo.fetchEntered, before: task)
        let signatureStarted = await EventWait.signal(w.signatureRepo.lookupEntered, before: task)
        #expect(pushStarted && signatureStarted)
        let pushReady = await reaches({ w.vm.pushState == .ready }, before: task)
        #expect(pushReady, "사인 조회가 끝나기 전에 푸시 설정이 먼저 보인다")
        #expect(w.vm.signature.imageURL == nil)
        await hold.open()
        await task.value
        #expect(w.vm.signature.imageURL == signatureThumbURL)
    }

    @Test("TC-SET-002 푸시 설정 조회가 멈춰도 사인 카드가 먼저 보인다")
    func pushStallDoesNotBlockSignature() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(allOn, hold: hold)])
        let task = Task { await w.vm.screenAppeared() }
        let started = await EventWait.signal(w.repo.fetchEntered, before: task)
        #expect(started)
        let signatureShown = await reaches({ w.vm.signature.imageURL == signatureThumbURL }, before: task)
        #expect(signatureShown, "푸시 조회가 끝나기 전에 사인이 먼저 보인다")
        #expect(w.vm.pushState == .loading)
        await hold.open()
        await task.value
        #expect(w.vm.pushState == .ready)
    }

    @Test("TC-SET-002 사인 조회가 실패해도 푸시 설정은 정상 표시된다")
    func signatureFailureKeepsPush() async {
        let w = SettingsWorld(signatures: [.failure(APIError.serverError)])
        await w.loaded()
        #expect(w.vm.signature.notice?.message == SignatureCopy.loadError)
        #expect(w.vm.pushState == .ready)
        #expect(w.values() == [true, true, true])
    }

    @Test("TC-SET-002 푸시 설정 조회가 실패해도 사인 카드는 정상 표시된다")
    func pushFailureKeepsSignature() async {
        let w = SettingsWorld(fetch: [.fail(APIError.serverError)])
        await w.loaded()
        #expect(w.vm.pushState == .failed)
        #expect(w.vm.signature.imageURL == signatureThumbURL)
        #expect(w.vm.signature.notice == nil)
    }

    @Test("TC-SET-051 오프라인이면 사인·푸시는 각각 오류 상태이고 계정, 피드백, 약관, 버전 행은 정상 동작한다")
    func offlineKeepsOtherRows() async {
        let w = SettingsWorld(fetch: [.fail(APIError.network)], signatures: [.failure(APIError.network)])
        await w.loaded()
        #expect(w.vm.pushState == .failed)
        #expect(w.vm.signature.notice?.message == SignatureCopy.loadError)
        #expect(w.vm.sections == [.app, .push, .account, .feedback, .info])
        #expect(w.vm.versionText == "1.2.3")
        w.vm.account.logoutTapped()
        #expect(w.vm.account.state == .confirming(.logout, .logout))
        w.vm.account.cancelConfirmation()
        await w.vm.viewDocument(.privacy)
        #expect(w.vm.presentedDocument?.document == .privacy)
    }

    @Test("D-20 화면이 사라지면 진행 중인 사인·푸시 조회를 모두 취소하고 토스트 없이 끝난다")
    func leavingCancelsLoads() async {
        let hold = Hold()
        let w = SettingsWorld(fetch: [.ok(allOn, hold: hold)], signatureHolds: [hold])
        let task = Task { await w.vm.screenAppeared() }
        let pushStarted = await EventWait.signal(w.repo.fetchEntered, before: task)
        let signatureStarted = await EventWait.signal(w.signatureRepo.lookupEntered, before: task)
        #expect(pushStarted && signatureStarted, "두 조회가 모두 진입한 뒤에 취소한다")
        w.vm.screenDisappeared()
        await task.value
        #expect(w.toast.messages.isEmpty)
        #expect(w.vm.signature.notice == nil)
        #expect(w.vm.signature.imageURL == nil)
        #expect(w.vm.pushState == .loading)
        #expect(w.values() == [nil, nil, nil])
    }

    // MARK: 사인 변경 뒤 카드(TC-SET-009~011)

    @Test("TC-SET-009 사인 변경이 성공하면 그 전에 시작된 조회의 늦은 응답은 반영하지 않고 새로 조회한 사인으로 바뀐다")
    func staleLookupIsDiscardedAfterChangeSucceeds() async {
        let hold = Hold(ignoringCancellation: true)
        let w = SettingsWorld(signatures: [signatureLookup(signatureThumbURL).result, signatureLookup(newThumbURL).result], signatureHolds: [hold])
        let card = w.vm.signature
        let task = Task { await card.screenAppeared() }
        let started = await EventWait.signal(w.signatureRepo.lookupEntered, before: task)
        #expect(started)
        await card.signatureChangeFinished(succeeded: true)
        #expect(card.imageURL == newThumbURL, "변경 뒤 GET으로 재조회한 썸네일로 즉시 바뀐다")
        await hold.open()
        await task.value
        #expect(card.imageURL == newThumbURL, "오래된 조회 결과는 반영하지 않는다")
        #expect(await w.signatureRepo.lookupCount == 2)
        #expect(!card.isLoading)
    }

    @Test("TC-SET-010 사인 변경이 실패하면 진행 중이던 조회 결과는 정상 반영되고 새 조회는 없다")
    func lookupSurvivesFailedChange() async {
        let hold = Hold(ignoringCancellation: true)
        let w = SettingsWorld(signatures: [signatureLookup(signatureThumbURL).result, signatureLookup(newThumbURL).result], signatureHolds: [hold])
        let card = w.vm.signature
        let task = Task { await card.screenAppeared() }
        let started = await EventWait.signal(w.signatureRepo.lookupEntered, before: task)
        #expect(started)
        await card.signatureChangeFinished(succeeded: false)
        await hold.open()
        await task.value
        #expect(card.imageURL == signatureThumbURL)
        #expect(await w.signatureRepo.lookupCount == 1)
        // 대조: 같은 상황에서 성공이면 조회가 한 번 더 나간다.
        await card.signatureChangeFinished(succeeded: true)
        #expect(await w.signatureRepo.lookupCount == 2)
        #expect(card.imageURL == newThumbURL)
    }

    @Test("TC-SET-011 사인 변경 성공 뒤 카드는 원본 URL을 대입하지 않고 GET으로 재조회한 썸네일로 바뀐다")
    func cardRefetchesAfterChange() async {
        let w = SettingsWorld(signatures: [signatureLookup(signatureThumbURL).result, signatureLookup(newThumbURL).result])
        let card = w.vm.signature
        await card.screenAppeared()
        #expect(card.imageURL == signatureThumbURL)
        await card.signatureChangeFinished(succeeded: true)
        #expect(await w.signatureRepo.lookupCount == 2)
        #expect(card.imageURL == newThumbURL)
        #expect(card.imageURL != signatureOriginalURL)
    }

    // MARK: 약관 문서

    @Test("TC-SET-047 REQ-SET-006 개인정보처리방침·이용약관 행은 문서를 열고 각각 screen_view privacy_policy, terms_of_service를 1회 보낸다(네트워크 호출 없음)")
    func opensLegalDocuments() async {
        let w = SettingsWorld()
        await w.vm.viewDocument(.privacy)
        #expect(w.vm.presentedDocument == TermsDocumentPresentation(
            document: .privacy, url: URL(string: LegalDocument.privacy.urlString)!, title: LegalDocument.privacy.title
        ))
        w.vm.documentDismissed()
        #expect(w.vm.presentedDocument == nil)
        await w.vm.viewDocument(.service)
        #expect(w.vm.presentedDocument?.document == .service)
        #expect(w.vm.presentedDocument?.url == URL(string: LegalDocument.service.urlString))
        #expect(w.analytics.events == [.screenView(.privacyPolicy, screenClass: nil), .screenView(.termsOfService, screenClass: nil)])
        #expect(await w.repo.fetchCount == 0)
        #expect(await w.signatureRepo.lookupCount == 0)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("REQ-SET-006 허용 호스트가 아닌 URL은 외부 브라우저로 열고 앱 안 문서와 screen_view는 없다")
    func externalDocumentUsesBrowser() async {
        let url = "https://example.com/terms"
        let w = SettingsWorld(documentURLs: [.privacy: url])
        await w.vm.viewDocument(.privacy)
        #expect(await w.opener.opened == [URL(string: url)!])
        #expect(w.vm.presentedDocument == nil)
        #expect(w.analytics.events.isEmpty)
        #expect(w.toast.messages.isEmpty)
    }

    @Test("REQ-SET-006 열 수 없는 문서는 토스트 onb.terms.doc.cannot-open을 보인다", arguments: ["", "ftp://notion.so/doc"])
    func unopenableDocumentShowsNotice(url: String) async {
        let w = SettingsWorld(documentURLs: [.service: url])
        await w.vm.viewDocument(.service)
        #expect(w.vm.presentedDocument == nil)
        #expect(w.toast.messages == [OnboardingCopy.termsDocCannotOpen])
    }

    // MARK: 사인 카드 reset

    @Test("TC-SET-037 사인 카드 reset 뒤에 이전 계정의 조회 응답이 늦게 도착해도 반영하지 않는다")
    func signatureCardIgnoresLateResponseAfterReset() async {
        let hold = Hold(ignoringCancellation: true)
        let w = SettingsWorld(signatureHolds: [hold])
        let card = w.vm.signature
        let task = Task { await card.screenAppeared() }
        let started = await EventWait.signal(w.signatureRepo.lookupEntered, before: task)
        #expect(started)
        card.reset()
        #expect(!card.isLoading)
        await hold.open()
        await task.value
        #expect(card.imageURL == nil)
        #expect(!card.needsRegistration)
        #expect(card.notice == nil)
    }
}
