import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

@Suite("Post 목록 저장소")
struct PostListRepositoryTests {
    @Test("TC-DISP-002 GET /posts 요청 모양(topicDate·sort·page·pageSize)과 사진 4종 URL·좋아요·isMine 매핑")
    func requestShapeAndMapping() async throws {
        let fixture = try Fixture.load("display/posts-list__recent-page1.json")
        let sut = try FeedSUT(always: fixture)

        let page = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: .recent, page: 1))

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.queryDictionary == fixture.query)
        #expect(page.currentPage == 1)
        #expect(page.pageSize == 20)
        #expect(page.hasNext)
        #expect(page.randomSeed == nil)
        let rawPosts = try #require(fixture.object()["posts"] as? [[String: Any]])
        #expect(page.posts.count == rawPosts.count)
        let first = try #require(page.posts.first)
        #expect(first.id == UUID(uuidString: "22222222-2222-4222-8222-222222222202"))
        #expect(first.authorId == UUID(uuidString: FixtureIDs.otherUserId))
        #expect(first.originalImageURL.absoluteString == "https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/original.webp")
        #expect(first.thumbnailImageURL?.absoluteString == "https://cdn.example.test/posts/22222222-2222-4222-8222-222222222202/thumbnail.webp")
        #expect(first.signatureOriginalImageURL.absoluteString.hasSuffix("/original.png"))
        #expect(first.signatureThumbnailImageURL?.absoluteString.hasSuffix("/thumbnail.png") == true)
        #expect(first.title == "은행잎")
        #expect(first.likeCount == 38)
        #expect(first.isLiked == false)
        #expect(first.isMine == false)
        let mine = try #require(page.posts.first { $0.id == FixtureIDs.minePost })
        #expect(mine.isMine)
        #expect(page.posts.contains { $0.title == nil })   // 제목 없는 항목도 허용
    }

    @Test("TC-DISP-004 로그인 사용자는 Authorization을 붙인다")
    func loggedInSendsAuthorization() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__recent-page1.json"))
        _ = try await sut.posts(viewer: .me).list(PostListQuery(topicDate: day(2026, 10, 27)))
        let request = try #require(await sut.transport.requests.first)
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-DISP-004 TC-DISP-053 게스트는 세션이 남아 있어도 Authorization 없이 보내고 isLiked·isMine은 모두 false다")
    func guestIsAnonymous() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__guest-page1.json"))
        let page = try await sut.posts(viewer: .guest).list(PostListQuery(topicDate: day(2026, 10, 27)))
        let request = try #require(await sut.transport.requests.first)
        #expect(request.header("Authorization") == nil)
        #expect(!page.posts.isEmpty)
        #expect(page.posts.allSatisfy { !$0.isLiked && !$0.isMine })
    }

    @Test("TC-DISP-003 sort는 소문자, pageSize 기본 20, page는 그대로 쿼리에 실린다", arguments: PostSort.allCases)
    func sortQueryIsLowercase(sort: PostSort) async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__recent-page1.json"))
        _ = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: sort, randomSeed: "seed_abc123", page: 3))
        let query = try #require(await sut.transport.requests.first).queryDictionary
        #expect(query["sort"] == sort.rawValue)
        #expect(query["sort"] == query["sort"]?.lowercased())
        #expect(query["topicDate"] == "2026-10-27")
        #expect(query["page"] == "3")
        #expect(query["pageSize"] == "20")
    }

    @Test("TC-DISP-003 randomSeed는 random 정렬이고 [A-Za-z0-9_-]{1,64}일 때만 붙는다",
          arguments: [
              (PostSort.random, "seed_abc123", true),
              (PostSort.random, "A-z_9", true),
              (PostSort.random, String(repeating: "a", count: 64), true),
              (PostSort.recent, "bad seed!", false),
              (PostSort.recent, "seed_abc123", false),
              (PostSort.popular, "seed_abc123", false),
          ])
    func seedAttachRule(sort: PostSort, seed: String, attached: Bool) async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__recent-page1.json"))
        _ = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: sort, randomSeed: seed, page: 2))
        let query = try #require(await sut.transport.requests.first).queryDictionary
        #expect(query["randomSeed"] == (attached ? seed : nil))
    }

    @Test("TC-DISP-003 TC-DISP-016 랜덤 2페이지 이후에 seed가 없거나 형식이 틀리면 요청 없이 badRequest다(시드를 잃음: 첫 페이지부터 다시)",
          arguments: [nil, "", "bad seed!", "한글", String(repeating: "a", count: 65)])
    func randomLaterPageWithoutValidSeedFailsFast(seed: String?) async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__recent-page1.json"))
        let failure = await feedFailure { try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: .random, randomSeed: seed, page: 2)) }
        #expect(failure == .badRequest(message: nil))
        #expect(await sut.transport.count == 0)
    }

    @Test("TC-DISP-015 랜덤 첫 페이지는 randomSeed를 보내지 않고 응답 randomSeed를 돌려준다")
    func randomFirstPage() async throws {
        let fixture = try Fixture.load("display/posts-list__random-page1-seed.json")
        let sut = try FeedSUT(always: fixture)
        let page = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: .random, page: 1))
        let request = try #require(await sut.transport.requests.first)
        #expect(request.queryDictionary["randomSeed"] == nil)
        #expect(request.queryDictionary == fixture.query)
        #expect(page.randomSeed == "seed_abc123")
    }

    @Test("TC-DISP-016 랜덤 2페이지는 page=2와 저장 seed를 함께 보낸다")
    func randomSecondPage() async throws {
        let fixture = try Fixture.load("display/posts-list__random-page2.json")
        let sut = try FeedSUT(always: fixture)
        _ = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: .random, randomSeed: "seed_abc123", page: 2))
        let request = try #require(await sut.transport.requests.first)
        #expect(request.queryDictionary == fixture.query)
    }

    @Test("TC-DISP-018 최신·인기 정렬 요청에는 randomSeed가 없다")
    func nonRandomHasNoSeed() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__recent-page1.json"))
        _ = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: .recent, randomSeed: "seed_abc123"))
        #expect(try #require(await sut.transport.requests.first).queryDictionary["randomSeed"] == nil)
    }

    @Test("TC-DISP-019 랜덤 응답의 randomSeed가 null이면 nil이다")
    func randomSeedNull() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__random-no-seed.json"))
        let page = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), sort: .random))
        #expect(page.randomSeed == nil)
    }

    @Test("TC-DISP-023 범위 밖 page의 빈 posts·hasNext=false 응답은 오류 없이 처리한다")
    func emptyPage() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__page99-empty.json"))
        let page = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27), page: 99))
        #expect(page.posts.isEmpty)
        #expect(page.hasNext == false)
        #expect(page.currentPage == 99)
    }

    @Test("TC-DISP-043 5개 미만 응답도 그대로 매핑한다")
    func fewPosts() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__popular-3.json"))
        let page = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 26), sort: .popular))
        #expect(page.posts.count == 3)
    }

    @Test("TC-DISP-007 404는 notFound다")
    func notFound() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__404-topic-not-found.json"))
        let failure = await feedFailure { try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27))) }
        #expect(failure == .notFound)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-DISP-008 400은 서버 message를 보존한 badRequest이고 재시도하지 않는다",
          arguments: ["display/posts-list__400-bad-query.json", "display/posts-list__400-future-date.json"])
    func badRequest(name: String) async throws {
        let fixture = try Fixture.load(name)
        let sut = try FeedSUT(always: fixture)
        let failure = await feedFailure { try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27))) }
        #expect(failure == .badRequest(message: fixture.errorMessage))
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-DISP-005 500은 재시도(0.5s·1s) 후 server 오류, 연결 실패는 network다")
    func serverAndNetworkFailures() async throws {
        let server = try FeedSUT(always: Fixture.load("display/posts-list__500-server-error.json"))
        #expect(await feedFailure { try await server.posts().list(PostListQuery(topicDate: day(2026, 10, 27))) } == .server(status: 500))
        #expect(await server.transport.count == 3)
        #expect(server.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])

        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.timeout })
        #expect(await feedFailure { try await offline.posts().list(PostListQuery(topicDate: day(2026, 10, 27))) } == .network)
    }

    @Test("TC-DISP-052 503 Retry-After는 지정한 시간만 기다리고 GET은 최대 2회 재시도한다")
    func retryAfter() async throws {
        let sut = try FeedSUT(always: Fixture.load("display/posts-list__503-retry-after.json"))
        let failure = await feedFailure { try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27))) }
        #expect(failure == .server(status: 503))
        #expect(await sut.transport.count == 3)
        #expect(sut.clock.recordedSleeps == [.seconds(1), .seconds(1)])
    }

    @Test("TC-DISP-051 공개 API라도 로그인 사용자의 401은 refresh 후 1회 재전송한다")
    func unauthorizedRefreshesThenRetries() async throws {
        let unauthorized = try Fixture.load("display/posts-list__401-unauthorized.json")
        let ok = try Fixture.load("display/posts-list__recent-page1.json")
        let sut = try FeedSUT(transport: FakeFeedTransport { request, _ in
            if request.url.path.hasSuffix("/auth/refresh") { return refreshSuccess }
            return request.header("Authorization") == "Bearer new-access" ? ok.httpResponse : unauthorized.httpResponse
        })

        let page = try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27)))

        #expect(!page.posts.isEmpty)
        let requests = await sut.transport.requests
        #expect(requests.filter { $0.url.path.hasSuffix("/posts") }.count == 2)
        #expect(requests.filter { $0.url.path.hasSuffix("/auth/refresh") }.count == 1)
    }

    @Test("REQ-DISP-034 필수 필드 누락·음수 likeCount·타입 오류 항목이 있으면 응답 전체가 invalidResponse다")
    func contractViolations() async throws {
        let fixture = try Fixture.load("display/posts-list__recent-page1.json")
        let mutations: [(inout [String: Any]) -> Void] = [
            { $0["likeCount"] = -1 },
            { $0.removeValue(forKey: "id") },
            { $0.removeValue(forKey: "originalImageUrl") },
            { $0["likeCount"] = "많음" },
            { $0["isLiked"] = "yes" },
            { $0["id"] = "not-a-uuid" },
        ]
        for mutate in mutations {
            var object = try fixture.object()
            var posts = try #require(object["posts"] as? [[String: Any]])
            mutate(&posts[0])
            object["posts"] = posts
            let body = try JSONSerialization.data(withJSONObject: object)
            let sut = try FeedSUT(transport: fixtureResponse(body))
            let failure = await feedFailure { try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27))) }
            #expect(failure == .invalidResponse)
        }
    }

    @Test("TC-DISP-034 썸네일이 없으면 원본으로 대체한다")
    func thumbnailFallback() async throws {
        let fixture = try Fixture.load("display/posts-list__recent-page1.json")
        var object = try fixture.object()
        var posts = try #require(object["posts"] as? [[String: Any]])
        posts[0]["thumbnailImageUrl"] = NSNull()
        object["posts"] = posts
        let sut = try FeedSUT(transport: fixtureResponse(try JSONSerialization.data(withJSONObject: object)))
        let first = try #require(try await sut.posts().list(PostListQuery(topicDate: day(2026, 10, 27))).posts.first)
        #expect(first.thumbnailImageURL == nil)
        #expect(first.displayThumbnailURL == first.originalImageURL)
    }
}
