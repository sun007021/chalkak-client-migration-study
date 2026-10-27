import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

@Suite("Post 제목 수정·삭제 저장소")
struct PostMutationRepositoryTests {
    // MARK: 제목 수정

    @Test("TC-FEED-023 PUT /posts/{id}: 메서드·경로·Authorization·JSON 본문이 계약과 같고 응답 title을 돌려준다")
    func updateTitleRequestShape() async throws {
        let fixture = try Fixture.load("feed/posts-title-update__200.json")
        let sut = try FeedSUT(always: fixture)

        let result = try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "새 제목")

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(request.header("Content-Type")?.hasPrefix("application/json") == true)
        #expect(request.jsonBody?["title"] as? String == "새 제목")
        #expect(result.postId == FixtureIDs.minePost)
        #expect(result.title == fixture.string("title"))
    }

    @Test("TC-FEED-021 앞뒤 공백은 제거해서 보낸다")
    func updateTitleStripsWhitespace() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-title-update__200.json"))
        _ = try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: " 가나다라마바사아자차 ")
        #expect(try #require(await sut.transport.requests.first).jsonBody?["title"] as? String == "가나다라마바사아자차")
    }

    @Test("TC-FEED-022 빈 입력·공백만이면 title 키를 포함해 null을 보낸다(키 누락 금지)", arguments: ["", "   ", "\u{3000}\u{00A0}\n"])
    func updateTitleSendsExplicitNull(raw: String) async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-title-update__200-null-title.json"))
        let result = try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: raw)
        let request = try #require(await sut.transport.requests.first)
        let json = try #require(request.jsonBody)
        #expect(json.keys.contains("title"))
        #expect(json["title"] is NSNull)
        #expect(String(decoding: try #require(request.body), as: UTF8.self).contains("\"title\":null"))
        #expect(result.title == nil)
    }

    @Test("TC-FEED-019 TC-FEED-020 10 code point를 넘는 제목은 요청 없이 titleTooLong이다")
    func updateTitleTooLong() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-title-update__200.json"))
        #expect(await feedFailure { try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "가나다라마바사아자차카") } == .titleTooLong)
        #expect(await feedFailure { try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: String(repeating: "😀", count: 11)) } == .titleTooLong)
        #expect(await sut.transport.count == 0)
    }

    @Test("TC-FEED-019 이모지 10개(UTF-16 20)는 허용한다")
    func updateTitleTenEmoji() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-title-update__200.json"))
        _ = try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: String(repeating: "😀", count: 10))
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-FEED-027 400은 badRequest(서버 message 보존)다. message로 분기하지 않고 재시도하지 않는다")
    func updateTitleBadRequest() async throws {
        let fixture = try Fixture.load("feed/posts-title-update__400-not-editable.json")
        let sut = try FeedSUT(always: fixture)
        let failure = await feedFailure { try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목") }
        #expect(failure == .badRequest(message: fixture.errorMessage))
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-FEED-028 서버가 제목 길이 400을 주면 서버 message를 오류에 담는다")
    func updateTitleTooLongFromServer() async throws {
        let fixture = try Fixture.load("feed/posts-title-update__400-title-too-long.json")
        let sut = try FeedSUT(always: fixture)
        let failure = await feedFailure { try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목") }
        #expect(failure == .badRequest(message: "제목은 10자 이하여야 합니다."))
    }

    @Test("TC-FEED-029 정지 회원의 403은 banned이고 같은 요청을 다시 보내지 않는다")
    func updateTitleBanned() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-title-update__403-banned.json"))
        #expect(await feedFailure { try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목") } == .banned)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-FEED-030 404는 notFound다")
    func updateTitleNotFound() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-title-update__404-not-found.json"))
        #expect(await feedFailure { try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목") } == .notFound)
    }

    @Test("TC-FEED-031 401은 refresh 후 1회 재전송하고, 재인증이 필요하면 unauthorized다")
    func updateTitleUnauthorized() async throws {
        let unauthorized = try Fixture.load("feed/posts-title-update__401-unauthorized.json")
        let ok = try Fixture.load("feed/posts-title-update__200.json")
        let refreshed = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? ok.httpResponse : unauthorized.httpResponse
        })
        _ = try await refreshed.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목")
        #expect(await refreshed.transport.requests.filter { $0.method == .put && $0.url.path.hasSuffix(FixtureIDs.minePost.apiString) }.count == 2)

        let reauth = try FeedSUT(transport: FakeFeedTransport { request, _ in
            request.url.path.hasSuffix("/auth/refresh")
                ? jsonResponse(401, #"{"errorCode":"REAUTHENTICATION_REQUIRED","message":"다시 로그인해 주세요."}"#)
                : unauthorized.httpResponse
        })
        #expect(await feedFailure { try await reauth.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목") } == .unauthorized)
    }

    @Test("TC-FEED-032 PUT 500·연결 실패는 0.5s·1s 백오프로 최대 2회 재시도한 뒤 각각 server·network 오류다")
    func updateTitleRetries() async throws {
        let server = try FeedSUT(always: Fixture.load("feed/posts-title-update__500-server-error.json"))
        #expect(await feedFailure { try await server.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목") } == .server(status: 500))
        #expect(await server.transport.count == 3)
        #expect(server.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])

        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        #expect(await feedFailure { try await offline.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "제목") } == .network)
        #expect(await offline.transport.count == 3)
    }

    @Test("TC-FEED-033 응답 유실 후 같은 제목으로 다시 저장해도 200 멱등 응답을 성공으로 처리한다")
    func updateTitleIdempotent() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-title-update__200.json"))
        let first = try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "같은 제목")
        let second = try await sut.posts().updateTitle(id: FixtureIDs.minePost, rawTitle: "같은 제목")
        #expect(first == second)
    }

    // MARK: 삭제

    @Test("TC-FEED-036 TC-FEED-043 DELETE /posts/{id}: 본문 없이 Authorization을 붙이고 204면 성공이다")
    func deleteRequestShape() async throws {
        let fixture = try Fixture.load("feed/posts-delete__204.json")
        let sut = try FeedSUT(always: fixture)
        try await sut.posts().delete(id: FixtureIDs.minePost)
        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(request.body == nil)
    }

    @Test("TC-FEED-037 이미 삭제된 게시물에 DELETE를 반복해도 성공이다(멱등)")
    func deleteIdempotent() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-delete__204.json"))
        try await sut.posts().delete(id: FixtureIDs.minePost)
        try await sut.posts().delete(id: FixtureIDs.minePost)
        #expect(await sut.transport.count == 2)
    }

    @Test("TC-FEED-039 삭제 400(이미지 처리 중·검수 거절)은 badRequest다",
          arguments: ["feed/posts-delete__400-validating.json", "feed/posts-delete__400-rejected.json"])
    func deleteBadRequest(name: String) async throws {
        let fixture = try Fixture.load(name)
        let sut = try FeedSUT(always: fixture)
        let failure = await feedFailure { try await sut.posts().delete(id: FixtureIDs.minePost) }
        #expect(failure == .badRequest(message: fixture.errorMessage))
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-FEED-040 삭제 403은 정지 문구가 아니라 notOwner다(호출 API로 구분, D-02)")
    func deleteForbiddenIsNotOwner() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-delete__403-not-owner.json"))
        #expect(await feedFailure { try await sut.posts().delete(id: FixtureIDs.otherPost) } == .notOwner)
    }

    @Test("TC-FEED-041 삭제 404는 notFound다")
    func deleteNotFound() async throws {
        let sut = try FeedSUT(always: Fixture.load("feed/posts-delete__404-not-found.json"))
        #expect(await feedFailure { try await sut.posts().delete(id: FixtureIDs.minePost) } == .notFound)
    }

    @Test("TC-FEED-042 삭제 401(재인증)·500·연결 실패는 각각 unauthorized·server·network다")
    func deleteOtherFailures() async throws {
        let unauthorized = try Fixture.load("feed/posts-delete__401-unauthorized.json")
        let reauth = try FeedSUT(transport: FakeFeedTransport { request, _ in
            request.url.path.hasSuffix("/auth/refresh")
                ? jsonResponse(401, #"{"errorCode":"REAUTHENTICATION_REQUIRED","message":"다시 로그인해 주세요."}"#)
                : unauthorized.httpResponse
        })
        #expect(await feedFailure { try await reauth.posts().delete(id: FixtureIDs.minePost) } == .unauthorized)

        let server = try FeedSUT(always: Fixture.load("feed/posts-delete__500-server-error.json"))
        #expect(await feedFailure { try await server.posts().delete(id: FixtureIDs.minePost) } == .server(status: 500))

        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        #expect(await feedFailure { try await offline.posts().delete(id: FixtureIDs.minePost) } == .network)
    }
}
