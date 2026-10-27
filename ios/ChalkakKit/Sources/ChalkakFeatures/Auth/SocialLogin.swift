import Foundation
import ChalkakData

/// 카카오 SDK 호출 결과. `idToken`이 nil이면 SDK 설정 오류로 본다(REQ-AUTH-008).
public struct KakaoCredential: Sendable, Equatable, RedactedDescription {
    public let idToken: String?
    public init(idToken: String?) { self.idToken = idToken }
}

public enum SocialLoginError: Error, Sendable, Equatable {
    /// 사용자가 인증을 닫았다. 오류 문구를 보이지 않는다.
    case cancelled
    /// 카카오 설정 누락 등. `auth.login.error.config`.
    case configuration
    /// 그 밖의 SDK 실패. `auth.login.error.kakao-failed`.
    case failed
}

/// 로그인 화면이 아는 소셜 로그인 경계. 앱 타깃은 `KakaoLoginFlow(gateway:)`를 꽂는다.
public protocol SocialLoginClient: Sendable {
    /// SDK에는 해시된 nonce만 전달한다. 취소는 `SocialLoginError.cancelled`(또는 `CancellationError`).
    func authenticate(hashedNonce: String) async throws -> KakaoCredential
}

/// 카카오 SDK 호출 한 겹. 앱 타깃이 KakaoSDK로 구현한다.
public protocol KakaoSDKGateway: Sendable {
    /// 카카오톡 앱 로그인 가능 여부. 확인 실패는 false.
    func isTalkLoginAvailable() async -> Bool
    func loginWithTalk(hashedNonce: String) async throws -> String?
    func loginWithAccount(hashedNonce: String) async throws -> String?
}

/// 톡 로그인 우선, 취소가 아닌 실패면 계정 로그인으로 폴백(REQ-AUTH-005/006).
public struct KakaoLoginFlow: SocialLoginClient {
    private let gateway: any KakaoSDKGateway

    public init(gateway: any KakaoSDKGateway) { self.gateway = gateway }

    public func authenticate(hashedNonce: String) async throws -> KakaoCredential {
        if await gateway.isTalkLoginAvailable() {
            do {
                return KakaoCredential(idToken: try await gateway.loginWithTalk(hashedNonce: hashedNonce))
            } catch where Self.isUserCancellation(error) {
                throw error
            } catch {
                try Task.checkCancellation()
            }
        }
        return KakaoCredential(idToken: try await gateway.loginWithAccount(hashedNonce: hashedNonce))
    }

    private static func isUserCancellation(_ error: any Error) -> Bool {
        error.isCancellation || (error as? SocialLoginError) == .cancelled
    }
}
