import Foundation
import ChalkakNetwork

/// 알림함 저장소. 실패는 `FeedFailure`(호출 종류는 `FeedOperation.notificationList/.notificationDetail/.notificationRead`), 취소는 `CancellationError`.
public protocol NotificationRepository: Sendable {
    /// `GET /notifications?page=&pageSize=` (로그인 필요). 응답 순서(최신순)를 유지한다. 필수 필드 누락·깨진 JSON은 `.invalidResponse`.
    func page(_ page: Int, pageSize: Int) async throws -> NotificationPage
    /// `GET /notifications/{id}` (UUID는 소문자 정규형). 조회만으로는 읽음 처리되지 않는다.
    func detail(id: UUID) async throws -> NotificationDetail
    /// `PATCH /notifications/{id}/read` (본문 없음, 204가 성공). 멱등이라 D-21 재시도 대상이다.
    func markRead(id: UUID) async throws
}

public struct APINotificationRepository: NotificationRepository {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }

    public func page(_ page: Int, pageSize: Int) async throws -> NotificationPage {
        let request = HTTPRequest(method: .get, path: "/notifications", query: [.int("page", page), .int("pageSize", pageSize)])
        return try await perform(.notificationList) { try await client.send(request, as: NotificationPage.self) }
    }

    public func detail(id: UUID) async throws -> NotificationDetail {
        let request = HTTPRequest(method: .get, path: "/notifications/\(id.apiString)")
        return try await perform(.notificationDetail) { try await client.send(request, as: NotificationDetail.self) }
    }

    public func markRead(id: UUID) async throws {
        // PATCH는 멱등이라 기본 정책(네트워크 오류·5xx 자동 재시도, D-21)을 그대로 쓴다. 본문은 없다.
        let request = HTTPRequest(method: .patch, path: "/notifications/\(id.apiString)/read")
        try await perform(.notificationRead) { try await client.sendEmpty(request) }
    }
}
