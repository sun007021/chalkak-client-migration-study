import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

@Suite("Post 상세 저장소")
struct PostDetailRepositoryTests {
    @Test("TC-FEED-002 GET /posts/{id}: Authorization 필수, 응답 필드 매핑")
    func requestShapeAndMapping() async throws {
        let fixture = try Fixture.load("feed/posts-detail__other.json")
        let sut = try FeedSUT(always: fixture)

        let detail = try await sut.posts().detail(id: FixtureIDs.otherPost)

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(detail.id == FixtureIDs.otherPost)
        #expect(detail.authorId == UUID(uuidString: FixtureIDs.otherUserId))
        #expect(detail.topic.id == UUID(uuidString: "11111111-1111-4111-8111-111111111127"))
        #expect(detail.topic.title == "가을 하늘")
        #expect(detail.topic.topicDate == day(2026, 10, 27))
        #expect(detail.originalImageURL.absoluteString.hasSuffix("/original.webp"))
        #expect(detail.thumbnailImageURL?.absoluteString.hasSuffix("/thumbnail.webp") == true)
        #expect(detail.signatureOriginalImageURL.absoluteString.hasSuffix("/original.png"))
        #expect(detail.title == "은행잎")
        #expect(detail.likeCount == 38)
        #expect(detail.isLiked == false)
        #expect(detail.like == LikeState(isLiked: false, likeCount: 38))
    }

