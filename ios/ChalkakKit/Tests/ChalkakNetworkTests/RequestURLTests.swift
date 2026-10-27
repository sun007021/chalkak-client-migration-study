import Foundation
import Testing
@testable import ChalkakNetwork

@Suite("NET 요청 URL 조립(경로·쿼리 인코딩)")
struct RequestURLTests {
    private func sentURL(_ request: HTTPRequest) async throws -> URL {
        let sut = try SUT(script: [.response(.ok)])
        _ = try await sut.client.send(request)
        return try #require(await sut.transport.requests.first).url
    }

    @Test("TC-NET-053 앞의 슬래시 유무와 상관없이 base URL 뒤에 붙는다", arguments: ["/posts", "posts", "//posts"])
    func leadingSlash(path: String) async throws {
        #expect(try await sentURL(get(path)).absoluteString == "https://api.test/api/v1/posts")
    }

    @Test("TC-NET-053 경로 세그먼트는 비예약 문자만 그대로 두고 퍼센트 인코딩한다", arguments: [
        ("/posts/abc def", "/api/v1/posts/abc%20def"),
        ("/posts/a%b", "/api/v1/posts/a%25b"),
        ("/posts/a+b", "/api/v1/posts/a%2Bb"),
        ("/posts/한", "/api/v1/posts/%ED%95%9C"),
        ("/posts/a-b_c.d~e", "/api/v1/posts/a-b_c.d~e"),
        ("/posts/a:b@c", "/api/v1/posts/a%3Ab%40c"),
        ("/posts/a\\b", "/api/v1/posts/a%5Cb"),
    ])
    func segmentEncoding(path: String, expected: String) async throws {
        let url = try await sentURL(get(path))
        #expect(url.absoluteString == "https://api.test" + expected)
    }

    @Test("TC-NET-053 경로에 ? # .. . 빈 세그먼트·끝 슬래시가 있으면 invalidPath로 전송 전 거부한다", arguments: [
        "/posts?x=1", "/posts#top", "/posts/../users", "/posts/./x", "/posts//x", "/posts/", "", "/", "///", "/..", "/posts/%2e%2e/x/..",
    ])
    func rejectsBadPaths(path: String) async throws {
        let sut = try SUT(script: [.response(.ok)])
        await #expect(throws: ConfigurationError.invalidPath, "\(path)") { try await sut.client.send(get(path)) }
        #expect(await sut.transport.count == 0)
    }

    @Test("TC-NET-053 경로로 호스트를 바꿀 수 없다")
    func pathCannotChangeHost() async throws {
        for path in ["/@evil.com/x", "//evil.com/x", "/evil.com:80/x", "/\\evil.com"] {
            let url = try await sentURL(get(path))
            #expect(url.host == "api.test", "\(path) -> \(url)")
            #expect(url.absoluteString.hasPrefix("https://api.test/api/v1/"))
        }
    }

    @Test("TC-NET-053 쿼리는 비예약 문자만 그대로 두고 +는 %2B, 공백은 %20으로 인코딩한다")
    func queryEncodingExact() async throws {
        let url = try await sentURL(get("/posts", query: [
            QueryItem(name: "q", value: "a+b c&d=e#f"),
            QueryItem(name: "한 글", value: "값~-._"),
            QueryItem(name: "empty", value: ""),
        ]))
        #expect(url.absoluteString == "https://api.test/api/v1/posts?q=a%2Bb%20c%26d%3De%23f&%ED%95%9C%20%EA%B8%80=%EA%B0%92~-._&empty=")
    }

    @Test("TC-NET-053 쿼리가 없으면 물음표도 붙지 않는다")
    func noQueryNoQuestionMark() async throws {
        #expect(try await sentURL(get("/posts")).absoluteString == "https://api.test/api/v1/posts")
    }

    @Test("TC-NET-053 쿼리 값의 퍼센트 기호는 이중 해석되지 않도록 %25로 인코딩된다")
    func percentInQuery() async throws {
        let url = try await sentURL(get("/posts", query: [QueryItem(name: "q", value: "100%")]))
        #expect(url.absoluteString.hasSuffix("?q=100%25"))
    }
}
