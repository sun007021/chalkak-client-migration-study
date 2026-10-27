import Foundation
import ChalkakCore
import ChalkakNetwork

/// 시작 시 인증 게이트 판정 결과.
public enum AuthGateResult: Sendable, Equatable {
    case authenticated(userId: String)
    case guest
    case signedOut
}

public protocol SessionResolving: Sendable {
    func resolve() async -> AuthGateResult
}

/// userId + 만료되지 않은 refresh token → authenticated(게스트 플래그 무관, access 만료 무관),
/// (이때 남아 있는 게스트 플래그는 지운다) 그 외 게스트 플래그 → guest, 없으면 signedOut. refresh 만료 시각 이하(`<= now`)는 만료로 보고 세션을 지운다.
///
/// 만료·불완전 세션을 지운 뒤에는 "인증 세션 없음"과 같아져 게스트 플래그를 따른다(REQ-BOOT-017). 읽을 수 없는(손상·복호화 실패) 저장값은
/// `SessionStore.currentSession()`이 정리하고 nil을 돌려주는 계약이므로 여기서는 세션 없음으로 다룬다(REQ-BOOT-019).
public struct SessionResolver: SessionResolving {
    private let store: any SessionStore
    private let guestFlags: any GuestFlagStore
    private let clock: any AppClock

    public init(store: any SessionStore, guestFlags: any GuestFlagStore, clock: any AppClock) {
        self.store = store
        self.guestFlags = guestFlags
        self.clock = clock
    }

    public func resolve() async -> AuthGateResult {
        if let session = await store.currentSession() {
            if Self.isUsable(session, now: clock.now) {
                await clearStaleGuestFlag()
                return .authenticated(userId: session.userId)
            }
            _ = await store.clearSession(ifMatching: session)
        }
        return await guestFlags.isGuest() ? .guest : .signedOut
    }

    /// 인증이 우선인데 게스트 플래그가 남아 있으면(로그인 뒤 삭제 실패 등) 지운다. 실패해도 판정은 그대로이며 다음 시작 때 다시 시도한다.
    private func clearStaleGuestFlag() async {
        guard await guestFlags.isGuest() else { return }
        try? await guestFlags.setGuest(false)
    }

    private static func isUsable(_ session: AuthSession, now: Date) -> Bool {
        !session.userId.isEmpty && !session.refreshToken.isEmpty && session.refreshTokenExpiresAt > now
    }
}
