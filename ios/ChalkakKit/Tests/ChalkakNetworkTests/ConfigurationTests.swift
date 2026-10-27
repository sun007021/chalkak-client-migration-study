import Foundation
import Testing
@testable import ChalkakNetwork

@Suite("NET 설정(base URL·loopback)")
struct ConfigurationTests {
    @Test("TC-NET-050 origin·접두 유무와 상관없이 같은 base URL(.../api/v1/)이 된다", arguments: [
        "https://h.test", "https://h.test/", "https://h.test/api/v1", "https://h.test/api/v1/", "  https://h.test/api/v1/ \n",
    ])
    func normalizesToSameBaseURL(input: String) throws {
        let config = try APIConfiguration(serverOrigin: input)
        #expect(config.baseURL.absoluteString == "https://h.test/api/v1/")
    }

    @Test("TC-NET-050 포트는 유지된다")
    func keepsPort() throws {
        #expect(try APIConfiguration(serverOrigin: "https://h.test:8443").baseURL.absoluteString == "https://h.test:8443/api/v1/")
    }

    @Test("TC-NET-050 접두가 겹치거나 다른 경로·query·fragment·userinfo가 있으면 거부한다", arguments: [
        "https://h.test/api/v1/api/v1", "https://h.test/api/v1/api/v1/", "https://h.test/x", "https://h.test/api/v1/x",
        "https://h.test/api/v2", "https://h.test/api", "https://h.test//", "https://h.test/api/v1//",
        "https://h.test?x=1", "https://h.test/?x=1", "https://h.test/api/v1?x=1", "https://h.test?", "https://h.test#f", "https://h.test/#",
        "https://user@h.test", "https://user:pw@h.test/api/v1/",
    ])
    func rejectsBadBase(input: String) {
        #expect(throws: ConfigurationError.invalidBaseURL, "\(input)") { try APIConfiguration(serverOrigin: input) }
    }

    @Test("TC-NET-050 https 외 스킴·빈 값·호스트 없음은 거부한다", arguments: [
        "http://api.test", "", "   ", "ftp://api.test/", "file:///x", "https://", "api.test", "https:///api", "//api.test", "javascript:alert(1)",
    ])
    func httpsOnly(input: String) {
        #expect(throws: ConfigurationError.invalidBaseURL, "\(input)") { try APIConfiguration(serverOrigin: input) }
    }

    @Test("TC-NET-050 loopback(localhost, 127.0.0.1, 10.0.2.2)의 http는 플래그가 켜졌을 때만 허용한다", arguments: [
        "http://localhost:4010", "http://127.0.0.1:4010", "http://10.0.2.2:4010", "http://localhost", "http://LOCALHOST:4010/api/v1/",
    ])
    func loopbackHttp(input: String) throws {
        #expect(throws: ConfigurationError.invalidBaseURL, "플래그 꺼짐 \(input)") { try APIConfiguration(serverOrigin: input) }
        let config = try APIConfiguration(serverOrigin: input, allowInsecureLoopback: true)
        #expect(config.baseURL.scheme == "http")
        #expect(config.baseURL.absoluteString.hasSuffix("/api/v1/"))
    }

    @Test("TC-NET-050 loopback처럼 보이는 호스트·userinfo 속임수의 http는 플래그가 켜져도 거부한다", arguments: [
        "http://localhost.evil.com", "http://evil.com/localhost", "http://localhost@evil.com", "http://127.0.0.1.evil.com",
        "http://127.0.0.2", "http://10.0.2.20", "http://10.0.2.2.evil.com", "http://evil.test", "http://evil.test#@localhost",
        "http://[::1]:4010", "http://0.0.0.0:4010", "http://evillocalhost",
    ])
    func loopbackSpoofs(input: String) {
        #expect(throws: ConfigurationError.invalidBaseURL, "\(input)") { try APIConfiguration(serverOrigin: input, allowInsecureLoopback: true) }
    }

    @Test("TC-NET-050 LoopbackHost는 세 호스트만 loopback으로 본다")
    func loopbackHostList() {
        for host in ["localhost", "127.0.0.1", "10.0.2.2", "LocalHost"] { #expect(LoopbackHost.contains(host), "\(host)") }
        for host in ["localhost.evil.com", "evil.com", "127.0.0.2", "::1", "", "10.0.2.2.", "a.localhost"] { #expect(!LoopbackHost.contains(host), "\(host)") }
    }

    // MARK: presigned 업로드 URL

    @Test("TC-NET-044 presigned URL은 https면 통과한다")
    func uploadURLHttps() throws {
        let config = try APIConfiguration(serverOrigin: "https://h.test")
        let url = URL(string: "https://bucket.s3.test/key.webp?X-Amz-Signature=abc")!
        #expect(try config.validatedUploadURL(url) == url)
    }

    @Test("TC-NET-044 presigned URL은 플래그가 켜진 loopback http만 예외로 통과한다", arguments: [
        "http://localhost:4010/__upload/abc", "http://10.0.2.2:4010/__upload/abc", "http://127.0.0.1:4010/__upload/abc",
    ])
    func uploadURLLoopback(raw: String) throws {
        let url = URL(string: raw)!
        let on = try APIConfiguration(serverOrigin: "http://localhost:4010", allowInsecureLoopback: true)
        #expect(try on.validatedUploadURL(url) == url)
        let off = try APIConfiguration(serverOrigin: "https://h.test")
        #expect(throws: ConfigurationError.invalidUploadURL) { try off.validatedUploadURL(url) }
    }

    @Test("TC-NET-044 presigned URL의 비 https·loopback 위장·userinfo·호스트 없음은 거부한다", arguments: [
        "http://evil/x", "http://s3.test/key", "file:///x", "ftp://s3.test/x", "http://localhost.evil.com/x", "http://localhost@evil.com/x",
        "https://user:pw@s3.test/x", "https://user@s3.test/x", "https:///x", "data:text/plain,hi", "http://127.0.0.2/x",
    ])
    func uploadURLRejects(raw: String) throws {
        let on = try APIConfiguration(serverOrigin: "http://localhost:4010", allowInsecureLoopback: true)
        let url = try #require(URL(string: raw))
        #expect(throws: ConfigurationError.invalidUploadURL, "\(raw)") { try on.validatedUploadURL(url) }
    }

    @Test("TC-NET-044 안전하지 않은 업로드 URL은 전송 전에 거부하고 아무것도 보내지 않는다", arguments: [
        "http://s3.test/key", "file:///x", "http://localhost@evil.com/x", "http://localhost:4010/x",
    ])
    func uploadRejectedBeforeSend(raw: String) async throws {
        let sut = try SUT(script: [.response(HTTPResponse(status: 200))])
        await #expect(throws: ConfigurationError.invalidUploadURL) {
            try await sut.client.uploadToPresignedURL(URL(string: raw)!, data: Data([1]), contentType: "image/webp")
        }
        #expect(await sut.transport.count == 0)
    }

    @Test("TC-NET-044 플래그가 켜진 loopback http 업로드는 전송된다")
    func uploadLoopbackSent() async throws {
        let sut = try SUT(transport: FakeTransport(script: [.response(HTTPResponse(status: 200))]), origin: "http://localhost:4010", allowInsecureLoopback: true)
        try await sut.client.uploadToPresignedURL(URL(string: "http://localhost:4010/__upload/abc")!, data: Data([1]), contentType: "image/png")
        #expect(await sut.transport.count == 1)
    }
}
