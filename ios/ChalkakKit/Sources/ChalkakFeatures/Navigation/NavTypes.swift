import Foundation
import ChalkakCore
import ChalkakData

public enum MainTab: String, Sendable, Equatable, CaseIterable {
    case home, display, record, settings

    public var analyticsDestination: AnalyticsDestination {
        switch self {
        case .home: .home
        case .display: .display
        case .record: .record
        case .settings: .settings
        }
    }
}

/// 탭 루트 위에 쌓이는 화면. 하단 바는 `MainShellViewModel.path`가 비어 있을 때만 보인다(REQ-NAV-023).
public enum MainRoute: Sendable, Equatable {
    case feed(PostDetailEntry)
    case notifications
    /// 배너 웹(`issue`). 주소는 배너의 `webViewUrl`.
    case issue(URL)
    case feedback
    /// 업로드 화면. 게이트가 준 주제 날짜로 고정한다(D-14).
    case upload(topicDate: KSTDate)
    case changeSignature
    case changeSignaturePreview
}

/// 홈 "더 보기" 같은 곳에서 전시 탭에 전하는 요청. 전시 탭이 `consumeDisplayRequest()`로 소비한다.
public struct DisplayRequest: Sendable, Equatable {
    public let id: Int
    public let date: KSTDate
    public let sort: PostSort
    public init(id: Int, date: KSTDate, sort: PostSort) {
        self.id = id
        self.date = date
        self.sort = sort
    }
}

/// 홈 주간 기록에서 기록 탭에 전하는 요청. `date`가 nil이면 날짜 지정 없이 기록 탭만 연다("보러가기").
public struct RecordRequest: Sendable, Equatable {
    public let id: Int
    public let date: KSTDate?
    public init(id: Int, date: KSTDate?) {
        self.id = id
        self.date = date
    }
}

public enum TabSelectionResult: Sendable, Equatable {
    case selected
    /// 이미 선택된 탭을 다시 눌렀다(전시면 맨 위로 스크롤 등은 화면이 처리).
    case reselected
    /// 게스트 제한으로 막혔다(토스트만, 탭 변화 없음).
    case blocked
}

public enum UploadEntryResult: Sendable, Equatable {
    /// 통과. 업로드 화면을 연다(주제 날짜 고정).
    case open(topicDate: KSTDate)
    /// 통과하지 못했다. 안내 문구가 있으면 토스트로 보인다(이미 작성, 주제 없음, 정지 등).
    case declined(message: String?)
    /// 갱신 후에도 401 → 로그인 화면.
    case loginRequired
}

/// 업로드 진입 게이트(`GET /posts/today`, D-14). 실제 구현은 UPL PR이 제공하고 이 PR은 프로토콜과 호출 시점만 정한다.
public protocol UploadEntryGating: Sendable {
    func checkEntry() async -> UploadEntryResult
}

/// 홈 화면이 이동을 부탁하는 인터페이스(`MainShellViewModel`이 구현).
@MainActor
public protocol HomeNavigating: AnyObject {
    func openFeed(_ entry: PostDetailEntry)
    func openNotifications()
    func openIssue(url: URL)
    func openDisplay(date: KSTDate, sort: PostSort)
    func openRecord(date: KSTDate?)
    /// 업로드 진입 게이트를 시작한다(홈 히어로 Empty 탭).
    func startUpload() async
}

extension PostDetailEntry {
    /// 진입 경로와 무관한 게시물 id.
    var postId: UUID {
        switch self {
        case let .listItem(item): item.id
        case let .mine(postId, _): postId
        }
    }
}
