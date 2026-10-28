import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport
@testable import ChalkakData

/// 공용 fixture(`shared/fixtures/auth/`)로 응답 모양을 검증하는 C 테스트. 인라인 JSON 대신 서버·다른 플랫폼과 같은 파일을 쓴다.
@Suite("AUTH 공용 fixture")
struct AuthFixtureTests {
    private func decode(_ name: String) throws -> SocialLoginResponse {
        try Fixture.load(name).decode(SocialLoginResponse.self, using: APIJSON.makeDecoder())
    }

    @Test("TC-AUTH-006 social-login__login-success: userId와 토큰 4종")
    func loginSuccessFixture() throws {
        let response = try decode("auth/social-login__login-success.json")
        #expect(response == .loginSuccess(LoginTokens(
            userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            accessToken: "fixture-access-token-1",
            expiresIn: 900,
            refreshToken: "fixture-refresh-token-1",
            refreshTokenExpiresIn: 2_592_000
        )))
    }

    @Test("TC-AUTH-007 social-login__login-success: 만료 시각은 받은 시각 + 응답 초")
    func loginSuccessExpiry() async throws {
        let sut = try AuthSUT(session: nil) { _, _ in try .fixture("auth/social-login__login-success.json") }
        _ = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        let saved = try #require(await sut.store.currentSession())
        #expect(saved.accessTokenExpiresAt == t0.addingTimeInterval(900))
        #expect(saved.refreshTokenExpiresAt == t0.addingTimeInterval(2_592_000))
    }

    @Test("TC-AUTH-009 social-login__sign-up-required: status만 있어도 오류가 아니다")
    func signUpRequiredFixture() throws {
        #expect(try decode("auth/social-login__sign-up-required.json") == .signUpRequired)
    }

    @Test("TC-AUTH-010 social-login__sign-up-required: 토큰을 저장하지 않는다")
    func signUpRequiredDoesNotSave() async throws {
        let sut = try AuthSUT(session: nil) { _, _ in try .fixture("auth/social-login__sign-up-required.json") }
        #expect(try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW") == .signUpRequired)
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-AUTH-011 social-login__unknown-status: 디코딩 실패 → invalidResponse, 저장 없음")
    func unknownStatusFixture() async throws {
        #expect(throws: (any Error).self) { try decode("auth/social-login__unknown-status.json") }
        let sut = try AuthSUT(session: nil) { _, _ in try .fixture("auth/social-login__unknown-status.json") }
        await #expect(throws: APIError.invalidResponse) { try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW") }
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-AUTH-012 social-login__login-success-missing-token: 디코딩 실패 → invalidResponse, 저장 없음")
    func missingTokenFixture() async throws {
        #expect(throws: (any Error).self) { try decode("auth/social-login__login-success-missing-token.json") }
        let sut = try AuthSUT(session: nil) { _, _ in try .fixture("auth/social-login__login-success-missing-token.json") }
        await #expect(throws: APIError.invalidResponse) { try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW") }
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-AUTH-020 TC-AUTH-021 TC-AUTH-022 TC-AUTH-023 TC-AUTH-024 social-login 오류 fixture는 status·errorCode·message를 보존해 던진다", arguments: [
        ("auth/social-login__unauthorized.json", 401, ErrorCode.unauthorized),
        ("auth/social-login__forbidden-banned.json", 403, .forbidden),
        ("auth/social-login__forbidden-withdrawn-banned.json", 403, .forbidden),
        ("auth/social-login__bad-request-authcode.json", 400, .businessError),
        ("auth/social-login__internal-error.json", 500, .internalError),
    ])
    func errorFixtures(name: String, status: Int, code: ErrorCode) async throws {
        let fixture = try Fixture.load(name)
        let message = try #require(try fixture.object()["message"] as? String)
        let sut = try AuthSUT(session: makeSession()) { _, _ in try .fixture(name) }
        await #expect(throws: APIError.http(status: status, code: code, message: message)) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.transport.count == 1)
        #expect(await sut.transport.requests(path: "/auth/refresh").isEmpty)
    }

    @Test("TC-AUTH-037 logout__no-content: 204를 성공으로 읽고 요청은 POST /auth/logout 하나뿐")
    func logoutNoContent() async throws {
        let sut = try AuthSUT { _, _ in try .fixture("auth/logout__no-content.json") }
        await sut.repository.logout()
        #expect(await sut.transport.requests.map(\.apiPath) == ["/auth/logout"])
        #expect(await sut.store.currentSession() == nil)
    }

    @Test("TC-AUTH-036 logout__internal-error: 500도 무시하고 재시도 없이 1회")
    func logoutInternalError() async throws {
        let sut = try AuthSUT { _, _ in try .fixture("auth/logout__internal-error.json") }
        await sut.repository.logout()
        #expect(await sut.transport.requests(path: "/auth/logout").count == 1)
        #expect(await sut.store.currentSession() == nil)
    }

    @Test("TC-AUTH-043 TC-AUTH-046 users-me__delete-no-content: 204면 세션·캐시를 지운다")
    func withdrawNoContent() async throws {
        let sut = try AuthSUT { _, _ in try .fixture("auth/users-me__delete-no-content.json") }
        try await sut.repository.withdraw()
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.caches.count == 1)
    }

    @Test("TC-AUTH-047 탈퇴 성공 뒤에도 서버 호출은 DELETE /users/me 하나뿐이다(카카오 unlink는 앱 경계에 없다)")
    func withdrawMakesNoOtherCalls() async throws {
        let sut = try AuthSUT { _, _ in try .fixture("auth/users-me__delete-no-content.json") }
        try await sut.repository.withdraw()
        #expect(await sut.transport.requests.map(\.apiPath) == ["/users/me"])
    }

    @Test("TC-AUTH-044 users-me__delete-internal-error: 던지고 세션·캐시를 유지한다")
    func withdrawInternalError() async throws {
        let sut = try AuthSUT { _, _ in try .fixture("auth/users-me__delete-internal-error.json") }
        await #expect(throws: APIError.self) { try await sut.repository.withdraw() }
        #expect(await sut.store.currentSession() != nil)
        #expect(await sut.caches.count == 0)
    }

    @Test("TC-AUTH-045 users-me__delete-unauthorized + refresh__success: 갱신 후 원 요청 1회 재전송")
    func withdrawUnauthorizedThenRefresh() async throws {
        let refreshed = try Fixture.load("auth/refresh__success.json").decode([String: AnyDecodableString].self)
        let newAccess = try #require(refreshed["accessToken"]?.value)
        let sut = try AuthSUT { request, _ in
            if request.apiPath == "/auth/refresh" { return try .fixture("auth/refresh__success.json") }
            return request.header("Authorization") == "Bearer \(newAccess)" ? .noContent : try .fixture("auth/users-me__delete-unauthorized.json")
        }
        try await sut.repository.withdraw()
        #expect(await sut.transport.requests.map(\.apiPath) == ["/users/me", "/auth/refresh", "/users/me"])
    }

    @Test("TC-AUTH-051 refresh__reauthentication-required: 세션이 지워지고 이벤트 1회")
    func reauthenticationFixture() async throws {
        let sut = try AuthSUT { request, _ in
            request.apiPath == "/auth/refresh" ? try .fixture("auth/refresh__reauthentication-required.json") : try .fixture("auth/users-me__delete-unauthorized.json")
        }
        await #expect(throws: APIError.self) { try await sut.repository.withdraw() }
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.events.count == 1)
    }
}

/// fixture의 숫자·문자 혼합 객체에서 문자열 값만 읽는다.
private struct AnyDecodableString: Decodable {
    let value: String?
    init(from decoder: any Decoder) throws {
        value = try? decoder.singleValueContainer().decode(String.self)
    }
}
