import Foundation
import ChalkakNetwork

// 푸시 수신 설정(SET) 데이터 계층. 구현 기준: docs/spec/features/settings-feedback.md REQ-SET-008~021, 테스트: TC-SET-014~036.
// 알림함·푸시 토큰 등록(NOTI·PUSH)과 무관하게 `/notification-settings`만 다룬다.

/// 서버가 계정 단위로 보관하는 푸시 수신 설정 세 가지.
public enum NotificationSettingKind: Sendable, Equatable, Hashable, CaseIterable {
    /// `topicPushEnabled` — "오늘 주제 알림"
    case topic
    /// `moderationPushEnabled` — "게시물 승인·반려 알림"
    case moderation
    /// `aiReviewPushEnabled` — "AI 피드백 완료 알림"
    case aiReview
}

public struct NotificationSettings: Sendable, Equatable {
    public var topic: Bool
    public var moderation: Bool
    public var aiReview: Bool

    public init(topic: Bool, moderation: Bool, aiReview: Bool) {
        self.topic = topic
        self.moderation = moderation
        self.aiReview = aiReview
    }

    public func value(of kind: NotificationSettingKind) -> Bool {
        switch kind {
        case .topic: topic
        case .moderation: moderation
        case .aiReview: aiReview
        }
    }

    public func setting(_ kind: NotificationSettingKind, to value: Bool) -> NotificationSettings {
        var copy = self
        switch kind {
        case .topic: copy.topic = value
        case .moderation: copy.moderation = value
        case .aiReview: copy.aiReview = value
        }
        return copy
    }
}

public protocol NotificationSettingsRepository: Sendable {
    /// `GET /notification-settings`(멱등 재시도 D-21). 세 필드가 모두 Boolean이어야 한다 — 하나라도 없거나 null이거나 Boolean이 아니면
    /// `APIError.invalidResponse`(REQ-SET-008, TC-SET-015). 그 밖의 실패는 `APIError`(401 포함, 갱신은 클라이언트가 처리).
    func fetch() async throws -> NotificationSettings

    /// `PATCH /notification-settings`. 본문은 `kind`에 해당하는 필드 **하나만**(`{"topicPushEnabled": true}` 꼴, 나머지 생략, REQ-SET-012).
    /// 204 본문 없음이 성공이며 본문 디코딩을 시도하지 않는다. 멱등이라 연결 실패·5xx는 D-21대로 최대 2회 재시도한다(0.5초, 1초).
    /// 실패는 `APIError`. 취소는 `CancellationError`(재시도 대기 중이어도).
    func update(_ kind: NotificationSettingKind, enabled: Bool) async throws
}

public struct APINotificationSettingsRepository: NotificationSettingsRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func fetch() async throws -> NotificationSettings {
        // 세 필드 모두 Boolean이어야 한다. 하나라도 어긋나면 디코딩 실패 → `APIError.invalidResponse`(값을 지어내지 않는다).
        let request = HTTPRequest(method: .get, path: "/notification-settings", retryPolicy: .idempotent)
        let dto = try await client.send(request, as: SettingsDTO.self)
        return NotificationSettings(topic: dto.topicPushEnabled, moderation: dto.moderationPushEnabled, aiReview: dto.aiReviewPushEnabled)
    }

    public func update(_ kind: NotificationSettingKind, enabled: Bool) async throws {
        // 바뀐 항목 하나만 보낸다. 빈 PATCH는 서버가 400으로 거절한다(REQ-SET-012).
        let body = try APIJSON.makeEncoder().encode([kind.fieldName: enabled])
        let request = HTTPRequest(method: .patch, path: "/notification-settings", body: body, retryPolicy: .idempotent)
        // 204 본문 없음이 성공이다. 본문 디코딩을 시도하지 않는다.
        try await client.sendEmpty(request)
    }
}

private extension NotificationSettingKind {
    var fieldName: String {
        switch self {
        case .topic: "topicPushEnabled"
        case .moderation: "moderationPushEnabled"
        case .aiReview: "aiReviewPushEnabled"
        }
    }
}

private struct SettingsDTO: Decodable, Sendable {
    let topicPushEnabled: Bool
    let moderationPushEnabled: Bool
    let aiReviewPushEnabled: Bool
}
