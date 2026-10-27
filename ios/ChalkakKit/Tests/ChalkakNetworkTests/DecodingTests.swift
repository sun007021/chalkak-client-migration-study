import Foundation
import Testing
@testable import ChalkakNetwork

@Suite("NET 응답 디코딩(인라인 바이트)")
struct DecodingTests {
    private func decode(_ response: HTTPResponse) async throws -> Sample {
        let sut = try SUT(script: [.response(response)])
        return try await sut.client.send(get("/x"), as: Sample.self)
    }

    @Test("TC-NET-005 200인데 JSON이 깨지면 invalidResponse")
    func malformedJSON() async throws {
        await #expect(throws: APIError.invalidResponse) { try await decode(.json(200, #"{"id": "#)) }
    }

    @Test("TC-NET-006 본문이 필요한 API가 200 빈 본문이면 invalidResponse")
    func emptyBody() async throws {
        await #expect(throws: APIError.invalidResponse) { try await decode(.json(200, "")) }
    }

    @Test("TC-NET-007 204는 성공이고 본문 디코딩을 시도하지 않는다")
    func noContent() async throws {
        let sut = try SUT(script: [.response(.noContent), .response(HTTPResponse(status: 204, body: Data("garbage".utf8)))])
        try await sut.client.sendEmpty(HTTPRequest(method: .post, path: "/auth/logout", body: Data(#"{"refreshToken":"r"}"#.utf8), authPolicy: .anonymous))
        try await sut.client.sendEmpty(HTTPRequest(method: .delete, path: "/users/me"))
    }

    @Test("TC-NET-008 알 수 없는 JSON 필드는 무시한다")
    func extraFields() async throws {
        let s = try await decode(.json(200, #"{"id":"a","nickname":"n","brandNew":{"x":1},"list":[1,2]}"#))
        #expect(s == Sample(id: "a", nickname: "n"))
    }

    @Test("TC-NET-010 필수 필드 누락은 invalidResponse")
    func missingRequired() async throws {
        await #expect(throws: APIError.invalidResponse) { try await decode(.json(200, #"{"nickname":"n"}"#)) }
    }

    @Test("TC-NET-010 nullable 필드는 null·생략 모두 허용한다", arguments: [#"{"id":"a","nickname":null}"#, #"{"id":"a"}"#])
    func nullable(body: String) async throws {
        #expect(try await decode(.json(200, body)) == Sample(id: "a", nickname: nil))
    }

    @Test("TC-NET-011 Content-Type이 JSON이 아닌 200은 invalidResponse")
    func wrongContentType() async throws {
        await #expect(throws: APIError.invalidResponse) {
            try await decode(.json(200, #"{"id":"a"}"#, headers: ["Content-Type": "text/html"]))
        }
    }

    @Test("TC-NET-011 Content-Type 대소문자·charset 파라미터는 JSON으로 인정한다")
    func contentTypeVariants() async throws {
        let s = try await decode(.json(200, #"{"id":"a"}"#, headers: ["content-type": "Application/JSON; charset=utf-8"]))
        #expect(s.id == "a")
    }
}
