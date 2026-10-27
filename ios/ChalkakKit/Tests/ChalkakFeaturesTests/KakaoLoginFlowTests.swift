import Foundation
import Testing
@testable import ChalkakFeatures

@Suite("AUTH 카카오 로그인 흐름(톡 우선, 계정 폴백)")
struct KakaoLoginFlowTests {
    @Test("TC-AUTH-014 톡 로그인이 가능하면 톡 로그인을 먼저 쓰고 계정 로그인은 부르지 않는다")
    func talkFirst() async throws {
        let gateway = FakeKakaoGateway(talkAvailable: true)
        let credential = try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        #expect(credential == KakaoCredential(idToken: "TALK-ID"))
        #expect(await gateway.calls == ["talk:H"])
    }

    @Test("TC-AUTH-015 톡 로그인이 취소가 아닌 이유로 실패하면 계정 로그인으로 폴백한다", arguments: [
        SocialLoginError.failed, .configuration,
    ])
    func fallbackOnFailure(error: SocialLoginError) async throws {
        let gateway = FakeKakaoGateway(talkResult: .failure(error))
        let credential = try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        #expect(credential == KakaoCredential(idToken: "ACCOUNT-ID"))
        #expect(await gateway.calls == ["talk:H", "account:H"])
    }

    @Test("TC-AUTH-015 알 수 없는 오류로 톡 로그인이 실패해도 폴백한다")
    func fallbackOnUnknownError() async throws {
        struct Boom: Error {}
        let gateway = FakeKakaoGateway(talkResult: .failure(Boom()))
        let credential = try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        #expect(credential.idToken == "ACCOUNT-ID")
    }

    @Test("TC-AUTH-016 톡 로그인에서 사용자가 취소하면 계정 로그인으로 폴백하지 않고 취소를 던진다")
    func noFallbackOnCancel() async {
        let gateway = FakeKakaoGateway(talkResult: .failure(SocialLoginError.cancelled))
        await #expect(throws: SocialLoginError.cancelled) {
            try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        }
        #expect(await gateway.calls == ["talk:H"])
    }

    @Test("TC-AUTH-017 톡이 없거나 가용성 확인에 실패하면 계정 로그인을 쓴다")
    func accountWhenTalkUnavailable() async throws {
        let gateway = FakeKakaoGateway(talkAvailable: false)
        let credential = try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        #expect(credential.idToken == "ACCOUNT-ID")
        #expect(await gateway.calls == ["account:H"])
    }

    @Test("TC-AUTH-016 계정 로그인 취소는 그대로 취소로 전달한다")
    func accountCancel() async {
        let gateway = FakeKakaoGateway(talkAvailable: false, accountResult: .failure(SocialLoginError.cancelled))
        await #expect(throws: SocialLoginError.cancelled) {
            try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        }
    }

    @Test("TC-AUTH-019 폴백한 계정 로그인도 실패하면 그 오류를 던진다")
    func accountFailureSurfaces() async {
        let gateway = FakeKakaoGateway(talkResult: .failure(SocialLoginError.failed), accountResult: .failure(SocialLoginError.failed))
        await #expect(throws: SocialLoginError.failed) {
            try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        }
    }

    @Test("TC-AUTH-018 SDK가 idToken 없이 성공하면 nil idToken 그대로 전달한다(판단은 ViewModel)")
    func nilIdTokenPassesThrough() async throws {
        let gateway = FakeKakaoGateway(talkResult: .success(nil))
        let credential = try await KakaoLoginFlow(gateway: gateway).authenticate(hashedNonce: "H")
        #expect(credential.idToken == nil)
        #expect(await gateway.calls == ["talk:H"])
    }
}
