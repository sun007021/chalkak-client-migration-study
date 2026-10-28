import Foundation
import ChalkakCore
import ChalkakNetwork

// 홈·배너 API 응답 모델. 계약 위반은 디코딩 실패(→ APIClient가 `invalidResponse`)로 만든다.

private func corrupted<K: CodingKey>(_ key: K, _ container: KeyedDecodingContainer<K>, _ text: String) -> DecodingError {
    DecodingError.dataCorruptedError(forKey: key, in: container, debugDescription: text)
}

/// `moderationStatus`. 알 수 없는 값(REJECTED·새 값)은 디코딩 실패 → 히어로 Error(TC-HOME-011).
public enum ModerationStatus: String, Sendable, Equatable {
    case validating = "VALIDATING"
    case pending = "PENDING"
    case approved = "APPROVED"
}

/// `GET /posts/today` 응답.
/// 모순된 조합(`isPosted=false`인데 `postId`/`moderationStatus`가 있음, `isPosted=true`인데 `postId`가 없음)은 디코딩 실패(REQ-HOME-017).
public struct TodayPostStatus: Sendable, Equatable, Decodable {
    public var topicDate: KSTDate
    public var isPosted: Bool
    public var postId: UUID?
    public var moderationStatus: ModerationStatus?

    public init(topicDate: KSTDate, isPosted: Bool, postId: UUID?, moderationStatus: ModerationStatus?) {
        self.topicDate = topicDate
        self.isPosted = isPosted
        self.postId = postId
        self.moderationStatus = moderationStatus
    }

    private enum CodingKeys: String, CodingKey { case topicDate, isPosted, postId, moderationStatus }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        topicDate = try c.decodeKSTDate(forKey: .topicDate)
        isPosted = try c.decode(Bool.self, forKey: .isPosted)
        postId = try c.decodeIfPresent(APIUUID.self, forKey: .postId)?.value
        if let raw = try c.decodeIfPresent(String.self, forKey: .moderationStatus) {
            guard let status = ModerationStatus(rawValue: raw) else { throw corrupted(.moderationStatus, c, "알 수 없는 moderationStatus") }
            moderationStatus = status
        } else {
            moderationStatus = nil
        }
        // 등록됨이면 postId·상태가 모두 있고, 미등록이면 둘 다 없어야 한다(REQ-HOME-017).
        if isPosted {
            guard postId != nil, moderationStatus != nil else { throw corrupted(.isPosted, c, "isPosted=true인데 postId/moderationStatus가 없음") }
        } else {
            guard postId == nil, moderationStatus == nil else { throw corrupted(.isPosted, c, "isPosted=false인데 postId/moderationStatus가 있음") }
        }
    }
}

/// 캘린더에 오는 게시물 상태(서버는 REJECTED·VALIDATING을 주지 않는다).
public enum CalendarPostStatus: String, Sendable, Equatable {
    case pending = "PENDING"
    case approved = "APPROVED"
}

public struct CalendarPost: Sendable, Equatable, Decodable {
    public var topicDate: KSTDate
    public var postId: UUID
    /// nil 가능(키 없음/null) → 대체 배경.
    public var thumbnailImageURL: URL?
    public var status: CalendarPostStatus

    public init(topicDate: KSTDate, postId: UUID, thumbnailImageURL: URL?, status: CalendarPostStatus) {
        self.topicDate = topicDate
        self.postId = postId
        self.thumbnailImageURL = thumbnailImageURL
        self.status = status
    }

    private enum CodingKeys: String, CodingKey { case topicDate, postId, thumbnailImageUrl, status }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        topicDate = try c.decodeKSTDate(forKey: .topicDate)
        postId = try c.decode(APIUUID.self, forKey: .postId).value
        // 썸네일은 장식이라 깨진 값도 항목을 버리지 않고 대체 배경으로 둔다.
        thumbnailImageURL = (try? c.decodeIfPresent(String.self, forKey: .thumbnailImageUrl)).flatMap(secureHTTPSURL)
        guard let status = CalendarPostStatus(rawValue: try c.decode(String.self, forKey: .status)) else {
            throw corrupted(.status, c, "알 수 없는 status")
        }
        self.status = status
    }
}

