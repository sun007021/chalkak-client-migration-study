import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport
@testable import ChalkakNetwork

/// `replaceTokens`가 저장은 끝냈지만 아직 호출자에게 돌아오지 않은 구간을 만드는 저장소.
/// 실제 Keychain처럼 저장 완료와 반환 사이에 다른 호출이 끼어드는 상황을 재현한다.
actor GatedSessionStore: SessionStore {
    private var session: AuthSession?
    private let gate: Gate
    init(_ session: AuthSession, gate: Gate) {
        self.session = session
        self.gate = gate
    }
    func currentSession() async -> AuthSession? { session }
    func save(_ session: AuthSession) async { self.session = session }
    func replaceTokens(of expected: AuthSession, with refreshed: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = refreshed
        await gate.wait() // 저장은 끝났고 반환만 늦춘다.
        return true
    }
    func clearSession(ifMatching expected: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = nil
        return true
    }
    func clearSession() async { session = nil }
}

/// 첫 `currentSession()` 호출만 값을 읽은 뒤 gate가 열릴 때까지 반환을 미룬다(낡은 값을 돌려주게 된다).
actor DelayedFirstReadStore: SessionStore {
    private var session: AuthSession?
    private let gate: Gate
    private var delayed = false
    private(set) var firstReadStarted = false
    init(_ session: AuthSession?, gate: Gate) { self.session = session; self.gate = gate }
    func currentSession() async -> AuthSession? {
        let value = session
        if !delayed {
            delayed = true
            firstReadStarted = true
            await gate.wait()
        }
        return value
    }
    func save(_ session: AuthSession) async { self.session = session }
    func replaceTokens(of expected: AuthSession, with refreshed: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = refreshed
        return true
    }
    func clearSession(ifMatching expected: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = nil
        return true
    }
    func clearSession() async { session = nil }
}

@Suite("NET AuthRefresher 경쟁 상태", .timeLimit(.minutes(1)))
struct AuthRefresherRaceTests {
    private func makeRefresher(store: any SessionStore, transport: FakeTransport) throws -> AuthRefresher {
        AuthRefresher(
            configuration: try APIConfiguration(serverOrigin: testServerOrigin),
            transport: transport,
            store: store,
            clock: makeTestClock(),
            events: RecordingAuthEvents()
        )
    }

    private func tokens(_ requests: [TransportRequest]) -> [String] {
        requests.filter(\.isRefresh).compactMap(\.refreshTokenInBody)
    }

    @Test("TC-NET-016 갱신 직후(저장 완료, 반환 전) 오래된 세션을 든 호출자는 refresh 없이 현재 세션을 받는다")
    func staleCallerDuringReplaceWindow() async throws {
        let storeGate = Gate()
        let transport = FakeTransport { _, _ in .refreshOK(access: "a1", refresh: "r1") }
        let old = makeSession()
        let store = GatedSessionStore(old, gate: storeGate)
        let refresher = try makeRefresher(store: store, transport: transport)

        let first = Task { try await refresher.refreshSession(rejected: old) }
        await waitUntil("저장소에 새 세션 반영") { await store.currentSession()?.refreshToken == "r1" }
        let stale = try await refresher.refreshSession(rejected: old)
        #expect(stale.refreshToken == "r1")
        await storeGate.open()
        #expect(try await first.value.refreshToken == "r1")
        #expect(tokens(await transport.requests) == ["old-refresh"])
    }

