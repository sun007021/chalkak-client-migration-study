import Foundation
import ChalkakCore
import ChalkakNetwork

/// 좋아요 표시 상태(화면이 그리는 값).
public struct LikeState: Sendable, Equatable {
    public var isLiked: Bool
    public var likeCount: Int
    public init(isLiked: Bool, likeCount: Int) {
        self.isLiked = isLiked
        self.likeCount = likeCount
    }
}

public enum TopicPhase: String, Sendable, Equatable {
    case beforeOpen = "BEFORE_OPEN"
    case open = "OPEN"
    case closed = "CLOSED"
}

/// `GET /topics?date=` 응답.
public struct Topic: Sendable, Equatable, Decodable {
    public var id: UUID
    public var title: String
    /// 응답의 `topicDate`(정규 날짜). 이후 posts 조회는 이 값을 쓴다.
    public var topicDate: KSTDate
    public var startsAt: Date
    public var endsAt: Date
    public var phase: TopicPhase

    public init(id: UUID, title: String, topicDate: KSTDate, startsAt: Date, endsAt: Date, phase: TopicPhase) {
        self.id = id
        self.title = title
        self.topicDate = topicDate
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.phase = phase
    }

    private enum CodingKeys: String, CodingKey { case id, title, topicDate, startsAt, endsAt, phase }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(APIUUID.self, forKey: .id).value
        title = try c.decode(String.self, forKey: .title)
        topicDate = try c.decodeKSTDate(forKey: .topicDate)
        startsAt = try c.decodeInstant(forKey: .startsAt)
        endsAt = try c.decodeInstant(forKey: .endsAt)
        // 알 수 없는 phase는 계약 위반이다.
        guard let phase = TopicPhase(rawValue: try c.decode(String.self, forKey: .phase)) else {
            throw DecodingError.dataCorruptedError(forKey: .phase, in: c, debugDescription: "알 수 없는 phase")
        }
        self.phase = phase
    }
}

public enum PostSort: String, Sendable, Equatable, CaseIterable {
    case recent, popular, random
}

/// `GET /posts` 요청 조건.
public struct PostListQuery: Sendable, Equatable {
    public var topicDate: KSTDate
    public var sort: PostSort
    /// random 정렬에서만 의미가 있다. `[A-Za-z0-9_-]{1,64}`가 아니거나 sort가 random이 아니면 쿼리에 붙이지 않는다.
    public var randomSeed: String?
    public var page: Int
    public var pageSize: Int

    /// 서버가 받는 시드 형식 `[A-Za-z0-9_-]{1,64}`. 목록 요청과 화면이 같은 기준을 쓴다.
    public static func isValidRandomSeed(_ seed: String?) -> Bool {
        guard let seed, (1...64).contains(seed.utf8.count) else { return false }
        return seed.utf8.allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x41 && $0 <= 0x5A) || ($0 >= 0x61 && $0 <= 0x7A) || $0 == 0x5F || $0 == 0x2D }
    }

    public init(topicDate: KSTDate, sort: PostSort = .recent, randomSeed: String? = nil, page: Int = 1, pageSize: Int = AppConstants.pageSize) {
        self.topicDate = topicDate
        self.sort = sort
        self.randomSeed = randomSeed
        self.page = page
        self.pageSize = pageSize
    }
}

/// 목록 한 장. 서버가 주는 `isMine`을 그대로 쓴다(상세 응답에는 없음).
public struct PostListItem: Sendable, Equatable, Decodable, Identifiable {
    public var id: UUID
    public var authorId: UUID
    public var originalImageURL: URL
    /// nil이면 원본으로 대체한다.
    public var thumbnailImageURL: URL?
    public var signatureOriginalImageURL: URL
    public var signatureThumbnailImageURL: URL?
    public var title: String?
    public var submittedAt: Date
    public var likeCount: Int
    public var isLiked: Bool
    public var isMine: Bool

    public init(
        id: UUID, authorId: UUID, originalImageURL: URL, thumbnailImageURL: URL?,
        signatureOriginalImageURL: URL, signatureThumbnailImageURL: URL?, title: String?,
        submittedAt: Date, likeCount: Int, isLiked: Bool, isMine: Bool
    ) {
        self.id = id
        self.authorId = authorId
        self.originalImageURL = originalImageURL
        self.thumbnailImageURL = thumbnailImageURL
        self.signatureOriginalImageURL = signatureOriginalImageURL
        self.signatureThumbnailImageURL = signatureThumbnailImageURL
        self.title = title
        self.submittedAt = submittedAt
        self.likeCount = likeCount
        self.isLiked = isLiked
        self.isMine = isMine
    }

