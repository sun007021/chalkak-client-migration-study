import Foundation
import Testing
import ChalkakCore
@testable import ChalkakNetwork

private let sampleUUID = UUID(uuidString: "0B9D2F0E-1111-4222-8333-444455556666")!
private let lowerUUID = "0b9d2f0e-1111-4222-8333-444455556666"

@Suite("NET 요청 모양")
struct RequestShapeTests {
    @Test("TC-NET-043 일반 API 요청은 연결 10초·응답 15초 타임아웃을 싣는다")
    func standardTimeouts() async throws {
        let sut = try SUT(script: [.response(.ok)])
        _ = try await sut.client.send(get("/topics"))
        let t = try #require(await sut.transport.requests.first).timeouts
        #expect(t.connect == .seconds(10))
        #expect(t.response == .seconds(15))
        #expect(NetworkTimeouts.standard == t)
    }

    @Test("TC-NET-044 presigned PUT은 60초이고 Authorization·공통 헤더가 없다")
    func presignedPut() async throws {
        let sut = try SUT(script: [.response(HTTPResponse(status: 200))])
        let url = URL(string: "https://bucket.s3.test/key.webp?X-Amz-Signature=abc&X-Amz-Credential=cred")!
        try await sut.client.uploadToPresignedURL(url, data: Data([1, 2, 3]), contentType: "image/webp")
        let r = try #require(await sut.transport.requests.first)
        #expect(r.method == .put)
        #expect(r.url == url)
        #expect(r.body == Data([1, 2, 3]))
        #expect(r.timeouts.response == .seconds(60))
        #expect(NetworkTimeouts.presignedUpload.response == .seconds(60))
        #expect(r.bearer == nil)
        #expect(r.header("Accept") == nil)
        #expect(Set(r.headers.keys.map { $0.lowercased() }).isSubset(of: ["content-type"]))
        #expect(r.header("Content-Type") == "image/webp")
    }

