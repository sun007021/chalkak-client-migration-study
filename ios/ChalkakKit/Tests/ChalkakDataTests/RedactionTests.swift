import Foundation
import Testing
@testable import ChalkakData

@Suite("AUTH 비밀값 문자열화 차단")
struct RedactionTests {
    private func assertRedacted(_ value: Any, secrets: [String]) {
        for text in ["\(value)", String(describing: value), String(reflecting: value)] {
            for secret in secrets { #expect(!text.contains(secret)) }
            #expect(text.contains("<redacted>"))
        }
    }

    @Test("TC-AUTH-005 SocialLoginRequest는 문자열화해도 idToken·rawNonce가 새지 않는다")
    func requestRedacted() {
        assertRedacted(SocialLoginRequest(idToken: "SECRET-ID", rawNonce: "SECRET-NONCE"), secrets: ["SECRET-ID", "SECRET-NONCE"])
    }

    @Test("TC-AUTH-007 LoginTokens는 문자열화해도 토큰이 새지 않는다")
    func tokensRedacted() {
        let tokens = LoginTokens(userId: "u", accessToken: "SECRET-AT", expiresIn: 1, refreshToken: "SECRET-RT", refreshTokenExpiresIn: 2)
        assertRedacted(tokens, secrets: ["SECRET-AT", "SECRET-RT"])
    }

    @Test("TC-AUTH-007 LOGIN_SUCCESS 응답 enum도 토큰이 새지 않는다")
    func responseRedacted() {
        let tokens = LoginTokens(userId: "u", accessToken: "SECRET-AT", expiresIn: 1, refreshToken: "SECRET-RT", refreshTokenExpiresIn: 2)
        assertRedacted(SocialLoginResponse.loginSuccess(tokens), secrets: ["SECRET-AT", "SECRET-RT"])
    }
}
