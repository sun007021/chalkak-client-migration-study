import Foundation
import ChalkakCore
import ChalkakNetwork

/// `POST /auth/social-login` 요청 본문. `authorizationCode` 키는 없다(카카오 전용).
public struct SocialLoginRequest: Encodable, Sendable, Equatable, RedactedDescription {
    public let provider: String
    public let idToken: String
    public let rawNonce: String
    public init(idToken: String, rawNonce: String) {
        self.provider = "KAKAO"
        self.idToken = idToken
        self.rawNonce = rawNonce
    }
}

/// `LOGIN_SUCCESS` 응답의 토큰 묶음. 만료는 초 단위 상대값이며 저장 시 절대 시각으로 바꾼다.
public struct LoginTokens: Sendable, Equatable, RedactedDescription {
    public let userId: String
    public let accessToken: String
    public let expiresIn: TimeInterval
    public let refreshToken: String
    public let refreshTokenExpiresIn: TimeInterval

    public init(userId: String, accessToken: String, expiresIn: TimeInterval, refreshToken: String, refreshTokenExpiresIn: TimeInterval) {
        self.userId = userId
        self.accessToken = accessToken
        self.expiresIn = expiresIn
        self.refreshToken = refreshToken
        self.refreshTokenExpiresIn = refreshTokenExpiresIn
    }

    /// 받은 시각 `now`에 초 값을 더한 절대 만료 시각으로 세션을 만든다(수명 하드코딩 금지).
    public func makeSession(now: Date) -> AuthSession {
        AuthSession(
            userId: userId,
            accessToken: accessToken,
            accessTokenExpiresAt: now.addingTimeInterval(expiresIn),
            refreshToken: refreshToken,
            refreshTokenExpiresAt: now.addingTimeInterval(refreshTokenExpiresIn)
        )
    }
}

/// `POST /auth/social-login` 응답. 알 수 없는 status, LOGIN_SUCCESS인데 필수 필드 누락이면 디코딩 실패(→ APIError.invalidResponse).
public enum SocialLoginResponse: Sendable, Equatable {
    case loginSuccess(LoginTokens)
    case signUpRequired
}

extension SocialLoginResponse: Decodable {
    private enum CodingKeys: String, CodingKey {
        case status, userId, accessToken, expiresIn, refreshToken, refreshTokenExpiresIn
    }

    private enum Status: String {
        case loginSuccess = "LOGIN_SUCCESS"
        case signUpRequired = "SIGN_UP_REQUIRED"
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let rawStatus = try container.decode(String.self, forKey: .status)
        guard let status = Status(rawValue: rawStatus) else {
            throw DecodingError.dataCorruptedError(forKey: .status, in: container, debugDescription: "알 수 없는 status")
        }
        switch status {
        case .signUpRequired:
            self = .signUpRequired
        case .loginSuccess:
            self = .loginSuccess(LoginTokens(
                userId: try container.decodeNonEmpty(.userId),
                accessToken: try container.decodeNonEmpty(.accessToken),
                expiresIn: try container.decode(TimeInterval.self, forKey: .expiresIn),
                refreshToken: try container.decodeNonEmpty(.refreshToken),
                refreshTokenExpiresIn: try container.decode(TimeInterval.self, forKey: .refreshTokenExpiresIn)
            ))
        }
    }
}

private extension KeyedDecodingContainer {
    /// 빈 문자열은 누락과 같게 본다(빈 토큰을 저장하면 이후 모든 요청이 실패한다).
    func decodeNonEmpty(_ key: Key) throws -> String {
        let value = try decode(String.self, forKey: key)
        guard !value.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: key, in: self, debugDescription: "빈 문자열")
        }
        return value
    }
}
