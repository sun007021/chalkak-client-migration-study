import Foundation
import KakaoSDKAuth
import KakaoSDKCommon
import KakaoSDKUser
import ChalkakFeatures

/// Kakao iOS SDK로 구현한 `KakaoSDKGateway`(OIDC idToken을 해시 nonce와 함께 요청).
/// `isConfigured == false`(앱 키 없음, SDK 미초기화)면 SDK를 건드리지 않고 `SocialLoginError.configuration`을 던진다.
/// SDK 미초기화 상태에서 호출하면 SDK가 크래시하기 때문이다.
struct KakaoSDKGatewayImpl: KakaoSDKGateway {
    let isConfigured: Bool

    func isTalkLoginAvailable() async -> Bool {
        guard isConfigured else { return false }
        return await Self.talkAvailable()
    }

    func loginWithTalk(hashedNonce: String) async throws -> String? {
        guard isConfigured else { throw SocialLoginError.configuration }
        return try await Self.login(useTalk: true, hashedNonce: hashedNonce)
    }

    func loginWithAccount(hashedNonce: String) async throws -> String? {
        guard isConfigured else { throw SocialLoginError.configuration }
        return try await Self.login(useTalk: false, hashedNonce: hashedNonce)
    }

    @MainActor
    private static func talkAvailable() -> Bool {
        UserApi.isKakaoTalkLoginAvailable()
    }

    @MainActor
    private static func login(useTalk: Bool, hashedNonce: String) async throws -> String? {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String?, any Error>) in
            let completion: @Sendable (OAuthToken?, (any Error)?) -> Void = { token, error in
                if let error {
                    continuation.resume(throwing: Self.mapError(error))
                } else {
                    continuation.resume(returning: token?.idToken)
                }
            }
            if useTalk {
                UserApi.shared.loginWithKakaoTalk(nonce: hashedNonce, completion: completion)
            } else {
                UserApi.shared.loginWithKakaoAccount(nonce: hashedNonce, completion: completion)
            }
        }
    }

    /// SDK의 사용자 취소만 `.cancelled`로, 나머지는 `.failed`로 옮긴다.
    private static func mapError(_ error: any Error) -> SocialLoginError {
        if let sdkError = error as? SdkError, case .ClientFailed(.Cancelled, _) = sdkError {
            return .cancelled
        }
        return .failed
    }
}

/// 앱 시작 시 SDK를 초기화하고, 카카오톡 앱에서 돌아오는 URL을 SDK에 넘긴다.
enum KakaoSDKBootstrap {
    /// 키가 비어 있으면 초기화하지 않고 false.
    @discardableResult
    static func initialize(appKey: String?) -> Bool {
        guard let appKey, !appKey.isEmpty else { return false }
        KakaoSDK.initSDK(appKey: appKey)
        return true
    }

    @MainActor
    static func handleOpenURL(_ url: URL) {
        if AuthApi.isKakaoTalkLoginUrl(url) {
            _ = AuthController.handleOpenUrl(url: url)
        }
    }
}
