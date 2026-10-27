import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport
@testable import ChalkakData

@Suite("AUTH 게스트")
struct GuestTests {
    @Test("TC-AUTH-032 게스트 진입은 서버 호출 없이 자격 증명을 지우고 플래그를 저장한다")
    func enterGuest() async throws {
        let sut = try AuthSUT { _, _ in .noContent }
        try await sut.repository.enterGuestMode()
        #expect(await sut.transport.count == 0)
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.guestFlags.isGuest() == true)
    }

    @Test("TC-AUTH-032 플래그 저장 실패는 던진다(로그인 화면에 머문다)")
    func enterGuestSaveFails() async throws {
        let sut = try AuthSUT(session: nil) { _, _ in .noContent }
        await sut.guestFlags.setFailOnSet(true)
        await #expect(throws: (any Error).self) { try await sut.repository.enterGuestMode() }
        #expect(await sut.guestFlags.isGuest() == false)
    }

    @Test("TC-AUTH-033 게스트 해제는 플래그만 지운다(서버 호출 없음)")
    func exitGuest() async throws {
        let sut = try AuthSUT(session: nil, guest: true) { _, _ in .noContent }
        try await sut.repository.exitGuestMode()
        #expect(await sut.guestFlags.isGuest() == false)
        #expect(await sut.transport.count == 0)
    }
}

@Suite("BOOT·AUTH 게스트 플래그 잔존 방지")
struct StaleGuestFlagTests {
    private func resolve(_ sut: AuthSUT) async -> AuthGateResult {
        await SessionResolver(store: sut.store, guestFlags: sut.guestFlags, clock: sut.clock).resolve()
    }

    @Test("TC-BOOT-008 로그인 성공 뒤 플래그 삭제가 실패해도 로그아웃하면 플래그가 지워져 재시작 시 signedOut")
    func logoutClearsFlagAfterFailedLoginClear() async throws {
        let sut = try AuthSUT(session: nil, guest: true) { _, _ in .loginSuccess() }
        await sut.guestFlags.setFailOnSet(true)
        _ = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        #expect(await sut.guestFlags.isGuest() == true)
        await sut.guestFlags.setFailOnSet(false)
        await sut.repository.logout()
        #expect(await resolve(sut) == .signedOut)
    }

    @Test("TC-BOOT-008 탈퇴 뒤에도 같다")
    func withdrawClearsFlag() async throws {
        let sut = try AuthSUT(session: makeSession(), guest: true) { _, _ in .noContent }
        try await sut.repository.withdraw()
        #expect(await sut.guestFlags.isGuest() == false)
        #expect(await resolve(sut) == .signedOut)
    }

    @Test("TC-BOOT-008 플래그 삭제가 계속 실패해도 로그아웃은 끝까지 간다(세션·캐시 정리)")
    func logoutSurvivesFlagFailure() async throws {
        let sut = try AuthSUT(guest: true) { _, _ in .noContent }
        await sut.guestFlags.setFailOnSet(true)
        await sut.repository.logout()
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.caches.count == 1)
    }

    @Test("TC-BOOT-008 플래그 삭제가 실패해도 탈퇴 정리는 끝까지 간다")
    func withdrawSurvivesFlagFailure() async throws {
        let sut = try AuthSUT(guest: true) { _, _ in .noContent }
        await sut.guestFlags.setFailOnSet(true)
        try await sut.repository.withdraw()
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.caches.count == 1)
    }
}

@Suite("BOOT 인증 게이트 판정")
struct SessionResolverTests {
    private func resolver(session: AuthSession?, guest: Bool, now: Date = t0) -> (SessionResolver, InMemorySessionStore) {
        let store = InMemorySessionStore(session)
        let resolver = SessionResolver(store: store, guestFlags: FakeGuestFlagStore(guest), clock: TestClock(now: now))
        return (resolver, store)
    }

    @Test("TC-BOOT-001 세션도 게스트 플래그도 없으면 signedOut")
    func empty() async {
        let (resolver, _) = resolver(session: nil, guest: false)
        #expect(await resolver.resolve() == .signedOut)
    }

