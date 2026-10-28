import Foundation
import ChalkakNetwork

/// 알림 종류. 알 수 없는 값은 `.unknown(원문)`으로 보존한다(목록에는 보이되 탭해도 이동하지 않는다, REQ-NOTI-021).
public enum NotificationType: Sendable, Equatable {
    case postApproved, postRejected, aiReviewCompleted, aiReviewFailed, notice, topic, reminder
    case unknown(String)

    /// 서버 문자열(`POST_APPROVED` 등)에서 만든다.
    public init(rawValue: String) {
        switch rawValue {
        case "POST_APPROVED": self = .postApproved
        case "POST_REJECTED": self = .postRejected
        case "AI_REVIEW_COMPLETED": self = .aiReviewCompleted
        case "AI_REVIEW_FAILED": self = .aiReviewFailed
        case "NOTICE": self = .notice
        case "TOPIC": self = .topic
        case "REMINDER": self = .reminder
        default: self = .unknown(rawValue)
        }
    }
}

/// `GET /notifications`의 항목. `sourceType`·`sourceId`는 원문 그대로(UUID가 아닐 수 있어 라우팅에서 검증한다).
public struct NotificationItem: Sendable, Equatable, Decodable {
    public var id: UUID
    public var type: NotificationType
    public var sourceType: String?
    public var sourceId: String?
    public var title: String
    public var body: String
    public var thumbnailImageURL: URL?
    public var readAt: Date?
    public var createdAt: Date

    public init(
        id: UUID, type: NotificationType, sourceType: String? = nil, sourceId: String? = nil, title: String, body: String,
        thumbnailImageURL: URL? = nil, readAt: Date? = nil, createdAt: Date
    ) {
        self.id = id
        self.type = type
        self.sourceType = sourceType
        self.sourceId = sourceId
        self.title = title
        self.body = body
        self.thumbnailImageURL = thumbnailImageURL
        self.readAt = readAt
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey { case id, type, sourceType, sourceId, title, body, thumbnailImageUrl, readAt, createdAt }

    /// `type`·`sourceType`·`sourceId`는 원문 그대로 둔다(알 수 없는 값도 항목으로 읽고 라우팅이 판단한다). 필수 필드(id, type, title, body, createdAt) 누락은 계약 위반.
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(APIUUID.self, forKey: .id).value
        type = NotificationType(rawValue: try c.decode(String.self, forKey: .type))
        sourceType = try c.decodeIfPresent(String.self, forKey: .sourceType)
        sourceId = try c.decodeIfPresent(String.self, forKey: .sourceId)
        title = try c.decode(String.self, forKey: .title)
        body = try c.decode(String.self, forKey: .body)
        // 명세 확인 대상: 빈 문자열 thumbnailImageUrl은 계약 위반(디코딩 실패)으로 본다.
        thumbnailImageURL = try c.decodeURLIfPresent(forKey: .thumbnailImageUrl)
        readAt = try c.decodeInstantIfPresent(forKey: .readAt)
        createdAt = try c.decodeInstant(forKey: .createdAt)
    }
}

public struct NotificationPage: Sendable, Equatable, Decodable {
    public var currentPage: Int
    public var pageSize: Int
    public var hasNext: Bool
    public var items: [NotificationItem]
    public init(currentPage: Int, pageSize: Int, hasNext: Bool, items: [NotificationItem]) {
        self.currentPage = currentPage
        self.pageSize = pageSize
        self.hasNext = hasNext
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case currentPage, pageSize, hasNext, notifications }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        currentPage = try c.decode(Int.self, forKey: .currentPage)
        pageSize = try c.decode(Int.self, forKey: .pageSize)
        hasNext = try c.decode(Bool.self, forKey: .hasNext)
        items = try c.decode([NotificationItem].self, forKey: .notifications)
    }
}

/// `GET /notifications/{id}`.
public struct NotificationDetail: Sendable, Equatable, Decodable {
    public var id: UUID
    public var type: NotificationType
    public var title: String
    public var body: String
    public var originalImageURL: URL?
    public var rejectionReason: String?
    public var readAt: Date?
    public var createdAt: Date
    public init(
        id: UUID, type: NotificationType, title: String, body: String, originalImageURL: URL? = nil,
        rejectionReason: String? = nil, readAt: Date? = nil, createdAt: Date
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.body = body
        self.originalImageURL = originalImageURL
        self.rejectionReason = rejectionReason
        self.readAt = readAt
        self.createdAt = createdAt
    }

    private enum CodingKeys: String, CodingKey { case id, type, title, body, originalImageUrl, rejectionReason, readAt, createdAt }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(APIUUID.self, forKey: .id).value
        type = NotificationType(rawValue: try c.decode(String.self, forKey: .type))
        title = try c.decode(String.self, forKey: .title)
        body = try c.decode(String.self, forKey: .body)
        originalImageURL = try c.decodeURLIfPresent(forKey: .originalImageUrl)
        rejectionReason = try c.decodeIfPresent(String.self, forKey: .rejectionReason)
        readAt = try c.decodeInstantIfPresent(forKey: .readAt)
        createdAt = try c.decodeInstant(forKey: .createdAt)
    }
}
