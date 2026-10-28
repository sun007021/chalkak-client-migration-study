import Foundation
import ChalkakCore
import ChalkakNetwork

/// 로그인 시도 결과. 토큰은 저장소에만 두고 호출자에게 노출하지 않는다.
public enum SocialLoginOutcome: Sendable, Equatable {
    case loggedIn(userId: String)
    case signUpRequired
}

/// 게스트 플래그 영속화(앱 타깃이 Keychain/UserDefaults로 구현). 앱을 다시 켜도 유지된다.
public protocol GuestFlagStore: Sendable {
    func isGuest() async -> Bool
    /// 저장 실패 시 throw(REQ-AUTH-020).
    func setGuest(_ isGuest: Bool) async throws
}

/// 로그아웃·탈퇴·계정 전환 때 비워야 하는 사용자 캐시(홈, 기록, 알림, 좋아요, 미읽음, 사인, 푸시 설정, 푸시 대기 이동, 푸시 등록 중복 제거 캐시).
public protocol UserCacheClearing: Sendable {
    func clearUserCaches() async
}

/// 여러 기능이 등록한 캐시 정리기를 모두 호출한다.
public struct CompositeUserCacheClearer: UserCacheClearing {
    private let clearers: [any UserCacheClearing]
    public init(_ clearers: [any UserCacheClearing]) { self.clearers = clearers }
    public func clearUserCaches() async {
        for clearer in clearers { await clearer.clearUserCaches() }
    }
}

/// 로컬 로그아웃 뒤 서버에 알려야 하는 refresh token. 문자열화에 값이 새지 않는다.
public struct PendingServerLogout: Sendable, Equatable, RedactedDescription {
    let refreshToken: String
    public init(refreshToken: String) { self.refreshToken = refreshToken }
}

public protocol AuthRepository: Sendable {
    /// `POST /auth/social-login`(anonymous, 재시도 없음). LOGIN_SUCCESS면 세션 저장 + 게스트 플래그 제거(이전 계정과 userId가 다르면 사용자 캐시도 비움).
    /// 취소된 뒤 도착한 응답은 저장하지 않고 `CancellationError`를 던진다. 해석 불가 응답은 `APIError.invalidResponse`.
    func socialLogin(idToken: String, rawNonce: String) async throws -> SocialLoginOutcome
    /// 로컬(토큰, 사용자 캐시, 게스트 플래그)을 지우고 서버에 보낼 로그아웃 요청을 돌려준다. 서버 호출은 하지 않는다(즉시 반환). 세션이 없으면 nil.
    func logoutLocally() async -> PendingServerLogout?
    /// `POST /auth/logout {refreshToken}`(anonymous, 재시도 없음). 실패는 무시한다. 호출자 취소와 무관하게 별도 작업에서 부르는 것이 전제다.
    func sendLogout(_ pending: PendingServerLogout) async
    /// `DELETE /users/me`. 204일 때만 로컬 세션·캐시를 지운다. 그 외에는 `APIError` 등을 던지고 세션을 유지한다.
    func withdraw() async throws
    /// 서버 호출 없이 저장된 자격 증명을 지우고 게스트 플래그를 저장한다. 플래그 저장 실패 시 throw.
    func enterGuestMode() async throws
    /// 게스트 플래그만 지운다(설정의 "로그인" 버튼).
    func exitGuestMode() async throws
}

extension AuthRepository {
    /// 로컬 정리 뒤 서버 호출까지 이어서 기다린다(화면 흐름이 아닌 호출자용).
    public func logout() async {
        if let pending = await logoutLocally() { await sendLogout(pending) }
    }
}

public struct APIAuthRepository: AuthRepository {
    private let client: APIClient
    private let sessionStore: any SessionStore
    private let guestFlags: any GuestFlagStore
    private let userCaches: any UserCacheClearing
    private let clock: any AppClock

    public init(
        client: APIClient,
        sessionStore: any SessionStore,
        guestFlags: any GuestFlagStore,
        userCaches: any UserCacheClearing,
        clock: any AppClock
    ) {
        self.client = client
        self.sessionStore = sessionStore
        self.guestFlags = guestFlags
        self.userCaches = userCaches
        self.clock = clock
    }

    public func socialLogin(idToken: String, rawNonce: String) async throws -> SocialLoginOutcome {
        let previousUserId = await sessionStore.currentSession()?.userId
        let body = try APIJSON.makeEncoder().encode(SocialLoginRequest(idToken: idToken, rawNonce: rawNonce))
        let request = HTTPRequest(method: .post, path: "auth/social-login", body: body, authPolicy: .anonymous, retryPolicy: RetryPolicy.none)
        let response = try await client.send(request, as: SocialLoginResponse.self)
        // 응답이 취소 뒤에 도착했으면 저장하지 않는다(화면 이탈·계정 전환).
        try Task.checkCancellation()
        switch response {
        case .signUpRequired:
            return .signUpRequired
        case .loginSuccess(let tokens):
            // 여기부터는 취소와 무관하게 끝까지 마친다(저장이 시작된 로그인은 되돌리지 않는다).
            if let previousUserId, previousUserId != tokens.userId { await userCaches.clearUserCaches() }
            await sessionStore.save(tokens.makeSession(now: clock.now))
            // 인증 세션이 게스트 플래그보다 우선이므로(REQ-BOOT-016) 지우기 실패가 로그인 성공을 막지 않는다.
            try? await guestFlags.setGuest(false)
            return .loggedIn(userId: tokens.userId)
        }
    }

    public func logoutLocally() async -> PendingServerLogout? {
        let session = await sessionStore.currentSession()
        await sessionStore.clearSession()
        await userCaches.clearUserCaches()
        // 게스트 플래그가 남아 있으면 재시작 때 게스트로 열리므로 best-effort로 지운다(실패해도 SessionResolver가 치유한다).
        try? await guestFlags.setGuest(false)
        guard let session, !session.refreshToken.isEmpty else { return nil }
        return PendingServerLogout(refreshToken: session.refreshToken)
    }

    public func sendLogout(_ pending: PendingServerLogout) async {
        guard let body = try? APIJSON.makeEncoder().encode(LogoutRequest(refreshToken: pending.refreshToken)) else { return }
        let request = HTTPRequest(method: .post, path: "auth/logout", body: body, authPolicy: .anonymous, retryPolicy: RetryPolicy.none)
        try? await client.sendEmpty(request)
    }

    public func withdraw() async throws {
        try await client.sendEmpty(HTTPRequest(method: .delete, path: "users/me"))
        // 204가 도착했다면 이후 취소돼도 로컬 정리는 끝까지 한다(서버에서는 이미 탈퇴).
        await sessionStore.clearSession()
        await userCaches.clearUserCaches()
        try? await guestFlags.setGuest(false)
    }

    public func enterGuestMode() async throws {
        try await guestFlags.setGuest(true)
        await sessionStore.clearSession()
    }

    public func exitGuestMode() async throws {
        try await guestFlags.setGuest(false)
    }
}

private struct LogoutRequest: Encodable {
    let refreshToken: String
}
