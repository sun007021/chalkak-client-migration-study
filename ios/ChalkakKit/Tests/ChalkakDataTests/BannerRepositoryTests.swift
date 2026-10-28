import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

private func bannerBody(_ webViewUrl: String) -> String {
    #"{"currentPage":1,"pageSize":10,"hasNext":false,"banners":[{"id":"44444444-4444-4444-8444-444444444401","title":"t","subtitle":"s","webViewUrl":"\#(webViewUrl)","thumbnailUrl":"https://cdn.example.test/t.webp","createdAt":"2026-10-27T01:00:00Z"}]}"#
}

@Suite("BANR 배너 목록(GET /banners) 저장소")
struct BannerRepositoryTests {
    @Test("TC-BANR-001 page=1&pageSize=10을 Authorization 없이(세션이 있어도) 호출하고 서버 순서·필드를 그대로 매핑한다")
    func requestShapeAndMapping() async throws {
        let fixture = try Fixture.load("banner/banners__page1-10.json")
        let sut = try FeedSUT(always: fixture)   // 로그인 세션이 있는 상태

        let page = try await sut.bannerRepository.page(1, pageSize: AppConstants.bannerPageSize)

        let request = try #require(await sut.transport.requests.first)
        #expect(fixture.matches(request))
        #expect(request.queryDictionary == ["page": "1", "pageSize": "10"])
        #expect(request.header("Authorization") == nil)
        #expect(page.currentPage == 1)
        #expect(page.pageSize == 10)
        #expect(page.hasNext == true)
        #expect(page.banners.count == 10)
        let first = page.banners[0]
        #expect(first.id == UUID(uuidString: "44444444-4444-4444-8444-444444444401"))
        #expect(first.title == "이슈 1")
        #expect(first.subtitle == "찰칵 소식 1")
        #expect(first.webViewURL == URL(string: "https://web.example.test/issues/1"))
        #expect(first.thumbnailURL == URL(string: "https://cdn.example.test/banners/44444444-4444-4444-8444-444444444401/thumbnail.webp"))
        #expect(first.createdAt == Instant.parse("2026-10-27T01:00:00Z"))
        #expect(page.banners.map(\.title) == (1...10).map { "이슈 \($0)" })
    }

    @Test("TC-BANR-002 만료 토큰 상황에서도 토큰을 보내지 않고, 서버가 401을 줘도 refresh하지 않고 unauthorized 오류다")
    func neverRefreshes() async throws {
        let sut = try FeedSUT(always: Fixture.load("banner/banners__401-unauthorized.json"))

        let failure = await feedFailure { try await sut.bannerRepository.page(1, pageSize: 10) }

        #expect(failure == .unauthorized)
        let requests = await sut.transport.requests
        #expect(requests.count == 1)
        #expect(requests.allSatisfy { $0.header("Authorization") == nil })
        #expect(!requests.contains { $0.url.path.hasSuffix("/auth/refresh") })
    }

    @Test("TC-BANR-003 page=2 쿼리를 그대로 전달하고 빈 banners·hasNext=false도 오류 없이 처리한다")
    func laterAndEmptyPages() async throws {
        let last = try Fixture.load("banner/banners__page2-last.json")
        let sut = try FeedSUT(always: last)
        let page = try await sut.bannerRepository.page(2, pageSize: 10)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.queryDictionary == ["page": "2", "pageSize": "10"])
        #expect(page.currentPage == 2)
        #expect(page.hasNext == false)
        #expect(page.banners.count == 3)