    @Test("TC-BOOT-002 userId와 유효한 refresh token이면 authenticated")
    func authenticated() async {
        let (resolver, _) = resolver(session: makeSession(userId: "u9"), guest: false)
        #expect(await resolver.resolve() == .authenticated(userId: "u9"))
    }

    @Test("TC-BOOT-003 게스트 플래그만 있으면 guest")
    func guest() async {
        let (resolver, _) = resolver(session: nil, guest: true)
        #expect(await resolver.resolve() == .guest)
    }

    @Test("TC-BOOT-004 refresh가 만료됐으면 세션을 지우고 signedOut")
    func expiredRefresh() async {
        var session = makeSession()
        session.refreshTokenExpiresAt = t0.addingTimeInterval(-3600)
        let (resolver, store) = resolver(session: session, guest: false)
        #expect(await resolver.resolve() == .signedOut)
        #expect(await store.currentSession() == nil)
    }

    @Test("TC-BOOT-005 refresh 만료 시각 now-1초 / now / now+1초 → 만료 / 만료 / 유효", arguments: [
        (-1.0, false), (0.0, false), (1.0, true),
    ])
    func boundary(offset: Double, valid: Bool) async {
        var session = makeSession()
        session.refreshTokenExpiresAt = t0.addingTimeInterval(offset)
        let (resolver, _) = resolver(session: session, guest: false)
        let expected: AuthGateResult = valid ? .authenticated(userId: "user-a") : .signedOut
        #expect(await resolver.resolve() == expected)
    }

    @Test("TC-BOOT-008 인증 세션과 게스트 플래그가 같이 있으면 인증이 우선")
    func authenticatedWinsOverGuest() async {
        let (resolver, _) = resolver(session: makeSession(), guest: true)
        #expect(await resolver.resolve() == .authenticated(userId: "user-a"))
    }

    @Test("TC-BOOT-008 인증이 우선이면 남아 있던 게스트 플래그를 지운다(자가 치유)")
    func authenticatedClearsStaleGuestFlag() async {
        let flags = FakeGuestFlagStore(true)
        let resolver = SessionResolver(store: InMemorySessionStore(makeSession()), guestFlags: flags, clock: TestClock(now: t0))
        #expect(await resolver.resolve() == .authenticated(userId: "user-a"))
        #expect(await flags.isGuest() == false)
        #expect(await flags.setCalls == [false])
    }

    @Test("TC-BOOT-008 플래그가 없으면 치유 쓰기를 하지 않는다")
    func authenticatedWithoutFlagDoesNotWrite() async {
        let flags = FakeGuestFlagStore(false)
        let resolver = SessionResolver(store: InMemorySessionStore(makeSession()), guestFlags: flags, clock: TestClock(now: t0))
        _ = await resolver.resolve()
        #expect(await flags.setCalls.isEmpty)
    }

    @Test("TC-BOOT-008 치유 쓰기가 실패해도 인증 판정은 그대로다")
    func healFailureKeepsAuthenticated() async {
        let flags = FakeGuestFlagStore(true)
        await flags.setFailOnSet(true)
        let resolver = SessionResolver(store: InMemorySessionStore(makeSession()), guestFlags: flags, clock: TestClock(now: t0))
        #expect(await resolver.resolve() == .authenticated(userId: "user-a"))
    }

    @Test("TC-BOOT-009 access가 만료됐어도 refresh가 유효하면 authenticated(세션 유지)")
    func accessExpiredStillAuthenticated() async {
        var session = makeSession()
        session.accessTokenExpiresAt = t0.addingTimeInterval(-10)
        let (resolver, store) = resolver(session: session, guest: false)
        #expect(await resolver.resolve() == .authenticated(userId: "user-a"))
        #expect(await store.currentSession() == session)
    }
}

@Suite("BOOT 인증 게이트 판정: 저장소 계약과 경계")
struct SessionResolverContractTests {
    private func resolver(session: AuthSession?, guest: Bool) -> (SessionResolver, InMemorySessionStore) {
        let store = InMemorySessionStore(session)
        return (SessionResolver(store: store, guestFlags: FakeGuestFlagStore(guest), clock: TestClock(now: t0)), store)
    }

