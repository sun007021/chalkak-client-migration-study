import Foundation
import ChalkakNetwork

// AI 피드백(AIR) 데이터 계층. 구현 기준: docs/spec/features/ai-review.md, 테스트: TC-AIR-001~009 · 047.

/// 서버가 주는 AI 피드백 상태. 네 값 외에는 계약 위반이다(REQ-AIR-043).
public enum AIReviewStatus: String, Sendable, Equatable, Codable {
    case none = "NONE"
    case processing = "PROCESSING"
    case completed = "COMPLETED"
    case failed = "FAILED"
}

public struct AIReviewCriterion: Sendable, Equatable, Codable {
    public let key: String
    public let label: String
    /// 0.0~10.0(양 끝 포함). 범위 밖이면 응답 전체가 계약 위반이다(REQ-AIR-042).
    public let score: Double
    public init(key: String, label: String, score: Double) {
        self.key = key
        self.label = label
        self.score = score
    }
}

public struct AIReviewFeedback: Sendable, Equatable, Codable {
    public let summary: String
    public let strength: String
    public let weakness: String
    public let suggestion: String
    public init(summary: String, strength: String, weakness: String, suggestion: String) {
        self.summary = summary
        self.strength = strength
        self.weakness = weakness
        self.suggestion = suggestion
    }
}

public struct AIReviewResult: Sendable, Equatable, Codable {
    /// 서버 값을 그대로 쓴다(다시 계산하지 않는다, REQ-AIR-040). 0.0~10.0.
    public let overallScore: Double
    /// 항목 수를 고정하지 않고 응답 순서를 유지한다(REQ-AIR-039).
    public let criteria: [AIReviewCriterion]
    /// 명세 확인 대상: 응답에 이 필드가 없을 때 false로 볼지 계약 위반으로 볼지 정해진 바 없다. 지금은 필수(없으면 계약 위반)다.
    public let distinctivePerspective: Bool
    public let feedback: AIReviewFeedback
    public init(overallScore: Double, criteria: [AIReviewCriterion], distinctivePerspective: Bool, feedback: AIReviewFeedback) {
        self.overallScore = overallScore
        self.criteria = criteria
        self.distinctivePerspective = distinctivePerspective
        self.feedback = feedback
    }
}

/// `GET`·`POST /posts/{id}/ai-review` 공통 응답.
/// 디코딩 규칙: `requestedAt`/`completedAt`은 소수초 있는/없는 UTC ISO-8601 모두 받고, `canRequestAgain`이 없으면 false,
/// `status`가 네 값이 아니거나 `COMPLETED`와 `result` 유무가 어긋나거나 점수가 0~10 밖이거나 feedback 항목이 비면 계약 위반이다.
public struct AIReview: Sendable, Equatable, Decodable {
    public let status: AIReviewStatus
    public let requestedAt: Date?
    public let completedAt: Date?
    public let result: AIReviewResult?
    public let canRequestAgain: Bool
    public init(status: AIReviewStatus, requestedAt: Date? = nil, completedAt: Date? = nil, result: AIReviewResult? = nil, canRequestAgain: Bool = false) {
        self.status = status
        self.requestedAt = requestedAt
        self.completedAt = completedAt
        self.result = result
        self.canRequestAgain = canRequestAgain
    }

    private enum CodingKeys: String, CodingKey { case status, requestedAt, completedAt, result, canRequestAgain }

    /// 계약 위반(알 수 없는 status, status와 result 불일치, 점수 범위 밖, 빈 feedback 항목)은 디코딩 실패 → `APIError.invalidResponse`.
    /// 응답 일부만 버리지 않고 전체를 버린다(REQ-AIR-042·043·045).
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        status = try c.decode(AIReviewStatus.self, forKey: .status)
        requestedAt = try c.decodeInstantIfPresent(forKey: .requestedAt)
        completedAt = try c.decodeInstantIfPresent(forKey: .completedAt)
        result = try c.decodeIfPresent(AIReviewResult.self, forKey: .result)
        // 필드가 없으면(또는 null이면) 재요청 불가로 본다(REQ-AIR-033).
        canRequestAgain = try c.decodeIfPresent(Bool.self, forKey: .canRequestAgain) ?? false

        // COMPLETED에만 result가 있다(REQ-AIR-043).
        guard (status == .completed) == (result != nil) else {
            throw DecodingError.dataCorruptedError(forKey: .result, in: c, debugDescription: "status와 result가 어긋납니다.")
        }
        if let result { try result.validate(in: c, forKey: .result) }
    }
}

private extension AIReviewResult {
    static let scoreRange = 0.0...10.0

    /// 점수는 0~10(양 끝 포함), feedback 네 항목은 비어 있지 않아야 한다(REQ-AIR-042·045).
    func validate<Key: CodingKey>(in container: KeyedDecodingContainer<Key>, forKey key: Key) throws {
        let scores = [overallScore] + criteria.map(\.score)
        guard scores.allSatisfy(Self.scoreRange.contains) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: container, debugDescription: "점수가 0~10 범위 밖입니다.")
        }
        let items = [feedback.summary, feedback.strength, feedback.weakness, feedback.suggestion]
        guard items.allSatisfy({ !$0.isEmpty }) else {
            throw DecodingError.dataCorruptedError(forKey: key, in: container, debugDescription: "feedback 항목이 비어 있습니다.")
        }
    }
}

public protocol AIReviewRepository: Sendable {
    /// `GET /posts/{postId}/ai-review`(session 인증, 본문 없음, 멱등 재시도 D-21).
    /// 실패는 `FeedFailure`(`.aiReviewStatus` 기준 매핑), 계약 위반은 `FeedFailure.invalidResponse`, 취소는 `CancellationError`.
    func status(postId: UUID) async throws -> AIReview
    /// `POST /posts/{postId}/ai-review`(본문 없음, 자동 재시도 없음). 2xx는 HTTP 코드가 아니라 본문 `status`로 해석한다.
    /// 실패는 `FeedFailure`(`.aiReviewRequest` 기준 매핑: 400 `badRequest(message:)`, 403 `banned`, 404 `notFound`...).
    func request(postId: UUID) async throws -> AIReview
}

public struct APIAIReviewRepository: AIReviewRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }

    public func status(postId: UUID) async throws -> AIReview {
        // GET은 멱등이라 기본 정책(네트워크 오류·5xx 자동 재시도, D-21)을 그대로 쓴다.
        let request = HTTPRequest(method: .get, path: path(postId), retryPolicy: .idempotent)
        return try await perform(.aiReviewStatus) { try await client.send(request, as: AIReview.self) }
    }

    public func request(postId: UUID) async throws -> AIReview {
        // POST는 응답이 유실돼도 서버에 접수됐을 수 있어 자동으로 다시 보내지 않는다. 본문도 없다.
        let request = HTTPRequest(method: .post, path: path(postId), retryPolicy: RetryPolicy.none)
        return try await perform(.aiReviewRequest) { try await client.send(request, as: AIReview.self) }
    }

    private func path(_ postId: UUID) -> String { "/posts/\(postId.apiString)/ai-review" }

    /// 네트워크 계층 오류를 `FeedFailure`로 바꾼다. 취소·설정 오류는 그대로 전파한다.
    private func perform<T>(_ operation: FeedOperation, _ body: () async throws -> T) async throws -> T {
        do {
            return try await body()
        } catch {
            throw FeedFailureMapper.map(error, operation: operation)
        }
    }
}
