import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

private extension FeedSUT {
    var notifications: APINotificationRepository { APINotificationRepository(client: client) }
}

private let id01 = UUID(uuidString: "33333333-3333-4333-8333-333333333301")!
private let id02 = UUID(uuidString: "33333333-3333-4333-8333-333333333302")!
private let id05 = UUID(uuidString: "33333333-3333-4333-8333-333333333305")!
private let id99 = UUID(uuidString: "33333333-3333-4333-8333-333333333399")!

@Suite("NOTI 알림함 저장소(계약)", .timeLimit(.minutes(1)))
struct NotificationRepositoryTests {
    @Test("TC-NOTI-002 목록 첫 요청은 GET /notifications?page=1&pageSize=20이고 인증 헤더가 붙는다")
    func requestShape() async throws {
        let fixture = try Fixture.load("notification/notifications__page1.json")
        let sut = try FeedSUT(always: fixture)

        _ = try? await sut.notifications.page(1, pageSize: 20)

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.queryDictionary == ["page": "1", "pageSize": "20"])
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-NOTI-003 목록 응답을 읽는다: 필드, null 썸네일·readAt, 응답 순서, 소수초 유무 Instant")
    func decodesPage() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notifications__page1.json"))
        let page = try await sut.notifications.page(1, pageSize: 20)