    @Test("TC-NET-044 presigned PUT이 401·403이어도 refresh하지 않고 오류를 돌려준다")
    func presignedPutFailure() async throws {
        let sut = try SUT(script: [.response(HTTPResponse(status: 403, body: Data("<Error/>".utf8)))])
        await #expect(throws: APIError.self) {
            try await sut.client.uploadToPresignedURL(URL(string: "https://b.test/k?sig=1")!, data: Data([1]), contentType: "image/webp")
        }
        #expect(await sut.transport.requests.filter(\.isRefresh).isEmpty)
    }

    @Test("TC-NET-045 타임아웃·연결 실패·DNS·TLS·기타 전송 오류는 모두 APIError.network", arguments: [
        TransportError.timeout, .notConnected, .dnsFailure, .tls, .other("boom"),
    ])
    func transportErrorsMapToNetwork(error: TransportError) async throws {
        let sut = try SUT(script: [.fail(error)])
        await #expect(throws: APIError.network) {
            try await sut.client.send(HTTPRequest(method: .post, path: "/feedbacks"))
        }
    }

    @Test("TC-NET-048 TransportError.cancelled는 Network 오류가 아니라 CancellationError로 전파된다")
    func transportCancelled() async throws {
        let sut = try SUT(script: [.fail(.cancelled)])
        await #expect(throws: CancellationError.self) { try await sut.client.send(get("/x")) }
        #expect(await sut.transport.count == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-NET-048 트랜스포트가 던진 CancellationError도 그대로 전파되고 재시도하지 않는다")
    func cancellationErrorPropagates() async throws {
        let sut = try SUT(script: [.cancel, .response(.ok)])
        await #expect(throws: CancellationError.self) { try await sut.client.send(get("/x")) }
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-NET-048 Task 취소 시 진행 중 요청은 CancellationError로 끝난다")
    func taskCancellation() async throws {
        let gate = Gate()
        let transport = FakeTransport { _, _ in
            await gate.wait()
            try Task.checkCancellation()
            return .ok
        }
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/x")) }
        await waitUntil { await transport.count == 1 }
        task.cancel()
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
    }

    @Test("TC-NET-050 https에서 http로의 리다이렉트는 따르지 않는다")
    func redirects() {
        let https = URL(string: "https://api.test/a")!
        let http = URL(string: "http://api.test/b")!
        #expect(RedirectPolicy.shouldFollow(from: https, to: http) == false)
        #expect(RedirectPolicy.shouldFollow(from: https, to: URL(string: "https://api.test/c")!) == true)
        #expect(RedirectPolicy.shouldFollow(from: http, to: https) == true)
    }

    @Test("TC-NET-051 비 TLS(http) 요청에는 Authorization을 붙이지 않는다")
    func noAuthOverHttp() async throws {
        let sut = try SUT(transport: FakeTransport(script: [.response(.ok)]), origin: "http://localhost:4010", allowInsecureLoopback: true)
        _ = try await sut.client.send(get("/notifications"))
        let r = try #require(await sut.transport.requests.first)
        #expect(r.url.scheme == "http")
        #expect(r.bearer == nil)
    }

    @Test("TC-NET-052 UUID는 소문자 정규형으로 나간다")
    func uuidLowercase() async throws {
        #expect(sampleUUID.apiString == lowerUUID)
        // 경로
        let sut = try SUT(script: [.response(.ok)])
        _ = try await sut.client.send(get("/posts/\(sampleUUID.apiString)", query: [.uuid("authorId", sampleUUID)]))
        let r = try #require(await sut.transport.requests.first)
        #expect(r.url.absoluteString.contains(lowerUUID))
        #expect(r.url.absoluteString.contains(sampleUUID.uuidString) == false)
        #expect(QueryItem.uuid("id", sampleUUID).value == lowerUUID)
    }

    @Test("TC-NET-052 JSON 바디의 UUID는 APIUUID로 감싸면 소문자로 인코딩된다")
    func uuidInBody() throws {
        struct Body: Encodable { let uploadId: APIUUID; let ids: [APIUUID] }
        let data = try APIJSON.makeEncoder().encode(Body(uploadId: APIUUID(sampleUUID), ids: [APIUUID(sampleUUID)]))
        let text = String(decoding: data, as: UTF8.self)
        #expect(text.contains(lowerUUID))
        #expect(text.contains(sampleUUID.uuidString) == false)
    }

    @Test("TC-NET-052 APIUUID는 대소문자 어느 쪽 문자열도 디코딩하고 다시 인코딩하면 소문자다")
    func apiUUIDRoundTrip() throws {
        struct Body: Codable, Equatable { let id: APIUUID }
        for text in [lowerUUID, sampleUUID.uuidString] {
            let decoded = try JSONDecoder().decode(Body.self, from: Data(#"{"id":"\#(text)"}"#.utf8))
            #expect(decoded.id.value == sampleUUID)
            let again = String(decoding: try APIJSON.makeEncoder().encode(decoded), as: UTF8.self)
            #expect(again.contains(lowerUUID))
        }
        #expect(throws: DecodingError.self) { try JSONDecoder().decode(Body.self, from: Data(#"{"id":"not-a-uuid"}"#.utf8)) }
    }

    @Test("TC-NET-052 사용자 문자열은 UUID 모양이어도 인코더가 건드리지 않는다(후처리 없음)")
    func userStringsUntouched() throws {
        struct Body: Encodable { let nickname: String; let content: String; let list: [String] }
        let upper = sampleUUID.uuidString
        let body = Body(nickname: upper, content: "그는 \"\(upper)\" 라고 썼다", list: [upper, "\\\"\(upper)\\\""])
        let data = try APIJSON.makeEncoder().encode(body)
        let decoded = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(decoded["nickname"] as? String == upper)
        #expect(decoded["content"] as? String == "그는 \"\(upper)\" 라고 썼다")
        #expect(decoded["list"] as? [String] == [upper, "\\\"\(upper)\\\""])
        #expect(String(decoding: data, as: UTF8.self).contains(lowerUUID) == false)
    }

    @Test("TC-NET-053 정수·날짜·sort 쿼리는 로캘과 무관한 ASCII 형식이다")
    func queryEncoding() {
        #expect(QueryItem.int("page", 0).value == "0")
        #expect(QueryItem.int("pageSize", 1_234_567).value == "1234567")
        #expect(QueryItem.int("randomSeed", -42).value == "-42")
        #expect(QueryItem.date("date", KSTDate(year: 2026, month: 3, day: 5)!).value == "2026-03-05")
        #expect(KSTDate(year: 2026, month: 12, day: 31)!.string == "2026-12-31")
        #expect(QueryItem.sort("sort", "LATEST").value == "latest")
        #expect(QueryItem.date("date", KSTDate(year: 2026, month: 3, day: 5)!).value.allSatisfy { $0.isASCII })
    }

    @Test("TC-NET-053 쿼리는 URL에 지정한 순서·이름 그대로 실린다")
    func queryInURL() async throws {
        let sut = try SUT(script: [.response(.ok)])
        let q: [QueryItem] = [.date("date", KSTDate(year: 2026, month: 3, day: 5)!), .int("page", 0), .int("pageSize", 20), .sort("sort", "LATEST")]
        _ = try await sut.client.send(get("/posts", query: q))
        let r = try #require(await sut.transport.requests.first)
        #expect(r.url.query == "date=2026-03-05&page=0&pageSize=20&sort=latest")
    }

    @Test("TC-NET-054 바디가 있으면 Content-Type·Accept가 JSON이고, 본문 없는 요청은 Content-Type과 본문이 없다")
    func headers() async throws {
        let sut = try SUT(script: [.response(.ok), .response(.noContent), .response(.noContent), .response(.noContent)])
        _ = try await sut.client.send(HTTPRequest(method: .post, path: "/feedbacks", body: Data(#"{"content":"hi"}"#.utf8)))
        try await sut.client.sendEmpty(HTTPRequest(method: .post, path: "/notifications/read-all"))
        try await sut.client.sendEmpty(HTTPRequest(method: .put, path: "/x"))
        try await sut.client.sendEmpty(HTTPRequest(method: .delete, path: "/users/me"))
        let reqs = await sut.transport.requests
        #expect(reqs[0].header("Content-Type") == "application/json")
        #expect(reqs[0].header("Accept") == "application/json")
        #expect(reqs[0].body == Data(#"{"content":"hi"}"#.utf8))
        for r in reqs.dropFirst() {
            #expect(r.body == nil)
            #expect(r.header("Content-Type") == nil)
            #expect(r.header("Accept") == "application/json")
        }
    }

    @Test("TC-NET-055 로그에 토큰·nonce·presigned 쿼리가 남지 않는다")
    func logsAreRedacted() async throws {
        let secrets = ["secret-access-AAA", "secret-refresh-BBB", "secret-idtoken-CCC", "secret-nonce-DDD", "secret-fcm-EEE", "secret-signup-FFF", "SIGSECRET", "CREDSECRET", "secret-resp-GGG"]
        let body = #"{"accessToken":"secret-access-AAA","refreshToken":"secret-refresh-BBB","idToken":"secret-idtoken-CCC","rawNonce":"secret-nonce-DDD","fcmToken":"secret-fcm-EEE","signupToken":"secret-signup-FFF"}"#
        let respBody = #"{"accessToken":"secret-resp-GGG","refreshToken":"secret-refresh-BBB"}"#
        let sut = try SUT(
            session: makeSession(access: "secret-access-AAA"),
            script: [.response(.json(200, respBody)), .response(.json(400, #"{"errorCode":"BUSINESS_ERROR","message":"bad secret-idtoken-CCC"}"#)), .response(HTTPResponse(status: 200))]
        )
        _ = try await sut.client.send(HTTPRequest(method: .post, path: "/auth/social-login", body: Data(body.utf8)))
        _ = try? await sut.client.send(HTTPRequest(method: .post, path: "/auth/social-login", body: Data(body.utf8)))
        try await sut.client.uploadToPresignedURL(URL(string: "https://b.test/k.webp?X-Amz-Signature=SIGSECRET&X-Amz-Credential=CREDSECRET")!, data: Data([1]), contentType: "image/webp")
        let lines = sut.logger.lines
        #expect(!lines.isEmpty)
        let joined = lines.joined(separator: "\n")
        for s in secrets where s != "secret-idtoken-CCC" {
            #expect(!joined.contains(s), "\(s) 노출")
        }
        // 서버 message에 들어온 값은 서버가 만든 문구이므로 여기서는 요청·응답 토큰 필드만 검증한다.
    }

    @Test("TC-NET-055 전송 오류는 케이스명만 로그에 남고 .other의 내용(URL·서명)은 남지 않는다")
    func transportErrorLogOmitsPayload() async throws {
        let sut = try SUT(script: [.fail(.other("https://s3.test/x?X-Amz-Signature=abc&token=zzz"))])
        await #expect(throws: APIError.network) { try await sut.client.send(HTTPRequest(method: .post, path: "/feedbacks")) }
        let joined = sut.logger.lines.joined(separator: "\n")
        #expect(joined.contains("other"))
        for leaked in ["Signature", "abc", "zzz", "s3.test/x"] { #expect(!joined.contains(leaked), "\(leaked) 노출") }
    }

    @Test("TC-NET-055 전송 오류 케이스명은 그대로 로그에 남는다", arguments: [
        (TransportError.timeout, "timeout"), (.notConnected, "notConnected"), (.dnsFailure, "dnsFailure"), (.tls, "tls"),
    ])
    func transportErrorCaseName(error: TransportError, name: String) async throws {
        let sut = try SUT(script: [.fail(error)])
        _ = try? await sut.client.send(HTTPRequest(method: .post, path: "/feedbacks"))
        #expect(sut.logger.lines.joined(separator: "\n").contains(name))
    }

    @Test("TC-NET-055 성공 응답 본문은 로그에 남지 않고, 오류 응답은 errorCode·message만 남는다")
    func responseBodyLogging() async throws {
        let ok = HTTPResponse.json(200, #"{"id":"x","nickname":"OKBODY-SECRET","accessToken":"TOK-OK"}"#)
        let bad = HTTPResponse.json(400, #"{"errorCode":"BUSINESS_ERROR","message":"이미 처리됨","extra":"EXTRA-SECRET","accessToken":"TOK-BAD"}"#)
        let html = HTTPResponse(status: 502, headers: ["Content-Type": "text/html"], body: Data("<html>HTML-SECRET</html>".utf8))
        let sut = try SUT(script: [.response(ok), .response(bad), .response(html)])
        _ = try await sut.client.send(HTTPRequest(method: .post, path: "/a"))
        _ = try? await sut.client.send(HTTPRequest(method: .post, path: "/b"))
        _ = try? await sut.client.send(HTTPRequest(method: .post, path: "/c"))
        let joined = sut.logger.lines.joined(separator: "\n")
        for leaked in ["OKBODY-SECRET", "TOK-OK", "EXTRA-SECRET", "TOK-BAD", "HTML-SECRET"] { #expect(!joined.contains(leaked), "\(leaked) 노출") }
        #expect(joined.contains("BUSINESS_ERROR"))
        #expect(joined.contains("이미 처리됨"))
        #expect(joined.contains("502"))
    }

    @Test("TC-NET-055 민감 키는 대소문자·밑줄·하이픈과 무관하게 가려지고 중첩·배열 안도 가려진다", arguments: [
        "accessToken", "access_token", "ACCESS_TOKEN", "AccessToken", "refresh_token", "id_token", "idToken", "rawNonce", "raw_nonce",
        "fcmToken", "fcm_token", "signupToken", "signup_token", "authorizationCode", "authorization_code", "Authorization-Code",
    ])
    func redactorKeyNormalization(key: String) {
        let json = #"{"\#(key)":"SECRET-1","nested":{"list":[{"\#(key)":"SECRET-2"}]},"nickname":"keep"}"#
        let out = LogRedactor.redactedBody(Data(json.utf8))
        #expect(!out.contains("SECRET"), "\(key): \(out)")
        #expect(out.contains("keep"))
    }

    @Test("TC-NET-055 민감하지 않은 키는 값이 남는다")
    func redactorKeepsOthers() {
        let out = LogRedactor.redactedBody(Data(#"{"tokenCount":3,"authorName":"kim","nonceless":"yes"}"#.utf8))
        #expect(out.contains("kim") && out.contains("yes") && out.contains("3"))
    }

    @Test("TC-NET-055 LogRedactor가 본문 민감 필드 값을 가린다")
    func redactorBody() {
        let json = #"{"accessToken":"A1","refreshToken":"R1","idToken":"I1","rawNonce":"N1","fcmToken":"F1","signupToken":"S1","nickname":"keep"}"#
        let out = LogRedactor.redactedBody(Data(json.utf8))
        for s in ["A1", "R1", "I1", "N1", "F1", "S1"] { #expect(!out.contains("\"\(s)\"")) }
        #expect(out.contains("keep"))
        _ = LogRedactor.redactedBody(Data("<html>not json</html>".utf8)) // 크래시 없음
    }

    @Test("TC-NET-055 LogRedactor가 URL 쿼리 문자열을 제거한다")
    func redactorURL() {
        let out = LogRedactor.redactedURL(URL(string: "https://b.test/k.webp?X-Amz-Signature=SIG&X=1")!)
        #expect(out == "https://b.test/k.webp")
    }

    @Test("TC-NET-058 모든 요청이 구성된 base URL로만 나가고 다른 호스트 폴백이 없다")
    func onlyConfiguredBase() async throws {
        let sut = try SUT(
            session: makeSession(),
            transport: FakeTransport(handler: tokenServer()),
            origin: "https://mock.test"
        )
        for p in ["/posts", "posts", "/topics", "/notifications"] { _ = try await sut.client.send(get(p)) }
        let reqs = await sut.transport.requests
        #expect(!reqs.isEmpty)
        for r in reqs {
            #expect(r.url.host == "mock.test")
            #expect(r.url.absoluteString.hasPrefix("https://mock.test/api/v1/"))
            #expect(r.url.absoluteString.contains("chalkak") == false)
        }
        #expect(reqs.contains { $0.isRefresh })
        #expect(reqs.first?.url.absoluteString == "https://mock.test/api/v1/posts")
    }

    @Test("TC-NET-058 mock 서버(localhost) 구성도 그 주소로만 나간다")
    func mockLocalhost() async throws {
        let sut = try SUT(transport: FakeTransport(script: [.response(.ok)]), origin: "http://localhost:4010", allowInsecureLoopback: true)
        _ = try await sut.client.send(get("/topics"))
        #expect(await sut.transport.requests.first?.url.absoluteString == "http://localhost:4010/api/v1/topics")
    }
}

@Suite("NET 요청 세대 가드")
struct RequestGenerationTests {
    @Test("TC-NET-056 느린 요청 A가 빠른 요청 B보다 늦게 도착하면 A를 버린다")
    func staleResponseDropped() {
        var gen = RequestGeneration()
        let a = gen.begin()
        let b = gen.begin()
        #expect(gen.isCurrent(a) == false)
        #expect(gen.isCurrent(b) == true)
    }

    @Test("TC-NET-056 마지막 요청은 계속 유효하다")
    func latestStaysValid() {
        var gen = RequestGeneration()
        let a = gen.begin()
        #expect(gen.isCurrent(a))
        #expect(gen.isCurrent(a))
    }

    @Test("TC-NET-057 계정 전환(invalidateAll) 뒤에는 이전 계정의 모든 응답이 무효이고 새 요청은 유효하다")
    func accountSwitchInvalidates() {
        var gen = RequestGeneration()
        let a1 = gen.begin()
        let a2 = gen.begin()
        gen.invalidateAll()
        #expect(gen.isCurrent(a1) == false)
        #expect(gen.isCurrent(a2) == false)
        let b = gen.begin()
        #expect(gen.isCurrent(b))
    }

    @Test("TC-NET-057 invalidateAll 직후 begin 없이도 어떤 이전 토큰도 유효하지 않다")
    func invalidateWithoutNewRequest() {
        var gen = RequestGeneration()
        let a = gen.begin()
        gen.invalidateAll()
        #expect(gen.isCurrent(a) == false)
    }
}
