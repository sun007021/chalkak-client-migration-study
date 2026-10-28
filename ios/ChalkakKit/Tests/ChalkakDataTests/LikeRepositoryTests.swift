import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

@Suite("좋아요 저장소")
struct LikeRepositoryTests {
    @Test("TC-LIKE-001 등록은 본문 없는 PUT, 취소는 같은 경로의 DELETE이며 둘 다 Authorization을 붙인다")
    func requestShapes() async throws {
        let put = try Fixture.load("like/posts-likes-put__liked.json")
        let putSUT = try FeedSUT(always: put)
        let liked = try await putSUT.likes.setLike(postId: FixtureIDs.minePost, liked: true)
        let putRequest = try #require(await putSUT.transport.requests.first)
        #expect(put.matches(putRequest))
        #expect(putRequest.body == nil)
        #expect(putRequest.header("Authorization") == "Bearer old-access")
        #expect(liked == LikeResult(postId: FixtureIDs.minePost, likeCount: 11, isLiked: true))

        let delete = try Fixture.load("like/posts-likes-delete__unliked.json")
        let deleteSUT = try FeedSUT(always: delete)
        let unliked = try await deleteSUT.likes.setLike(postId: FixtureIDs.minePost, liked: false)
        let deleteRequest = try #require(await deleteSUT.transport.requests.first)
        #expect(delete.matches(deleteRequest))
        #expect(deleteRequest.body == nil)
        #expect(deleteRequest.header("Authorization") == "Bearer old-access")
        #expect(unliked.isLiked == false)
        #expect(unliked.state == LikeState(isLiked: false, likeCount: unliked.likeCount))
    }