        let empty = try FeedSUT(always: Fixture.load("banner/banners__empty.json"))
        let emptyPage = try await empty.bannerRepository.page(1, pageSize: 10)
        #expect(emptyPage.banners.isEmpty)
        #expect(emptyPage.hasNext == false)
    }

    @Test("TC-BANR-004 hasNext가 없으면 마지막 페이지(false)로 처리한다")
    func missingHasNext() async throws {
        let sut = try FeedSUT(always: Fixture.load("banner/banners__no-has-next.json"))
        let page = try await sut.bannerRepository.page(1, pageSize: 10)
        #expect(page.hasNext == false)
        #expect(page.banners.count == 3)
    }

    @Test("TC-BANR-005 400은 갱신·재시도 없이 badRequest, 500·연결 오류는 0.5초·1초 백오프 2회 재시도 뒤 오류다")
    func failures() async throws {
        let bad = try FeedSUT(always: Fixture.load("banner/banners__400-bad-query.json"))
        let badFailure = await feedFailure { try await bad.bannerRepository.page(1, pageSize: 10) }
        #expect(badFailure == .badRequest(message: "조회 조건이 올바르지 않습니다."))
        #expect(await bad.transport.count == 1)

        let server = try FeedSUT(always: Fixture.load("banner/banners__500-server-error.json"))
        let serverFailure = await feedFailure { try await server.bannerRepository.page(1, pageSize: 10) }
        #expect(serverFailure == .server(status: 500))
        #expect(await server.transport.count == 3)
        #expect(server.clock.recordedSleeps == [.milliseconds(500), .seconds(1)])
        #expect(!(await server.transport.requests).contains { $0.url.path.hasSuffix("/auth/refresh") })

        let offline = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.timeout })
        let offlineFailure = await feedFailure { try await offline.bannerRepository.page(1, pageSize: 10) }
        #expect(offlineFailure == .network)
        #expect(await offline.transport.count == 3)
    }

    @Test("TC-BANR-006 깨진 JSON이나 http:// 등 안전하지 않은 webViewUrl이 하나라도 있으면 응답 전체가 invalidResponse다")
    func invalidResponses() async throws {
        let ok = try FeedSUT(always: Fixture.load("banner/banners__page1.json"))
        #expect(try await ok.bannerRepository.page(1, pageSize: 10).banners.count == 10)   // 정상 응답은 통과

        for name in ["banner/banners__malformed.json", "banner/banners__insecure-url.json"] {
            let sut = try FeedSUT(always: Fixture.load(name))
            let failure = await feedFailure { try await sut.bannerRepository.page(1, pageSize: 10) }
            #expect(failure == .invalidResponse, "\(name)")
        }
    }

    @Test("TC-BANR-006 https가 아니거나 호스트가 없거나 비어 있는 webViewUrl도 응답 전체가 invalidResponse다", arguments: [
        "http://web.example.test/a", "ftp://web.example.test/a", "javascript:alert(1)", "https://", "", "web.example.test/a", "not a url",
    ])
    func unsafeWebViewURLs(url: String) async throws {
        let ok = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, bannerBody("https://web.example.test/a")) })
        #expect(try await ok.bannerRepository.page(1, pageSize: 10).banners.count == 1)

        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, bannerBody(url)) })
        let failure = await feedFailure { try await sut.bannerRepository.page(1, pageSize: 10) }
        #expect(failure == .invalidResponse)
    }

    @Test("TC-BANR-007 thumbnailUrl만 잘못된 배너는 유지하고 thumbnailURL은 nil(대체 배경)이다")
    func badThumbnailKeepsBanner() async throws {
        let sut = try FeedSUT(always: Fixture.load("banner/banners__bad-thumbnail.json"))
        let page = try await sut.bannerRepository.page(1, pageSize: 10)
        #expect(page.banners.count == 3)
        #expect(page.banners[0].thumbnailURL != nil)
        #expect(page.banners[1].thumbnailURL == nil)
        #expect(page.banners[1].webViewURL == URL(string: "https://web.example.test/issues/2"))
        #expect(page.banners[2].thumbnailURL != nil)
    }

    @Test("TC-BANR-007 thumbnailUrl이 null·http·비어 있어도 배너는 유지하고 thumbnailURL은 nil이다", arguments: ["null", #""http://cdn.example.test/t.webp""#, #""""#])
    func nonHTTPSThumbnailBecomesNil(value: String) async throws {
        let body = #"{"currentPage":1,"pageSize":10,"hasNext":false,"banners":[{"id":"44444444-4444-4444-8444-444444444401","title":"t","subtitle":"s","webViewUrl":"https://web.example.test/a","thumbnailUrl":\#(value),"createdAt":"2026-10-27T01:00:00Z"}]}"#
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in jsonResponse(200, body) })
        let page = try await sut.bannerRepository.page(1, pageSize: 10)
        #expect(page.banners.count == 1)
        #expect(page.banners[0].thumbnailURL == nil)
    }

    @Test("TC-BANR-008 요청이 취소되면 네트워크 오류로 바꾸지 않고 CancellationError를 그대로 전파한다")
    func cancellationPropagates() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw CancellationError() })
        do {
            _ = try await sut.bannerRepository.page(1, pageSize: 10)
            Issue.record("오류가 나야 한다")
        } catch is CancellationError {
        } catch {
            Issue.record("CancellationError가 아닌 오류: \(error)")
        }
    }
}
