import Foundation
import ChalkakNetwork

// 피드백(FDBK) 데이터 계층. 구현 기준: docs/spec/features/settings-feedback.md REQ-FDBK-007·010~013, 테스트: TC-FDBK-008·012·015·016·021~028.

/// `POST /feedbacks` 201 응답. 화면은 이 값을 쓰지 않지만 계약 확인용으로 읽는다(`feedbackId`, `createdAt`은 UTC Instant).
public struct FeedbackReceipt: Sendable, Equatable {
    public let feedbackId: UUID
    public let createdAt: Date

    public init(feedbackId: UUID, createdAt: Date) {
        self.feedbackId = feedbackId
        self.createdAt = createdAt
    }
}

public protocol FeedbackRepository: Sendable {
    /// `POST /feedbacks` `{content}`. 본문은 `content` 하나뿐이다(앱 버전·기기 정보 없음, Q-13, REQ-FDBK-007).
    /// `content`는 앞뒤 공백(`.whitespacesAndNewlines`, 전각 공백 U+3000 포함)을 제거해서 보내고 중간 공백·개행은 보존한다.
    /// 길이 검증은 하지 않는다(화면 몫). 자동 재시도 없음(`RetryPolicy.none`, D-21) — 연결 실패·5xx·429·503 모두 한 번만 보낸다.
    /// 실패는 `APIError`(400 `.http(400, .businessError, message)`, 401, 5xx, `.network`, 응답 해석 불가는 `.invalidResponse`).
    func submit(content: String) async throws -> FeedbackReceipt
}

public struct APIFeedbackRepository: FeedbackRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func submit(content: String) async throws -> FeedbackReceipt {
        // 앞뒤 공백만 제거하고 길이는 검증하지 않는다(화면 몫). 다른 필드는 보내지 않는다(Q-13).
        let body = try APIJSON.makeEncoder().encode(SubmitBody(content: content.trimmingCharacters(in: .whitespacesAndNewlines)))
        // 응답을 못 받아도 서버에는 쌓였을 수 있어 자동으로 다시 보내지 않는다. Retry-After도 따르지 않는다(D-21).
        let request = HTTPRequest(method: .post, path: "/feedbacks", body: body, retryPolicy: RetryPolicy.none)
        let dto = try await client.send(request, as: ReceiptDTO.self)
        return FeedbackReceipt(feedbackId: dto.feedbackId.value, createdAt: dto.createdAt)
    }
}

private struct SubmitBody: Encodable {
    let content: String
}

private struct ReceiptDTO: Decodable, Sendable {
    let feedbackId: APIUUID
    let createdAt: Date

    private enum CodingKeys: String, CodingKey { case feedbackId, createdAt }

    init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        feedbackId = try c.decode(APIUUID.self, forKey: .feedbackId)
        createdAt = try c.decodeInstant(forKey: .createdAt)
    }
}
