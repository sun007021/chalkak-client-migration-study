import Foundation
import ChalkakCore

/// 약관 문서 두 종류. 가입 약관 화면과 설정 행이 같은 상수 URL을 쓴다(D-25).
public enum LegalDocument: Sendable, Equatable, Hashable, CaseIterable {
    case service
    case privacy

    /// `AppConstants.termsServiceURLString` / `termsPrivacyURLString`.
    public var urlString: String {
        switch self {
        case .service: AppConstants.termsServiceURLString
        case .privacy: AppConstants.termsPrivacyURLString
        }
    }
    /// 문서 시트 제목(`onb.terms.doc.title.service` / `.privacy`).
    public var title: String {
        switch self {
        case .service: OnboardingCopy.termsDocTitleService
        case .privacy: OnboardingCopy.termsDocTitlePrivacy
        }
    }
    /// 문서가 보일 때의 `screen_view` 이름(`terms_of_service` / `privacy_policy`).
    public var analyticsScreen: AnalyticsScreen {
        switch self {
        case .service: .termsOfService
        case .privacy: .privacyPolicy
        }
    }
}

/// 문서 URL을 어디서 열지.
public enum LegalDocumentRoute: Sendable, Equatable {
    /// https이고 호스트가 허용 목록(`AppConstants.termsAllowedHosts`)이거나 그 하위 도메인. 앱 안 웹뷰.
    case inApp(URL)
    /// 그 밖의 http/https URL. 외부 브라우저.
    case external(URL)
    /// 빈 문자열, 해석 불가, http/https가 아닌 scheme, userinfo가 있는 URL 등. 열지 않는다.
    case unopenable
}

public enum LegalDocumentRouting {
    /// REQ-ONB-008. 접미 일치는 점 경계로만(`notion.com.evil.example`, `evilnotion.so`는 허용 아님). http는 앱 안에서 열지 않는다.
    public static func route(for urlString: String?) -> LegalDocumentRoute {
        guard let text = urlString?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty,
              !text.contains(where: { $0.isWhitespace || $0.isNewline }),
              let url = URL(string: text),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil,
              let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = components.host?.lowercased(), !host.isEmpty
        else { return .unopenable }
        let isAllowedHost = AppConstants.termsAllowedHosts.contains { host == $0 || host.hasSuffix("." + $0) }
        return scheme == "https" && isAllowedHost ? .inApp(url) : .external(url)
    }
}

/// 외부 브라우저로 URL을 연다. 열 수 없으면 false.
public protocol ExternalURLOpening: Sendable {
    func open(_ url: URL) async -> Bool
}