    @Test("TC-FEED-003 thumbnailImageUrl이 null이면 원본으로 대체하고 오류가 아니다")
    func nullThumbnail() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-detail__null-thumbnail.json"))
        let detail = try await sut.posts().detail(id: FixtureIDs.nullThumbnailPost)
        #expect(detail.thumbnailImageURL == nil)
        #expect(detail.displayThumbnailURL == detail.originalImageURL)
    }

    @Test("TC-FEED-013 제목이 null인 상세도 매핑한다")
    func noTitle() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-detail__no-title.json"))
        let detail = try await sut.posts().detail(id: UUID(uuidString: "22222222-2222-4222-8222-222222222204")!)
        #expect(detail.title == nil)
    }

    @Test("TC-FEED-004 isMine은 authorId == 로그인 userId(대소문자 무관)로 판정하고 게스트는 항상 false다")
    func isMineByAuthorId() async throws {
        let mine = try await decodeDetail("feed/posts-detail__mine-today.json")
        let other = try await decodeDetail("feed/posts-detail__other.json")
        #expect(mine.isMine(viewerUserId: FixtureIDs.myUserId))
        #expect(mine.isMine(viewerUserId: FixtureIDs.myUserId.uppercased()))
        #expect(!mine.isMine(viewerUserId: FixtureIDs.otherUserId))
        #expect(!mine.isMine(viewerUserId: nil))
        #expect(!other.isMine(viewerUserId: FixtureIDs.myUserId))
        #expect(other.isMine(viewerUserId: FixtureIDs.otherUserId))
    }

    @Test("TC-FEED-016 제목 수정 버튼은 내 게시물 + 오늘 주제일 때만 보인다")
    func canEditTitleRules() async throws {
        let now = try #require(Instant.parse("2026-10-27T03:00:00Z"))
        let mineToday = try await decodeDetail("feed/posts-detail__mine-today.json")
        let minePast = try await decodeDetail("feed/posts-detail__mine-past.json")
        let other = try await decodeDetail("feed/posts-detail__other.json")
        #expect(mineToday.canEditTitle(viewerUserId: FixtureIDs.myUserId, now: now))
        #expect(!minePast.canEditTitle(viewerUserId: FixtureIDs.myUserId, now: now))
        #expect(!other.canEditTitle(viewerUserId: FixtureIDs.myUserId, now: now))
        #expect(!mineToday.canEditTitle(viewerUserId: nil, now: now))
    }

    @Test("TC-FEED-017 KST 자정 경계: 23:59:59.999에는 보이고 00:00:00.000에는 보이지 않는다")
    func canEditTitleAtMidnight() async throws {
        let mineToday = try await decodeDetail("feed/posts-detail__mine-today.json")
        let lastMoment = try #require(Instant.parse("2026-10-27T14:59:59Z")).addingTimeInterval(0.999)
        let midnight = try #require(Instant.parse("2026-10-27T15:00:00Z"))
        #expect(mineToday.canEditTitle(viewerUserId: FixtureIDs.myUserId, now: lastMoment))
        #expect(!mineToday.canEditTitle(viewerUserId: FixtureIDs.myUserId, now: midnight))
    }

    @Test("TC-FEED-009 응답 계약 위반(likeCount 문자열, 필수 필드 누락)은 invalidResponse다")
    func invalidSchema() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-detail__invalid-schema.json"))
        let failure = await feedFailure { try await sut.posts().detail(id: FixtureIDs.otherPost) }
        #expect(failure == .invalidResponse)

        let fixture = try Fixture.load("feed/posts-detail__other.json")
        let mutations: [(inout [String: Any]) -> Void] = [{ $0["likeCount"] = -1 }, { $0.removeValue(forKey: "topic") }, { $0.removeValue(forKey: "authorId") }]
        for mutate in mutations {
            var object = try fixture.object()
            mutate(&object)
            let broken = try FeedSUT(transport: fixtureResponse(try JSONSerialization.data(withJSONObject: object)))
            #expect(await feedFailure { try await broken.posts().detail(id: FixtureIDs.otherPost) } == .invalidResponse)
        }
    }

    @Test("TC-FEED-007 404는 notFound다")
    func notFound() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-detail__404-not-found.json"))
        #expect(await feedFailure { try await sut.posts().detail(id: FixtureIDs.otherPost) } == .notFound)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-FEED-008 500은 재시도 후 server 오류, 연결 실패는 network다")
    func serverAndNetwork() async throws {
        let server = try FeedSUT(always: Fixture.load("feed/posts-detail__500-server-error.json"))
        #expect(await feedFailure { try await server.posts().detail(id: FixtureIDs.otherPost) } == .server(status: 500))
        #expect(await server.transport.count == 3)
        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        #expect(await feedFailure { try await offline.posts().detail(id: FixtureIDs.otherPost) } == .network)
    }

    @Test("TC-FEED-006 TC-FEED-005 401 → refresh 1회 후 재전송하고, 재인증이 필요하면 unauthorized다")
    func unauthorizedFlow() async throws {
        let unauthorized = try Fixture.load("feed/posts-detail__401-unauthorized.json")
        let ok = try Fixture.load("feed/posts-detail__other.json")
        let refreshed = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? ok.httpResponse : unauthorized.httpResponse
        })
        let detail = try await refreshed.posts().detail(id: FixtureIDs.otherPost)
        #expect(detail.id == FixtureIDs.otherPost)
        #expect(await refreshed.transport.requests.filter { $0.url.path.hasSuffix("/auth/refresh") }.count == 1)

        let reauth = try FeedSUT(transport: FakeFeedTransport { request, _ in
            request.url.path.hasSuffix("/auth/refresh")
                ? jsonResponse(401, #"{"errorCode":"REAUTHENTICATION_REQUIRED","message":"다시 로그인해 주세요."}"#)
                : unauthorized.httpResponse
        })
        #expect(await feedFailure { try await reauth.posts().detail(id: FixtureIDs.otherPost) } == .unauthorized)
    }

    @Test("TC-FEED-011 요청이 취소되면 CancellationError로 전파되고 FeedFailure가 아니다")
    func cancellation() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw CancellationError() })
        await #expect(throws: CancellationError.self) { try await sut.posts().detail(id: FixtureIDs.otherPost) }
    }

    private func decodeDetail(_ name: String) async throws -> PostDetail {
        let fixture = try Fixture.load(name)
        let sut = try FeedSUT(always: fixture)
        let id = try #require(UUID(uuidString: fixture.path.split(separator: "/").last.map(String.init) ?? ""))
        return try await sut.posts().detail(id: id)
    }
}