    private enum CodingKeys: String, CodingKey {
        case id, authorId, originalImageUrl, thumbnailImageUrl, signatureOriginalImageUrl, signatureThumbnailImageUrl
        case title, submittedAt, likeCount, isLiked, isMine
    }

    /// 필수 필드 누락·likeCount 음수·UUID/URL 형식 오류는 디코딩 실패(→ invalidResponse).
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(APIUUID.self, forKey: .id).value
        authorId = try c.decode(APIUUID.self, forKey: .authorId).value
        originalImageURL = try c.decodeURL(forKey: .originalImageUrl)
        thumbnailImageURL = try c.decodeURLIfPresent(forKey: .thumbnailImageUrl)
        signatureOriginalImageURL = try c.decodeURL(forKey: .signatureOriginalImageUrl)
        signatureThumbnailImageURL = try c.decodeURLIfPresent(forKey: .signatureThumbnailImageUrl)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        submittedAt = try c.decodeInstant(forKey: .submittedAt)
        likeCount = try c.decodeLikeCount(forKey: .likeCount)
        isLiked = try c.decode(Bool.self, forKey: .isLiked)
        isMine = try c.decode(Bool.self, forKey: .isMine)
    }

    public var like: LikeState { LikeState(isLiked: isLiked, likeCount: likeCount) }
    /// 썸네일이 없으면 원본.
    public var displayThumbnailURL: URL { thumbnailImageURL ?? originalImageURL }
}

public struct PostPage: Sendable, Equatable, Decodable {
    public var currentPage: Int
    public var pageSize: Int
    public var hasNext: Bool
    /// random 정렬 응답에서만 값이 있다(null/없음 가능).
    public var randomSeed: String?
    public var posts: [PostListItem]

    public init(currentPage: Int, pageSize: Int, hasNext: Bool, randomSeed: String?, posts: [PostListItem]) {
        self.currentPage = currentPage
        self.pageSize = pageSize
        self.hasNext = hasNext
        self.randomSeed = randomSeed
        self.posts = posts
    }

    private enum CodingKeys: String, CodingKey { case currentPage, pageSize, hasNext, randomSeed, posts }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        currentPage = try c.decode(Int.self, forKey: .currentPage)
        pageSize = try c.decode(Int.self, forKey: .pageSize)
        hasNext = try c.decode(Bool.self, forKey: .hasNext)
        randomSeed = try c.decodeIfPresent(String.self, forKey: .randomSeed)
        posts = try c.decode([PostListItem].self, forKey: .posts)
    }
}

public struct PostTopic: Sendable, Equatable, Decodable {
    public var id: UUID
    public var title: String
    public var topicDate: KSTDate
    public init(id: UUID, title: String, topicDate: KSTDate) {
        self.id = id
        self.title = title
        self.topicDate = topicDate
    }
    private enum CodingKeys: String, CodingKey { case id, title, topicDate }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(APIUUID.self, forKey: .id).value
        title = try c.decode(String.self, forKey: .title)
        topicDate = try c.decodeKSTDate(forKey: .topicDate)
    }
}

/// `GET /posts/{id}` 응답. `isMine`은 응답에 없으므로 `authorId`와 로그인 userId로 판정한다.
public struct PostDetail: Sendable, Equatable, Decodable, Identifiable {
    public var id: UUID
    public var authorId: UUID
    public var topic: PostTopic
    public var originalImageURL: URL
    public var thumbnailImageURL: URL?
    public var signatureOriginalImageURL: URL
    public var title: String?
    public var likeCount: Int
    public var isLiked: Bool

    public init(
        id: UUID, authorId: UUID, topic: PostTopic, originalImageURL: URL, thumbnailImageURL: URL?,
        signatureOriginalImageURL: URL, title: String?, likeCount: Int, isLiked: Bool
    ) {
        self.id = id
        self.authorId = authorId
        self.topic = topic
        self.originalImageURL = originalImageURL
        self.thumbnailImageURL = thumbnailImageURL
        self.signatureOriginalImageURL = signatureOriginalImageURL
        self.title = title
        self.likeCount = likeCount
        self.isLiked = isLiked
    }

