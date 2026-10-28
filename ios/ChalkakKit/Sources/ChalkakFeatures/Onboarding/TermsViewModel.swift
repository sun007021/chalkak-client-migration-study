import Foundation
import Observation
import ChalkakCore
import ChalkakData

public enum TermsDestination: Sendable, Equatable {
    /// 사인 그리기(가입 모드)로. 같은 `SignUpContext`를 들고 간다.
    case signature(SignUpContext)
    /// 로그인 화면으로(뒤로 가기). 가입 컨텍스트와 동의 선택은 이미 폐기됐다.
    case login
}

/// 앱 안 웹뷰로 열 문서.
public struct TermsDocumentPresentation: Sendable, Equatable {
    public let document: LegalDocument
    public let url: URL
    public let title: String
    public init(document: LegalDocument, url: URL, title: String) {
        self.document = document
        self.url = url
        self.title = title
    }
}

/// 약관 동의 화면(가입 1단계). 동의 사실은 저장·전송하지 않는다(D-25): 저장소 의존이 없고 새로 만들면 항상 미동의다.
@MainActor
@Observable
public final class TermsViewModel {
    public private(set) var agreedToService = false
    public private(set) var agreedToPrivacy = false
    /// 두 필수 항목이 모두 켜졌을 때만 true(REQ-ONB-003/004).
    public var agreedToAll: Bool { agreedToService && agreedToPrivacy }
    /// "다음" 활성 여부(REQ-ONB-005).
    public var canProceed: Bool { agreedToAll }

    /// 앱 안 웹뷰 시트로 보이는 문서. `documentDismissed()`로 닫는다.
    public private(set) var presentedDocument: TermsDocumentPresentation?
    /// 문서를 열 수 없을 때 `onb.terms.doc.cannot-open`.
    public private(set) var notice: Notice?
    public private(set) var destination: TermsDestination?
    /// 가입 컨텍스트(idToken·rawNonce). 뒤로 가면 nil이 된다.
    public private(set) var context: SignUpContext?

    private let externalOpener: any ExternalURLOpening
    private let screenTracker: ScreenTracker?
    private let documentURLs: [LegalDocument: String]?
    private var noticeIds = NoticeSequence()

    /// - Parameter documentURLs: 기본은 `LegalDocument.urlString`. 테스트가 외부 URL 분기를 만들 때 바꾼다.
    public init(
        context: SignUpContext,
        externalOpener: any ExternalURLOpening,
        screenTracker: ScreenTracker?,
        documentURLs: [LegalDocument: String]? = nil
    ) {
        self.context = context
        self.externalOpener = externalOpener
        self.screenTracker = screenTracker
        self.documentURLs = documentURLs
    }

    /// `screen_view(terms)`.
    public func onAppear() {
        screenTracker?.screenAppeared(.terms)
    }

    /// 둘 다 켜져 있으면 모두 끄고, 아니면 모두 켠다.
    public func toggleAll() {
        let target = !agreedToAll
        agreedToService = target
        agreedToPrivacy = target
    }

    public func toggleService() { agreedToService.toggle() }
    public func togglePrivacy() { agreedToPrivacy.toggle() }

    /// `LegalDocumentRouting`대로: inApp이면 `presentedDocument`를 채우고 문서 `screen_view`를 보낸다. external이면 `externalOpener`로 열고
    /// 실패하면(또는 unopenable이면) `notice`에 `onb.terms.doc.cannot-open`. 체크 상태는 건드리지 않는다.
    public func viewDocument(_ document: LegalDocument) async {
        switch LegalDocumentRouting.route(for: documentURLs?[document] ?? document.urlString) {
        case .inApp(let url):
            presentedDocument = TermsDocumentPresentation(document: document, url: url, title: document.title)
            screenTracker?.screenAppeared(document.analyticsScreen)
        case .external(let url):
            if await !externalOpener.open(url) { showCannotOpen() }
        case .unopenable:
            showCannotOpen()
        }
    }

    public func documentDismissed() {
        presentedDocument = nil
    }

    /// 두 항목에 모두 동의했을 때만 `destination = .signature(context)`. 아니면 아무 일도 없다.
    public func nextTapped() {
        guard canProceed, let context else { return }
        destination = .signature(context)
    }

    /// 동의 선택과 `context`를 폐기하고 `destination = .login`.
    public func backTapped() {
        agreedToService = false
        agreedToPrivacy = false
        context = nil
        destination = .login
    }

    public func consumeDestination() {
        destination = nil
    }

    private func showCannotOpen() {
        notice = noticeIds.make(OnboardingCopy.termsDocCannotOpen)
    }
}
