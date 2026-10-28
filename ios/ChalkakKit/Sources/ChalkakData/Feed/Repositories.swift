import Foundation
import ChalkakCore
import ChalkakNetwork

public protocol TopicRepository: Sendable {
    /// `GET /topics?date=` (비로그인 허용 → 항상 anonymous). 실패는 `FeedFailure`, 취소는 `CancellationError`.
    func topic(on date: KSTDate) async throws -> Topic
}

public protocol PostRepository: Sendable {
    /// `GET /posts`. 게스트는 Authorization 없이(anonymous), 로그인 사용자는 session 정책.
    /// 랜덤 정렬 2페이지 이후인데 유효한 `randomSeed`가 없으면 요청 없이 `FeedFailure.badRequest`(시드를 잃은 경우: 첫 페이지부터 다시).
    func list(_ query: PostListQuery) async throws -> PostPage
    /// `GET /posts/{id}`. 로그인 필요(게스트 호출 금지, 호출해도 session 정책).
    func detail(id: UUID) async throws -> PostDetail
    /// `PUT /posts/{id}` 본문 `{"title": ...}`(키 필수). `rawTitle`은 `PostTitle.normalized`로 정리해 보내고 비면 `null`을 보낸다.
    /// 10 code point 초과면 요청 없이 `FeedFailure.titleTooLong`.
    func updateTitle(id: UUID, rawTitle: String) async throws -> TitleUpdateResult
    /// `DELETE /posts/{id}` (204, 멱등).
    func delete(id: UUID) async throws
}

public protocol LikeRepository: Sendable {
    /// `liked == true`면 `PUT /posts/{id}/likes`, 아니면 `DELETE`. 본문 없음.
    /// 응답의 postId가 다르거나 PUT 응답이 `isLiked == false`(DELETE는 true)인 모순이면 `FeedFailure.invalidResponse`.
    func setLike(postId: UUID, liked: Bool) async throws -> LikeResult
}

// MARK: API 구현

/// 네트워크 계층 오류를 `FeedFailure`로 바꾼다. 취소·설정 오류는 그대로 전파한다.
private func perform<T>(_ operation: FeedOperation, _ body: () async throws -> T) async throws -> T {
    do {
        return try await body()
    } catch {
        throw FeedFailureMapper.map(error, operation: operation)
    }
}

public struct APITopicRepository: TopicRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }

    public func topic(on date: KSTDate) async throws -> Topic {
        let request = HTTPRequest(method: .get, path: "/topics", query: [.date("date", date)], authPolicy: .anonymous)
        return try await perform(.topic) { try await client.send(request, as: Topic.self) }
    }
}

public struct APIPostRepository: PostRepository {
    private let client: APIClient
    private let viewer: any ViewerContext
    public init(client: APIClient, viewer: any ViewerContext) {
        self.client = client
        self.viewer = viewer
    }

    public func list(_ query: PostListQuery) async throws -> PostPage {
        var items: [QueryItem] = [
            .date("topicDate", query.topicDate),
            .sort("sort", query.sort.rawValue),
            .int("page", query.page),
            .int("pageSize", query.pageSize),
        ]
        if query.sort == .random {
            if let seed = query.randomSeed, PostListQuery.isValidRandomSeed(seed) {
                items.append(QueryItem(name: "randomSeed", value: seed))
            } else if query.page >= 2 {
                // 시드 없는 랜덤 2페이지 이후는 서버가 400이다(F4). 시드를 잃었으면 호출 측이 첫 페이지부터 다시 시작한다.
                throw FeedFailure.badRequest(message: nil)
            }
        }
        // 게스트는 세션이 남아 있어도 토큰을 붙이지 않는다(D-05).
        let request = HTTPRequest(method: .get, path: "/posts", query: items, authPolicy: viewer.isGuest ? .anonymous : .session)
        return try await perform(.listPosts) { try await client.send(request, as: PostPage.self) }
    }

    public func detail(id: UUID) async throws -> PostDetail {
        let request = HTTPRequest(method: .get, path: "/posts/\(id.apiString)")
        return try await perform(.postDetail) { try await client.send(request, as: PostDetail.self) }
    }

    public func updateTitle(id: UUID, rawTitle: String) async throws -> TitleUpdateResult {
        guard PostTitle.isValid(rawTitle) else { throw FeedFailure.titleTooLong }
        let body = try APIJSON.makeEncoder().encode(TitleBody(title: PostTitle.normalized(rawTitle)))
        let request = HTTPRequest(method: .put, path: "/posts/\(id.apiString)", body: body)
        return try await perform(.updateTitle) { try await client.send(request, as: TitleUpdateResult.self) }
    }

    public func delete(id: UUID) async throws {
        let request = HTTPRequest(method: .delete, path: "/posts/\(id.apiString)")
        try await perform(.deletePost) { try await client.sendEmpty(request) }
    }

    /// `title` 키는 값이 nil이어도 `null`로 보낸다(키 누락 금지).
    private struct TitleBody: Encodable {
        let title: String?
        func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(title, forKey: .title)
        }
        private enum CodingKeys: String, CodingKey { case title }
    }
}

public struct APILikeRepository: LikeRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }

    public func setLike(postId: UUID, liked: Bool) async throws -> LikeResult {
        let request = HTTPRequest(method: liked ? .put : .delete, path: "/posts/\(postId.apiString)/likes")
        let result = try await perform(liked ? .like : .unlike) { try await client.send(request, as: LikeResult.self) }
        // 요청한 방향과 어긋난 응답(다른 postId, 등록인데 isLiked=false 등)은 계약 위반이다.
        guard result.postId == postId, result.isLiked == liked else { throw FeedFailure.invalidResponse }
        return result
    }
}