    @Test("TC-BOOT-006 TC-BOOT-007 손상·불완전 세션은 SessionStore가 nil로 돌려주는 계약이며 크래시 없이 signedOut")
    func unreadableSessionIsNil() async {
        let (resolver, store) = resolver(session: nil, guest: false)
        #expect(await resolver.resolve() == .signedOut)
        #expect(await store.currentSession() == nil)
    }

    @Test("TC-BOOT-006 userId나 refresh token이 비어 있는 불완전 세션은 지우고 signedOut", arguments: [
        ("", "RT"), ("u", ""),
    ])
    func incompleteSession(userId: String, refresh: String) async {
        let (resolver, store) = resolver(session: makeSession(userId: userId, refresh: refresh), guest: false)
        #expect(await resolver.resolve() == .signedOut)
        #expect(await store.currentSession() == nil)
    }

    /// REQ-BOOT-017은 "인증 세션이 없고 게스트 플래그가 있으면 게스트"다. 만료·불완전 세션은 지운 뒤 인증 세션 없음과 같으므로 플래그를 따른다.
    @Test("TC-BOOT-004 refresh가 만료됐고 게스트 플래그가 있으면 세션만 지우고 guest")
    func expiredRefreshWithGuestFlag() async {
        var session = makeSession()
        session.refreshTokenExpiresAt = t0.addingTimeInterval(-1)
        let (resolver, store) = resolver(session: session, guest: true)
        #expect(await resolver.resolve() == .guest)
        #expect(await store.currentSession() == nil)
    }

    @Test("TC-BOOT-001~009 boot/session__*.json 시드로 판정한다(손상·불완전은 저장소 계약에 따라 세션 없음)", arguments: [
        "boot/session__empty.json", "boot/session__authenticated.json", "boot/session__guest.json",
        "boot/session__expired-refresh.json", "boot/session__authenticated-and-guest.json", "boot/session__access-expired.json",
        "boot/session__partial.json", "boot/session__corrupted.json",
    ])
    func seededFromFixture(name: String) async throws {
        let seed = try SessionSeed(name)
        let store = InMemorySessionStore(seed.session)
        let resolver = SessionResolver(store: store, guestFlags: FakeGuestFlagStore(seed.guest), clock: TestClock(now: seed.now))
        let result = await resolver.resolve()
        switch (seed.expectedDestination, seed.expectedMode) {
        case ("login", _): #expect(result == .signedOut)
        case ("home", "guest"): #expect(result == .guest)
        default: #expect(result == .authenticated(userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
        }
        if seed.expectsStorageCleared { #expect(await store.currentSession() == nil) }
    }
}

/// `_kind: storage` fixture를 세션·게스트 플래그로 옮긴다. 완전한 5개 필드가 없으면(불완전·손상) 저장소가 nil을 돌려주는 계약이라 세션은 nil.
private struct SessionSeed {
    /// fixture의 `FIXTURE_NOW`(boot/README.md).
    let now = ISO8601DateFormatter().date(from: "2026-10-27T03:00:00Z")!
    let session: AuthSession?
    let guest: Bool
    let expectedDestination: String
    let expectedMode: String?
    let expectsStorageCleared: Bool

    init(_ name: String) throws {
        let object = try Fixture.load(name).object()
        let stored = try #require(object["stored"] as? [String: Any])
        let expect = try #require(object["expect"] as? [String: Any])
        let isCorrupted = object["corrupted"] as? Bool ?? false
        let formatter = ISO8601DateFormatter()
        func date(_ key: String) -> Date? { (stored[key] as? String).flatMap(formatter.date(from:)) }
        if !isCorrupted,
           let userId = stored["userId"] as? String, let access = stored["accessToken"] as? String,
           let refresh = stored["refreshToken"] as? String,
           let accessExp = date("accessTokenExpiresAt"), let refreshExp = date("refreshTokenExpiresAt") {
            session = AuthSession(userId: userId, accessToken: access, accessTokenExpiresAt: accessExp, refreshToken: refresh, refreshTokenExpiresAt: refreshExp)
        } else {
            session = nil
        }
        guest = stored["guest"] as? Bool ?? false
        expectedDestination = try #require(expect["destination"] as? String)
        expectedMode = expect["mode"] as? String
        expectsStorageCleared = expect["storageCleared"] as? Bool ?? false
    }
}
