import Foundation
import ChalkakCore
import ChalkakNetwork

// 사진 업로드 흐름(UPL)의 서버 호출을 모은 저장소: 정책 발급 → presigned PUT → 게시물 생성. `GET /posts/today`는 HOME의 `TodayPostRepository`를 쓴다.
// 구현 기준은 docs/spec/features/upload-edit.md, 테스트는 PostCreationRepositoryTests.

/// `POST /posts/uploads` 응답. `maxBytes`는 64비트 정수로 보존한다.
public struct PostUploadPolicy: Sendable, Equatable {
    public let uploadId: UUID
    public let uploadUrl: URL
    public let expiresInSeconds: Int
    public let contentType: String
    public let maxBytes: Int64

    public init(uploadId: UUID, uploadUrl: URL, expiresInSeconds: Int, contentType: String, maxBytes: Int64) {
        self.uploadId = uploadId
        self.uploadUrl = uploadUrl
        self.expiresInSeconds = expiresInSeconds
        self.contentType = contentType
        self.maxBytes = maxBytes
    }

    public var expiresIn: Duration { .seconds(expiresInSeconds) }

    /// 정책 `contentType`이 `image/webp`인가. 아니면 인코딩 전에 준비 실패다(REQ-UPL-026).
    public var isWebP: Bool { contentType == AppConstants.postImageContentType }
}

/// `POST /posts` 201 응답. `moderationStatus`는 `validating`·`pending`만 받아들인다.
public struct CreatedPost: Sendable, Equatable {
    public let postId: UUID
    public let status: ModerationStatus
    public init(postId: UUID, status: ModerationStatus) {
        self.postId = postId
        self.status = status
    }
}

/// 네트워크 계층 오류(`APIError` 등) 말고 업로드 저장소가 따로 던지는 오류.
public enum PostUploadError: Error, Sendable, Equatable {
    /// presigned `PUT`이 (D-21 재시도 뒤에도) 2xx가 아니었다(S3 403 서명 불일치·만료, 5xx). 생성 호출은 하지 않는다.
    case uploadRejected(status: Int)
    /// 본문이 정책 `maxBytes`를 넘어 `PUT`을 보내지 않았다.
    case payloadTooLarge
    /// 제목이 10 code point를 넘어 요청을 보내지 않았다(D-01).
    case titleTooLong
}

public protocol PostCreationRepository: Sendable {
    /// `POST /posts/uploads`(본문 없음, 세션 인증). 업로드 정책 발급은 멱등이라 재시도를 **명시**한다(POST 기본은 재시도 없음, D-21).
    /// 필수 필드 누락·UUID/URL 형식 오류는 `APIError.invalidResponse`. `contentType`은 검사하지 않는다(호출 측이 `isWebP`로 확인).
    func issueUpload() async throws -> PostUploadPolicy

    /// presigned `PUT {policy.uploadUrl}`(Authorization 없음, `Content-Type`은 `policy.contentType` 그대로, 60초 제한, 멱등 재시도).
    /// `data.count > policy.maxBytes`면 요청 없이 `PostUploadError.payloadTooLarge`. https(또는 loopback 허용 http)가 아닌 URL은
    /// 요청 없이 `ConfigurationError.invalidUploadURL`. 2xx가 아니면 `PostUploadError.uploadRejected(status:)`, 네트워크 오류는 `APIError.network`.
    func uploadImage(_ data: Data, policy: PostUploadPolicy) async throws

    /// `POST /posts {topicId, photoUploadId, title}`(세션 인증, **자동 재시도 없음**). `rawTitle`은 `PostTitle.normalized`로 정리해 보내고
    /// 비면 `title: null`(키 생략도 서버에서 같다). 10 code point 초과면 요청 없이 `PostUploadError.titleTooLong`.
    /// 201의 `moderationStatus`가 VALIDATING·PENDING이 아니거나 필드가 없으면 `APIError.invalidResponse`. 그 밖의 오류는 `APIError`를 그대로 던진다.
    func createPost(topicId: UUID, uploadId: UUID, rawTitle: String) async throws -> CreatedPost
}

public struct APIPostCreationRepository: PostCreationRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func issueUpload() async throws -> PostUploadPolicy {
        // 발급은 POST지만 멱등이라 재시도를 명시한다(D-21).
        let request = HTTPRequest(method: .post, path: "/posts/uploads", retryPolicy: .idempotent)
        let dto = try await client.send(request, as: PolicyDTO.self)
        guard let uploadId = UUID(uuidString: dto.uploadId) else { throw APIError.invalidResponse }
        return PostUploadPolicy(
            uploadId: uploadId, uploadUrl: dto.uploadUrl, expiresInSeconds: dto.expiresInSeconds,
            contentType: dto.contentType, maxBytes: dto.maxBytes
        )
    }

    public func uploadImage(_ data: Data, policy: PostUploadPolicy) async throws {
        guard Int64(data.count) <= policy.maxBytes else { throw PostUploadError.payloadTooLarge }
        do {
            try await client.uploadToPresignedURL(policy.uploadUrl, data: data, contentType: policy.contentType)
        } catch APIError.http(let status, _, _) {
            throw PostUploadError.uploadRejected(status: status)
        }
    }

    public func createPost(topicId: UUID, uploadId: UUID, rawTitle: String) async throws -> CreatedPost {
        guard PostTitle.isValid(rawTitle) else { throw PostUploadError.titleTooLong }
        let body = try APIJSON.makeEncoder().encode(
            CreateBody(topicId: topicId.apiString, photoUploadId: uploadId.apiString, title: PostTitle.normalized(rawTitle))
        )
        // 재시도 없음(기본값): 응답을 못 받아도 서버에는 만들어졌을 수 있어 호출 측이 today로 확인한다.
        let request = HTTPRequest(method: .post, path: "/posts", body: body, retryPolicy: RetryPolicy.none)
        let dto = try await client.send(request, as: CreatedDTO.self)
        guard let postId = UUID(uuidString: dto.postId),
              let status = ModerationStatus(rawValue: dto.moderationStatus),
              status == .validating || status == .pending else { throw APIError.invalidResponse }
        return CreatedPost(postId: postId, status: status)
    }
}

private struct PolicyDTO: Decodable, Sendable {
    let uploadId: String
    let uploadUrl: URL
    let expiresInSeconds: Int
    let contentType: String
    let maxBytes: Int64
}

private struct CreatedDTO: Decodable, Sendable {
    let postId: String
    let moderationStatus: String
}

/// `title` 키는 값이 nil이어도 `null`로 보낸다.
private struct CreateBody: Encodable {
    let topicId: String
    let photoUploadId: String
    let title: String?

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(topicId, forKey: .topicId)
        try container.encode(photoUploadId, forKey: .photoUploadId)
        try container.encode(title, forKey: .title)
    }
    private enum CodingKeys: String, CodingKey { case topicId, photoUploadId, title }
}
