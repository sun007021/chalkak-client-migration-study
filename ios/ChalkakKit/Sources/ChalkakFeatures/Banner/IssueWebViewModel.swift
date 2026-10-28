import Foundation
import Observation
import ChalkakCore
import ChalkakData

/// 외부 브라우저 열기 결과(플랫폼 앱이 알려 준다).
public enum ExternalOpenOutcome: Sendable, Equatable {
    case opened
    case noBrowser
    case failed
}

/// 배너 웹뷰 화면(screen_view `issue`, 제목 "ISSUE"). docs/spec/features/home.md REQ-BANR-012~020.
///
/// - 주소가 https가 아니거나 호스트가 없으면(`nil` 포함) 로드하지 않고 `.unsafeLink`(문구 "링크를 열 수 없어요")다.
/// - `decide(_:)`는 정책에 위임하되 최초 로드 여부를 스스로 관리한다: 화면 진입(또는 `retry()`) 뒤 처음 판정하는 메인 프레임 이동만 `isInitialLoad == true`로 보고,
///   뷰가 채운 `isInitialLoad` 값은 무시한다. 하위 프레임 이동은 최초 이동을 소모하지 않는다.
/// - 로드 실패 `.failed("페이지를 불러오지 못했어요")` → `retry()`가 같은 주소로 `.loading`에 돌아가 `reloadToken`을 올린다.
/// - `externalOpenFinished`: `.noBrowser` → 토스트 "링크를 열 수 있는 브라우저가 없어요", `.failed` → "브라우저에서 링크를 열지 못했어요".
/// - `appeared()`는 `screen_view issue`를 보낸다(`ScreenTracker`가 연속 중복을 거른다).
@MainActor
@Observable
public final class IssueWebViewModel {
    public enum State: Sendable, Equatable {
        case loading
        case loaded
        case failed(String)
        case unsafeLink(String)
    }

    /// 화면 제목은 항상 "ISSUE".
    public let title = HomeCopy.issueTitle
    /// 로드할 주소(안전하지 않으면 nil).
    public let loadURL: URL?
    public private(set) var state: State = .loading
    /// "다시 시도"마다 올라간다. 뷰가 값이 바뀌면 같은 주소를 다시 로드한다.
    public private(set) var reloadToken = 0

    @ObservationIgnored private let toast: any ToastPresenting
    @ObservationIgnored private let screens: ScreenTracker?
    /// 다음 메인 프레임 이동이 최초 로드인가(진입·다시 시도 직후).
    @ObservationIgnored private var awaitingInitialLoad = true

    public init(url: URL?, toast: any ToastPresenting, screens: ScreenTracker? = nil) {
        self.toast = toast
        self.screens = screens
        if let url, url.isSecureWebURL {
            loadURL = url
        } else {
            loadURL = nil
            state = .unsafeLink(BannerCopy.linkUnavailable)
        }
    }

    public func appeared() {
        screens?.screenAppeared(.issue)
    }

    public func decide(_ navigation: IssueWebNavigation) -> IssueWebNavigationPolicy.Decision {
        var navigation = navigation
        // 최초 로드는 우리가 로드를 시킨 배너 주소일 때만 인정한다(다른 주소의 첫 이동은 일반 이동으로 판정).
        navigation.isInitialLoad = navigation.isMainFrame && awaitingInitialLoad && navigation.url == loadURL
        if navigation.isInitialLoad { awaitingInitialLoad = false }
        return IssueWebNavigationPolicy.decide(navigation)
    }

    public func pageLoadFinished() {
        if loadURL != nil { state = .loaded }
    }

    public func pageLoadFailed() {
        if loadURL != nil { state = .failed(BannerCopy.loadError) }
    }

    public func retry() {
        guard loadURL != nil else { return }
        state = .loading
        awaitingInitialLoad = true
        reloadToken += 1
    }

    public func externalOpenFinished(_ outcome: ExternalOpenOutcome) {
        switch outcome {
        case .opened: break
        case .noBrowser: toast.show(BannerCopy.noBrowser)
        case .failed: toast.show(BannerCopy.openFailed)
        }
    }
}
