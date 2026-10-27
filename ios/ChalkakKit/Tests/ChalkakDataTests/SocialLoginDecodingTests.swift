import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
@testable import ChalkakData

@Suite("AUTH social-login DTO")
struct SocialLoginDecodingTests {
    private func decode(_ json: String) throws -> SocialLoginResponse {
        try APIJSON.makeDecoder().decode(SocialLoginResponse.self, from: Data(json.utf8))
    }

    @Test("TC-AUTH-005 요청 본문은 provider·idToken·rawNonce뿐이고 authorizationCode 키가 없다")
    func requestBodyShape() throws {
        let data = try APIJSON.makeEncoder().encode(SocialLoginRequest(idToken: "ID", rawNonce: "RAW"))
        let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        #expect(Set(object.keys) == ["provider", "idToken", "rawNonce"])
        #expect(object["provider"] as? String == "KAKAO")
        #expect(object["idToken"] as? String == "ID")
        #expect(object["rawNonce"] as? String == "RAW")
    }

    @Test("TC-AUTH-011 알 수 없는 status는 디코딩 실패")
    func unknownStatus() {
        #expect(throws: (any Error).self) { try decode(#"{"status":"SOMETHING_NEW"}"#) }
    }

    @Test("TC-AUTH-012 LOGIN_SUCCESS인데 토큰·userId가 빠지면 디코딩 실패", arguments: [
        #"{"status":"LOGIN_SUCCESS","userId":"u1","expiresIn":900,"refreshToken":"r","refreshTokenExpiresIn":1}"#,
        #"{"status":"LOGIN_SUCCESS","userId":"u1","accessToken":"a","expiresIn":900,"refreshTokenExpiresIn":1}"#,
        #"{"status":"LOGIN_SUCCESS","accessToken":"a","expiresIn":900,"refreshToken":"r","refreshTokenExpiresIn":1}"#,
        #"{"status":"LOGIN_SUCCESS","userId":"u1","accessToken":"a","refreshToken":"r"}"#,
    ])
    func missingFields(json: String) {
        #expect(throws: (any Error).self) { try decode(json) }
    }

    @Test("TC-AUTH-007 만료 시각은 받은 시각 + 응답 초 값(900, 2592000)이다")
    func absoluteExpiry() {
        let tokens = LoginTokens(userId: "u1", accessToken: "a", expiresIn: 900, refreshToken: "r", refreshTokenExpiresIn: 2_592_000)
        let session = tokens.makeSession(now: t0)
        #expect(session.userId == "u1")
        #expect(session.accessToken == "a")
        #expect(session.refreshToken == "r")
        #expect(session.accessTokenExpiresAt == t0.addingTimeInterval(900))
        #expect(session.refreshTokenExpiresAt == t0.addingTimeInterval(2_592_000))
    }

    @Test("TC-AUTH-007 수명 값이 달라지면 만료 시각도 따라간다(하드코딩 아님)")
    func expiryIsNotHardCoded() {
        let session = LoginTokens(userId: "u", accessToken: "a", expiresIn: 60, refreshToken: "r", refreshTokenExpiresIn: 120).makeSession(now: t0)
        #expect(session.accessTokenExpiresAt == t0.addingTimeInterval(60))
        #expect(session.refreshTokenExpiresAt == t0.addingTimeInterval(120))
    }
}