    @Test("TC-LIKE-002 postId가 요청과 다르면 계약 위반이다")
    func postIdMismatch() async throws {
        let sut = try FeedSUT(always: Fixture.load("like/posts-likes-put__postid-mismatch.json"))
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .invalidResponse)
    }

    @Test("TC-LIKE-002 PUT 응답이 isLiked=false인 모순은 계약 위반이다")
    func putInconsistent() async throws {
        let sut = try FeedSUT(always: Fixture.load("like/posts-likes-put__inconsistent-state.json"))
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .invalidResponse)
    }

    @Test("TC-LIKE-002 DELETE 응답이 isLiked=true인 모순도 계약 위반이다")
    func deleteInconsistent() async throws {
        let body = #"{"postId":"22222222-2222-4222-8222-222222222201","likeCount":5,"isLiked":true}"#
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, body) })
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: false) } == .invalidResponse)
    }

    @Test("TC-LIKE-002 음수 likeCount·필드 누락은 계약 위반이다")
    func malformedBodies() async throws {
        for body in [
            #"{"postId":"22222222-2222-4222-8222-222222222201","likeCount":-1,"isLiked":true}"#,
            #"{"postId":"22222222-2222-4222-8222-222222222201","isLiked":true}"#,
            #"{"postId":"22222222-2222-4222-8222-222222222201","likeCount":"11","isLiked":true}"#,
        ] {
            let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, body) })
            #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .invalidResponse)
        }
    }

    @Test("TC-LIKE-008 성공 응답의 likeCount·isLiked를 그대로 돌려준다")
    func serverValuesPassThrough() async throws {
        let fixture = try Fixture.load("like/posts-likes-put__liked-count-differs.json")
        let sut = try FeedSUT(always: fixture)
        let result = try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true)
        #expect(result.likeCount == fixture.int("likeCount"))
        #expect(result.isLiked)
    }

    @Test("TC-LIKE-033 이미 좋아요한 글의 PUT, 좋아요 없는 글의 DELETE는 멱등 성공이다")
    func idempotentResponses() async throws {
        let already = try FeedSUT(always: Fixture.load("like/posts-likes-put__already-liked.json"))
        #expect(try await already.likes.setLike(postId: FixtureIDs.minePost, liked: true).isLiked)
        let notLiked = try FeedSUT(always: Fixture.load("like/posts-likes-delete__not-liked.json"))
        #expect(try await notLiked.likes.setLike(postId: FixtureIDs.minePost, liked: false).isLiked == false)
    }

    @Test("TC-LIKE-010 404는 notFound다(PUT·DELETE 공통)")
    func notFound() async throws {
        let sut = try FeedSUT(always: Fixture.load("like/posts-likes-put__404-not-found.json"))
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .notFound)
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: false) } == .notFound)
    }

    @Test("TC-LIKE-011 정지 회원의 PUT 403은 banned이고 재요청하지 않는다")
    func bannedPut() async throws {
        let sut = try FeedSUT(always: Fixture.load("like/posts-likes-put__403-banned.json"))
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .banned)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-LIKE-012 정지 회원이 이미 한 좋아요를 취소(DELETE 200)하는 것은 정상이다")
    func bannedUserCanUnlike() async throws {
        let sut = try FeedSUT(always: Fixture.load("like/posts-likes-delete__unliked.json"))
        let result = try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: false)
        #expect(result.isLiked == false)
    }

    @Test("TC-LIKE-013 401은 refresh 1회 후 같은 요청을 1회 재전송하고, 재인증 필요면 unauthorized다")
    func unauthorized() async throws {
        let unauthorized = try Fixture.load("like/posts-likes-put__401-unauthorized.json")
        let ok = try Fixture.load("like/posts-likes-put__liked.json")
        let refreshed = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? ok.httpResponse : unauthorized.httpResponse
        })
        let result = try await refreshed.likes.setLike(postId: FixtureIDs.minePost, liked: true)
        #expect(result.isLiked)
        let requests = await refreshed.transport.requests
        #expect(requests.filter { $0.method == .put }.count == 2)
        #expect(requests.filter { $0.url.path.hasSuffix("/auth/refresh") }.count == 1)

        let reauth = try FeedSUT(transport: FakeFeedTransport { request, _ in
            request.url.path.hasSuffix("/auth/refresh")
                ? jsonResponse(401, #"{"errorCode":"REAUTHENTICATION_REQUIRED","message":"다시 로그인해 주세요."}"#)
                : unauthorized.httpResponse
        })
        #expect(await feedFailure { try await reauth.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .unauthorized)
    }

    @Test("TC-LIKE-009 500은 재시도 후에도 실패하면 server 오류다")
    func serverError() async throws {
        let sut = try FeedSUT(always: Fixture.load("like/posts-likes-put__500-server-error.json"))
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .server(status: 500))
        #expect(await sut.transport.count == 3)
    }

    @Test("TC-LIKE-026 500 두 번 뒤 200이면 0.5s·1s 대기 후 토스트 없이 서버 값으로 성공한다")
    func retriesThenSucceeds() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport(sequence: [
            Fixture.load("like/posts-likes-put__500-server-error.json"),
            Fixture.load("like/posts-likes-put__500-server-error.json"),
            Fixture.load("like/posts-likes-put__liked.json"),
        ]))
        let result = try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true)
        #expect(result == LikeResult(postId: FixtureIDs.minePost, likeCount: 11, isLiked: true))
        #expect(await sut.transport.count == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-LIKE-027 429 Retry-After는 지정한 시간만 기다린 뒤 재시도한다")
    func retryAfter() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport(sequence: [
            Fixture.load("like/posts-likes-put__429-retry-after.json"),
            Fixture.load("like/posts-likes-put__liked.json"),
        ]))
        let result = try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true)
        #expect(result.isLiked)
        #expect(sut.clock.recordedSleeps == [.seconds(1)])
    }

    @Test("TC-LIKE-028 오프라인이면 재시도 소진 후 network 오류다")
    func offline() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        #expect(await feedFailure { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) } == .network)
        #expect(await sut.transport.count == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-LIKE-029 취소는 FeedFailure가 아니라 CancellationError다")
    func cancellation() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw CancellationError() })
        await #expect(throws: CancellationError.self) { try await sut.likes.setLike(postId: FixtureIDs.minePost, liked: true) }
    }
}
