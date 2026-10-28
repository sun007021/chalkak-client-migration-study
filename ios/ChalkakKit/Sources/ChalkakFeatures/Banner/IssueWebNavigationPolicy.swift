import Foundation
import ChalkakData

/// 배너 웹뷰의 이동 한 건(WKNavigationAction 등을 플랫폼 앱이 이 값으로 옮긴다).
/// 매핑 계약: WKWebView `targetFrame == nil`(새 창/탭을 여는 이동)이면 `isMainFrame = true`, `opensNewWindow = true`로 옮긴다.
/// 명세 확인 대상: 최초 로드 뒤 서버 리다이렉트는 `isUserInitiated == false`라 block된다(의도한 동작인지 확인 필요).
public struct IssueWebNavigation: Sendable, Equatable {
    public var url: URL?
    /// 지금 보이는 문서의 주소(같은 문서 앵커 판정용).
    public var currentURL: URL?
    public var isMainFrame: Bool
    /// 사용자가 링크를 눌러 시작한 이동인가(리다이렉트·스크립트 이동은 false).
    public var isUserInitiated: Bool
    /// 새 창/새 탭으로 열려는 이동(`target=_blank`, `window.open`).
    public var opensNewWindow: Bool
    /// 화면 진입 뒤 처음 로드하는 배너 주소인가.
    public var isInitialLoad: Bool

    public init(
        url: URL?, currentURL: URL? = nil, isMainFrame: Bool = true, isUserInitiated: Bool = false,
        opensNewWindow: Bool = false, isInitialLoad: Bool = false
    ) {
        self.url = url
        self.currentURL = currentURL
        self.isMainFrame = isMainFrame
        self.isUserInitiated = isUserInitiated
        self.opensNewWindow = opensNewWindow
        self.isInitialLoad = isInitialLoad
    }
}

/// 배너 웹뷰 링크 정책 순수 함수(REQ-BANR-013~018). 판정 순서:
/// 1. 최초 로드: https이고 호스트가 있으면 `.allow`, 아니면 `.block`.
/// 2. 하위 프레임(iframe) 이동: http(s)·about:blank는 `.allow`(앱 밖으로 열지 않는다), 그 밖의 스킴은 `.block`.
/// 3. http(s)가 아닌 스킴(tel, mailto, intent, javascript, file, 커스텀) 또는 URL 없음: `.block`.
/// 4. 사용자 제스처 없는 이동(리다이렉트·스크립트)과 자동 새 창: `.block`.
/// 5. 사용자가 누른 같은 문서 앵커(새 창 아님): `.allow`.
/// 6. 그 밖의 사용자 링크(새 탭·같은 호스트·같은 URL 포함): `.openExternal`.
public enum IssueWebNavigationPolicy {
    public enum Decision: Sendable, Equatable {
        case allow
        case openExternal
        case block
    }

    public static func decide(_ navigation: IssueWebNavigation) -> Decision {
        if navigation.isInitialLoad {
            guard let url = navigation.url, url.isSecureWebURL else { return .block }
            return .allow
        }
        // 하위 프레임은 앱 밖으로 열지 않되 http(s)·about:blank 외 스킴은 막는다.
        if !navigation.isMainFrame {
            guard let url = navigation.url, let scheme = url.scheme?.lowercased() else { return .block }
            return scheme == "http" || scheme == "https" || url.absoluteString.lowercased() == "about:blank" ? .allow : .block
        }
        guard let url = navigation.url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return .block }
        guard navigation.isUserInitiated else { return .block }
        if !navigation.opensNewWindow, isSameDocumentAnchor(url, current: navigation.currentURL) { return .allow }
        return .openExternal
    }

    /// 조각(#) 외에는 현재 문서와 같고 조각이 있는 이동만 앵커로 본다.
    private static func isSameDocumentAnchor(_ url: URL, current: URL?) -> Bool {
        guard let current, url.fragment != nil else { return false }
        return withoutFragment(url) == withoutFragment(current)
    }

    private static func withoutFragment(_ url: URL) -> String? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        components.fragment = nil
        return components.string
    }
}