    private enum CodingKeys: String, CodingKey {
        case id, authorId, topic, originalImageUrl, thumbnailImageUrl, signatureOriginalImageUrl, title, likeCount, isLiked
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(APIUUID.self, forKey: .id).value
        authorId = try c.decode(APIUUID.self, forKey: .authorId).value
        topic = try c.decode(PostTopic.self, forKey: .topic)
        originalImageURL = try c.decodeURL(forKey: .originalImageUrl)
        thumbnailImageURL = try c.decodeURLIfPresent(forKey: .thumbnailImageUrl)
        signatureOriginalImageURL = try c.decodeURL(forKey: .signatureOriginalImageUrl)
        title = try c.decodeIfPresent(String.self, forKey: .title)
        likeCount = try c.decodeLikeCount(forKey: .likeCount)
        isLiked = try c.decode(Bool.self, forKey: .isLiked)
    }

    public var like: LikeState { LikeState(isLiked: isLiked, likeCount: likeCount) }
    public var displayThumbnailURL: URL { thumbnailImageURL ?? originalImageURL }

    /// `authorId == viewerUserId`(대소문자 무관). 게스트(nil)는 항상 false.
    public func isMine(viewerUserId: String?) -> Bool {
        guard let viewerUserId, let viewer = UUID(uuidString: viewerUserId) else { return false }
        return authorId == viewer
    }

    /// 제목 수정 버튼 노출 조건(D-23): 내 게시물이고 `topic.topicDate`가 `now` 기준 KST 오늘일 때만.
    public func canEditTitle(viewerUserId: String?, now: Date) -> Bool {
        isMine(viewerUserId: viewerUserId) && KST.isToday(topic.topicDate, now: now)
    }
}

public struct TitleUpdateResult: Sendable, Equatable, Decodable {
    public var postId: UUID
    public var title: String?
    public init(postId: UUID, title: String?) {
        self.postId = postId
        self.title = title
    }
    private enum CodingKeys: String, CodingKey { case postId, title }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        postId = try c.decode(APIUUID.self, forKey: .postId).value
        title = try c.decodeIfPresent(String.self, forKey: .title)
    }
}

/// 좋아요 등록·취소 응답(검증은 Repository가 한다).
public struct LikeResult: Sendable, Equatable, Decodable {
    public var postId: UUID
    public var likeCount: Int
    public var isLiked: Bool
    public init(postId: UUID, likeCount: Int, isLiked: Bool) {
        self.postId = postId
        self.likeCount = likeCount
        self.isLiked = isLiked
    }
    private enum CodingKeys: String, CodingKey { case postId, likeCount, isLiked }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        postId = try c.decode(APIUUID.self, forKey: .postId).value
        likeCount = try c.decodeLikeCount(forKey: .likeCount)
        isLiked = try c.decode(Bool.self, forKey: .isLiked)
    }
    public var state: LikeState { LikeState(isLiked: isLiked, likeCount: likeCount) }
}

// MARK: 디코딩 보조(계약 위반은 DecodingError → APIClient가 invalidResponse로 바꾼다)

extension KeyedDecodingContainer {
    func decodeKSTDate(forKey key: Key) throws -> KSTDate {
        guard let date = KSTDate(string: try decode(String.self, forKey: key)) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "yyyy-MM-dd 형식이 아닙니다.")
        }
        return date
    }

    func decodeInstant(forKey key: Key) throws -> Date {
        guard let date = Instant.parse(try decode(String.self, forKey: key)) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "ISO-8601 시각이 아닙니다.")
        }
        return date
    }

    func decodeURL(forKey key: Key) throws -> URL {
        let text = try decode(String.self, forKey: key)
        guard !text.isEmpty, let url = URL(string: text) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "URL 형식이 아닙니다.")
        }
        return url
    }

    /// 키가 없거나 null이면 nil. 값이 있는데 URL이 아니면 실패.
    func decodeURLIfPresent(forKey key: Key) throws -> URL? {
        guard try decodeIfPresent(String.self, forKey: key) != nil else { return nil }
        return try decodeURL(forKey: key)
    }

    func decodeLikeCount(forKey key: Key) throws -> Int {
        let count = try decode(Int.self, forKey: key)
        guard count >= 0 else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "likeCount가 음수입니다.")
        }
        return count
    }
}