        #expect(page.currentPage == 1)
        #expect(page.pageSize == 20)
        #expect(page.hasNext)
        #expect(page.items.count == 20)
        let first = page.items[0]
        #expect(first.id == id01)
        #expect(first.type == .postApproved)
        #expect(first.sourceType == "POST")
        #expect(first.sourceId == "22222222-2222-4222-8222-222222222201")
        #expect(first.title == "사진이 승인되었어요")
        #expect(first.thumbnailImageURL != nil)
        #expect(first.readAt == nil)
        #expect(first.createdAt == Instant.parse("2026-10-27T01:30:00Z"))
        #expect(page.items.map(\.type).prefix(5) == [.postApproved, .postRejected, .aiReviewCompleted, .aiReviewFailed, .notice])
        #expect(page.items.last?.readAt != nil, "NN 06~20은 읽은 알림")
    }

    @Test("TC-NOTI-003 소수초가 있는 createdAt(.123Z)도 파싱한다")
    func decodesFractionalInstants() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notifications__kst-boundary.json"))
        let items = try await sut.notifications.page(1, pageSize: 20).items
        #expect(items.map(\.createdAt) == [
            try #require(Instant.parse("2026-10-26T15:00:00Z")),
            try #require(Instant.parse("2026-10-26T14:59:59Z")),
            try #require(Instant.parse("2026-10-26T15:00:00.123Z")),
        ])
    }

    @Test("TC-NOTI-008 필수 필드(title) 누락·깨진 JSON은 invalidResponse(크래시 없음)")
    func contractViolations() async throws {
        let missing = try FeedSUT(always: Fixture.load("notification/notifications__missing-fields.json"))
        #expect(await feedFailure { try await missing.notifications.page(1, pageSize: 20) } == .invalidResponse)

        let broken = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, "{\"notifications\":[") })
        #expect(await feedFailure { try await broken.notifications.page(1, pageSize: 20) } == .invalidResponse)
    }

    @Test("TC-NOTI-024 알 수 없는 type(FUTURE_TYPE)과 null sourceType도 항목으로 읽는다(원문 보존)")
    func unknownTypeDecodes() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notifications__unknown-type.json"))
        let item = try #require(try await sut.notifications.page(1, pageSize: 20).items.first)
        #expect(item.type == .unknown("FUTURE_TYPE"))
        #expect(item.sourceType == nil)
        #expect(item.sourceId == nil)
        #expect(item.thumbnailImageURL == nil)
    }

    @Test("TC-NOTI-023 날짜로 항목을 거르지 않고 서버가 준 항목을 모두 읽는다")
    func keepsAllServerItems() async throws {
        let fixture = try Fixture.load("notification/notifications__30day-boundary.json")
        let expected = try #require((try fixture.object()["notifications"] as? [Any])?.count)
        let sut = try FeedSUT(always: fixture)
        #expect(try await sut.notifications.page(1, pageSize: 20).items.count == expected)
    }

    @Test("TC-NOTI-024 UUID가 아닌 sourceId·다른 sourceType도 원문으로 읽는다(라우팅이 검증)")
    func badSourceDecodes() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notifications__bad-ai-source.json"))
        let items = try await sut.notifications.page(1, pageSize: 20).items
        #expect(items.map(\.sourceType) == ["NOTICE", "POST"])
        #expect(items[1].sourceId == "not-a-uuid")
    }

    @Test("TC-NOTI-010 TC-NOTI-009 목록 실패 매핑: 404 notFound, 500 server(재시도 2회 뒤), 연결 실패 network")
    func listFailures() async throws {
        let notFound = try FeedSUT(always: Fixture.load("notification/notifications__not-found.json"))
        #expect(await feedFailure { try await notFound.notifications.page(1, pageSize: 20) } == .notFound)

        let server = try FeedSUT(always: Fixture.load("notification/notifications__internal-error.json"))
        #expect(await feedFailure { try await server.notifications.page(1, pageSize: 20) } == .server(status: 500))
        #expect(await server.transport.count == 3)

        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        #expect(await feedFailure { try await offline.notifications.page(1, pageSize: 20) } == .network)
    }

    @Test("TC-NOTI-009 목록 401 UNAUTHORIZED는 refresh 후 1회 재전송해 성공한다")
    func listRefreshesOn401() async throws {
        let unauthorized = try Fixture.load("notification/notifications__unauthorized.json").httpResponse
        let page = try Fixture.load("notification/notifications__page1.json").httpResponse
        let sut = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? page : unauthorized
        })
        let result = try await sut.notifications.page(1, pageSize: 20)
        #expect(result.items.count == 20)
        #expect(await sut.transport.count == 3)
    }

    // MARK: 상세

    @Test("TC-NOTI-042 반려 상세: 원본 사진과 반려 사유를 읽는다")
    func detailRejected() async throws {
        let fixture = try Fixture.load("notification/notification-detail__rejected.json")
        let sut = try FeedSUT(always: fixture)
        let detail = try await sut.notifications.detail(id: id02)
        #expect(detail.type == .postRejected)
        #expect(detail.originalImageURL != nil)
        #expect(detail.rejectionReason == "다른 사람의 얼굴이 식별 가능하게 담겨 있어 전시할 수 없어요.")
        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
    }

    @Test("TC-NOTI-044 공지 상세: 사진·반려 사유 없이 제목과 본문을 읽는다")
    func detailNotice() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notification-detail__notice.json"))
        let detail = try await sut.notifications.detail(id: id05)
        #expect(detail.type == .notice)
        #expect(detail.originalImageURL == nil)
        #expect(detail.rejectionReason == nil)
        #expect(!detail.title.isEmpty && !detail.body.isEmpty)
    }

    @Test("TC-NOTI-047 승인 상세: 사진이 있으면 읽고 반려 사유 null도 깨지지 않는다")
    func detailApproved() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notification-detail__approved.json"))
        let detail = try await sut.notifications.detail(id: id01)
        #expect(detail.type == .postApproved)
        #expect(detail.originalImageURL != nil)
        #expect(detail.rejectionReason == nil)
    }

    @Test("TC-NOTI-045 TC-NOTI-046 상세 404는 notFound, 500은 server, 연결 실패는 network")
    func detailFailures() async throws {
        let gone = try FeedSUT(always: Fixture.load("notification/notification-detail__not-found.json"))
        #expect(await feedFailure { try await gone.notifications.detail(id: id99) } == .notFound)
        let server = try FeedSUT(always: Fixture.load("notification/notification-detail__internal-error.json"))
        #expect(await feedFailure { try await server.notifications.detail(id: id02) } == .server(status: 500))
        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.timeout })
        #expect(await feedFailure { try await offline.notifications.detail(id: id02) } == .network)
    }

    @Test("TC-NOTI-041 상세 조회는 GET 한 번뿐이다(PATCH read 없음)")
    func detailDoesNotMarkRead() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notification-detail__rejected.json"))
        _ = try? await sut.notifications.detail(id: id02)
        let methods = await sut.transport.requests.map(\.method)
        #expect(methods == [.get])
    }

    // MARK: 읽음

    @Test("TC-NOTI-027 읽음은 PATCH /notifications/{id}/read, 본문 없이 보내고 204를 성공으로 읽는다")
    func markReadShape() async throws {
        let fixture = try Fixture.load("notification/notification-read__no-content.json")
        let sut = try FeedSUT(always: fixture)
        try await sut.notifications.markRead(id: id01)
        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.method == .patch)
        #expect(request.body == nil)
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-PUSH-048 대문자 UUID로 만든 id도 요청 경로에는 소문자 정규형으로 나간다")
    func markReadUsesLowercaseUUID() async throws {
        let sut = try FeedSUT(always: Fixture.load("notification/notification-read__no-content.json"))
        try await sut.notifications.markRead(id: UUID(uuidString: "33333333-3333-4333-8333-3333333333AB")!)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.url.path.hasSuffix("/notifications/33333333-3333-4333-8333-3333333333ab/read"))
    }

    @Test("TC-NOTI-033 TC-NOTI-034 읽음 실패 매핑: 404 notFound, 500 server, 403 forbidden, 400 badRequest, 연결 실패 network")
    func markReadFailures() async throws {
        let notFound = try FeedSUT(always: Fixture.load("notification/notification-read__not-found.json"))
        #expect(await feedFailure { try await notFound.notifications.markRead(id: id99) } == .notFound)
        let server = try FeedSUT(always: Fixture.load("notification/notification-read__internal-error.json"))
        #expect(await feedFailure { try await server.notifications.markRead(id: id01) } == .server(status: 500))
        let forbidden = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(403, #"{"errorCode":"FORBIDDEN","message":"x"}"#) })
        #expect(await feedFailure { try await forbidden.notifications.markRead(id: id01) } == .forbidden)
        let bad = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(400, #"{"errorCode":"BUSINESS_ERROR","message":"x"}"#) })
        #expect(await feedFailure { try await bad.notifications.markRead(id: id01) } == .badRequest(message: "x"))
        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        #expect(await feedFailure { try await offline.notifications.markRead(id: id01) } == .network)
    }

    @Test("TC-NOTI-035 읽음 401 UNAUTHORIZED는 refresh 후 1회 재전송해 성공한다")
    func markReadRefreshesOn401() async throws {
        let unauthorized = try Fixture.load("notification/notification-read__unauthorized.json").httpResponse
        let sut = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? HTTPResponse(status: 204) : unauthorized
        })
        try await sut.notifications.markRead(id: id01)
        #expect(await sut.transport.count == 3)
    }

    @Test("TC-NOTI-055 미읽음 조회 401은 refresh 후 1회 재전송하고, 실패는 unauthorized로 매핑된다")
    func unreadRefreshesOn401() async throws {
        let unauthorized = try Fixture.load("notification/unread-status__unauthorized.json").httpResponse
        let ok = try Fixture.load("notification/unread-status__true.json").httpResponse
        let sut = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? ok : unauthorized
        })
        let repo = APIUnreadStatusRepository(client: sut.client)
        #expect(try await repo.unreadStatus().hasUnread)

        let denied = try FeedSUT(always: Fixture.load("notification/unread-status__unauthorized.json"))
        let deniedRepo = APIUnreadStatusRepository(client: denied.client)
        #expect(await feedFailure { try await deniedRepo.unreadStatus() } == .unauthorized)
    }
}