/// `GET /posts/calendar?year&month` 응답.
public struct MonthlyCalendar: Sendable, Equatable, Decodable {
    public var year: Int
    public var month: Int
    public var posts: [CalendarPost]

    public init(year: Int, month: Int, posts: [CalendarPost]) {
        self.year = year
        self.month = month
        self.posts = posts
    }

    private enum CodingKeys: String, CodingKey { case year, month, posts }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        year = try c.decode(Int.self, forKey: .year)
        month = try c.decode(Int.self, forKey: .month)
        posts = try c.decode([CalendarPost].self, forKey: .posts)
    }
}

public struct Banner: Sendable, Equatable, Decodable, Identifiable {
    public var id: UUID
    public var title: String
    public var subtitle: String?
    /// https이고 호스트가 있어야 한다. 아니면 응답 전체가 잘못된 응답이다(REQ-BANR-003).
    public var webViewURL: URL
    /// 절대 https URL이 아니면 nil(배너는 유지하고 대체 배경, REQ-BANR-003).
    public var thumbnailURL: URL?
    public var createdAt: Date

    public init(id: UUID, title: String, subtitle: String?, webViewURL: URL, thumbnailURL: URL?, createdAt: Date) {
        self.id = id
        self.title = title
        self.subtitle = subtitle
        self.webViewURL = webViewURL
        self.thumbnailURL = thumbnailURL
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey { case id, title, subtitle, webViewUrl, thumbnailUrl, createdAt }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(APIUUID.self, forKey: .id).value
        title = try c.decode(String.self, forKey: .title)
        subtitle = try c.decodeIfPresent(String.self, forKey: .subtitle)
        guard let web = secureHTTPSURL(try c.decode(String.self, forKey: .webViewUrl)) else {
            throw corrupted(.webViewUrl, c, "webViewUrl은 호스트가 있는 https여야 합니다.")
        }
        webViewURL = web
        thumbnailURL = (try? c.decodeIfPresent(String.self, forKey: .thumbnailUrl)).flatMap(secureHTTPSURL)
        createdAt = try c.decodeInstant(forKey: .createdAt)
    }
}

/// `GET /banners` 응답. `hasNext`가 없으면 마지막 페이지(false)다(REQ-BANR-002).
public struct BannerPage: Sendable, Equatable, Decodable {
    public var currentPage: Int
    public var pageSize: Int
    public var hasNext: Bool
    public var banners: [Banner]

    public init(currentPage: Int, pageSize: Int, hasNext: Bool, banners: [Banner]) {
        self.currentPage = currentPage
        self.pageSize = pageSize
        self.hasNext = hasNext
        self.banners = banners
    }

    private enum CodingKeys: String, CodingKey { case currentPage, pageSize, hasNext, banners }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        currentPage = try c.decode(Int.self, forKey: .currentPage)
        pageSize = try c.decode(Int.self, forKey: .pageSize)
        hasNext = try c.decodeIfPresent(Bool.self, forKey: .hasNext) ?? false
        banners = try c.decode([Banner].self, forKey: .banners)
    }
}

/// `GET /notifications/unread-status` 응답.
public struct UnreadStatus: Sendable, Equatable, Decodable {
    public var hasUnread: Bool
    public init(hasUnread: Bool) { self.hasUnread = hasUnread }

    private enum CodingKeys: String, CodingKey { case hasUnread }

    public init(from decoder: any Decoder) throws {
        hasUnread = try decoder.container(keyedBy: CodingKeys.self).decode(Bool.self, forKey: .hasUnread)
    }
}

extension URL {
    /// 배너·웹뷰가 믿는 주소인가: 호스트가 있는 https이고(스킴 대소문자 무관) 사용자 정보(`user:pass@`)가 없다.
    public var isSecureWebURL: Bool {
        guard scheme?.lowercased() == "https", let host, !host.isEmpty else { return false }
        return user == nil && password == nil
    }

    /// 문자열을 `isSecureWebURL`을 만족하는 URL로 바꾼다(아니면 nil).
    public static func secureWebURL(_ text: String?) -> URL? {
        guard let text, !text.isEmpty, let url = URL(string: text), url.isSecureWebURL else { return nil }
        return url
    }
}

private func secureHTTPSURL(_ text: String?) -> URL? { URL.secureWebURL(text) }
