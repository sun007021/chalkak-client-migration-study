import Foundation

public struct AuthSession: Sendable, Equatable {
    public var userId: String
    public var accessToken: String
    public var accessTokenExpiresAt: Date
    public var refreshToken: String
    public var refreshTokenExpiresAt: Date
    public init(userId: String, accessToken: String, accessTokenExpiresAt: Date, refreshToken: String, refreshTokenExpiresAt: Date) {
        self.userId = userId
        self.accessToken = accessToken
        self.accessTokenExpiresAt = accessTokenExpiresAt
        self.refreshToken = refreshToken
        self.refreshTokenExpiresAt = refreshTokenExpiresAt
    }
    public func isAccessTokenExpired(at now: Date) -> Bool { now >= accessTokenExpiresAt }
}

/// 토큰 영속화. 앱 타깃이 Keychain으로 구현한다. 비교-교체는 원자적이어야 한다.
public protocol SessionStore: Sendable {
    func currentSession() async -> AuthSession?
    /// 로그인·가입 직후 저장(무조건 덮어씀).
    func save(_ session: AuthSession) async
    /// 현재 세션이 `expected`와 같은 계정(userId)·같은 refreshToken일 때만 `refreshed`로 교체한다. 교체했으면 true.
    func replaceTokens(of expected: AuthSession, with refreshed: AuthSession) async -> Bool
    /// 현재 세션이 `expected`와 같을 때만 지운다. 지웠으면 true.
    func clearSession(ifMatching expected: AuthSession) async -> Bool
    /// 로그아웃·탈퇴: 무조건 지운다.
    func clearSession() async
}

public protocol AuthEvents: Sendable {
    /// 세션이 지워졌고 로그인 화면으로 가야 할 때 한 번 호출된다.
    /// 계약: 즉시 반환해야 한다. 갱신 흐름이 이 호출을 기다리므로 화면 전환 등 오래 걸리는 일은 구현 쪽에서 비동기로 넘기고 바로 돌아온다.
    func reauthenticationRequired() async
}