    @Test("TC-NET-029 먼저 끝난 갱신이 뒤늦게 정리되어도 새 갱신(inFlight)을 지우지 않아 같은 refresh token이 두 번 나가지 않는다")
    func finishedRefreshDoesNotClearNewerInFlight() async throws {
        let storeGate = Gate()
        let secondRefreshGate = Gate()
        let transport = FakeTransport { req, _ in
            let used = req.refreshTokenInBody
            if used == "old-refresh" { return .refreshOK(access: "a1", refresh: "r1") }
            await secondRefreshGate.wait()
            return .refreshOK(access: "a2", refresh: "r2")
        }
        let old = makeSession()
        let store = GatedSessionStore(old, gate: storeGate)
        let refresher = try makeRefresher(store: store, transport: transport)

        // A: old -> r1. 저장은 끝났지만 반환 전에 멈춘다.
        let a = Task { try await refresher.refreshSession(rejected: old) }
        await waitUntil("저장소에 r1 반영") { await store.currentSession()?.refreshToken == "r1" }
        // B: r1(a1) 토큰이 또 401을 받은 호출자 -> 새 갱신(r1 -> r2) 시작, 서버 응답 대기.
        let s1 = makeSession(access: "a1", refresh: "r1")
        let b = Task { try await refresher.refreshSession(rejected: s1) }
        await waitUntil("두 번째 refresh 전송") { await transport.requests.filter(\.isRefresh).count >= 2 }
        // A가 뒤늦게 반환 -> 자기 inFlight만 지워야 한다.
        await storeGate.open()
        _ = try await a.value
        // C: 같은 r1 세션으로 온 또 다른 호출자는 B의 갱신에 합류해야 한다.
        let c = Task { try await refresher.refreshSession(rejected: s1) }
        for _ in 0..<2_000 { await Task.yield() } // C가 (잘못된) 세 번째 refresh를 보낼 기회를 준다.
        await secondRefreshGate.open()
        let rb = try await b.value
        let rc = try await c.value
        #expect(rb.refreshToken == "r2")
        #expect(rc.refreshToken == "r2")
        let used = tokens(await transport.requests)
        #expect(used == ["old-refresh", "r1"], "refresh token 중복 전송: \(used)")
    }

    @Test("TC-NET-027 refresher를 직접 쓰면 계정이 바뀐 경우 AuthError.sessionChanged를 던진다(APIClient가 취소로 바꾼다)")
    func refresherThrowsSessionChanged() async throws {
        let transport = FakeTransport { _, _ in .refreshOK() }
        let store = InMemorySessionStore(makeSession(userId: "user-b"))
        let refresher = try makeRefresher(store: store, transport: transport)
        await #expect(throws: AuthError.sessionChanged) { try await refresher.refreshSession(rejected: makeSession(userId: "user-a")) }
        let empty = InMemorySessionStore(nil)
        let refresher2 = try makeRefresher(store: empty, transport: transport)
        await #expect(throws: AuthError.sessionChanged) { try await refresher2.refreshSession(rejected: makeSession()) }
        #expect(await transport.count == 0)
    }

    @Test("TC-NET-016 저장소 읽기가 지연되는 사이 다른 요청의 refresh가 끝나면, 늦은 요청은 refresh를 보내지 않고 새 세션을 쓴다")
    func delayedReadSeesFinishedRefresh() async throws {
        let readGate = Gate()
        let transport = FakeTransport { _, _ in .refreshOK(access: "a1", refresh: "r1") }
        let old = makeSession()
        let store = DelayedFirstReadStore(old, gate: readGate)
        let refresher = try makeRefresher(store: store, transport: transport)

        let slow = Task { try await refresher.refreshSession(rejected: old) } // 첫 읽기가 지연된다.
        await waitUntil("지연된 첫 읽기 시작") { await store.firstReadStarted }
        let fast = try await refresher.refreshSession(rejected: old) // 지연 없이 refresh 완료
        #expect(fast.refreshToken == "r1")
        await readGate.open()
        let result = try await slow.value
        #expect(result.refreshToken == "r1")
        #expect(tokens(await transport.requests) == ["old-refresh"], "옛 refresh token 재전송")
    }

    @Test("TC-NET-027 저장소가 세션을 못 읽으면(nil) 갱신하지 않고 sessionChanged로 끝난다(크래시 없음)")
    func unreadableStoreMeansNoSession() async throws {
        let transport = FakeTransport { _, _ in .refreshOK() }
        let refresher = try makeRefresher(store: InMemorySessionStore(nil), transport: transport)
        await #expect(throws: AuthError.sessionChanged) { try await refresher.refreshSession(rejected: makeSession()) }
        #expect(await refresher.handleReauthenticationRequired(rejected: makeSession()) == nil)
        #expect(await transport.count == 0)
    }
}
