import Foundation
import Testing
import ChalkakTestSupport
@testable import ChalkakNetwork

private let unauthorized = HTTPResponse.error(401, "UNAUTHORIZED", "유효하지 않은 인증 정보입니다.")
private let reauth = HTTPResponse.error(401, "REAUTHENTICATION_REQUIRED", "다시 로그인해 주세요.")

@Suite("NET 401 갱신")
struct AuthRefreshTests {
    @Test("TC-NET-012 401이면 refresh 1회 후 원 요청을 정확히 1회 재전송한다")
    func refreshThenRetry() async throws {
        let sut = try SUT(transport: FakeTransport(handler: tokenServer()))
        let r = try await sut.client.send(get("/notifications"))
        #expect(r.status == 200)
        let reqs = await sut.transport.requests
        #expect(reqs.map(\.apiPath) == ["/notifications", "/auth/refresh", "/notifications"])
        #expect(reqs[0].bearer == "Bearer old-access")
        #expect(reqs[1].refreshTokenInBody == "old-refresh")
        #expect(reqs[1].bearer == nil)
        #expect(reqs[2].bearer == "Bearer new-access")
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-013 토큰 없이 보낸 게스트 요청의 401은 refresh도 세션 삭제도 하지 않는다")
    func guestUnauthorized() async throws {
        let sut = try SUT(session: nil, script: [.response(unauthorized)])
        await #expect(throws: APIError.http(status: 401, code: .unauthorized, message: "유효하지 않은 인증 정보입니다.")) {
            try await sut.client.send(get("/posts/today"))
        }
        #expect(await sut.transport.count == 1)
        #expect(await sut.store.clearCount == 0)
        #expect(await sut.events.count == 0)
    }

    @Test("TC-NET-014 만료된 access 토큰은 헤더에 붙이지 않고, 서버 401 뒤 갱신 경로로 간다")
    func expiredAccessNotAttached() async throws {
        let clock = makeTestClock()
        let expired = makeSession(accessExpiresAt: clock.now.addingTimeInterval(-1))
        let sut = try SUT(session: expired, transport: FakeTransport(handler: tokenServer()), clock: clock)
        _ = try await sut.client.send(get("/notifications"))
        let reqs = await sut.transport.requests
        #expect(reqs.first?.bearer == nil)
        #expect(reqs.map(\.apiPath) == ["/notifications", "/auth/refresh", "/notifications"])
        #expect(reqs.last?.bearer == "Bearer new-access")
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-014 만료 직전(미만료) 토큰은 붙인다")
    func validAccessAttached() async throws {
        let sut = try SUT(script: [.response(.ok)])
        _ = try await sut.client.send(get("/notifications"))
        #expect(await sut.transport.requests.first?.bearer == "Bearer old-access")
    }

    @Test("TC-NET-015 동시 401이어도 refresh는 1건이고 모든 원 요청이 새 토큰으로 1회씩 재전송된다")
    func singleFlight() async throws {
        let gate = Gate()
        let sut = try SUT(transport: FakeTransport(handler: tokenServer(gate: gate)))
        let client = sut.client
        let transport = sut.transport
        let paths = (1...5).map { "/posts/\($0)" }
        let opener = Task {
            await waitUntil {
                let all = await transport.requests
                return all.filter { !$0.isRefresh }.count >= 5 && all.contains { $0.isRefresh }
            }
            await gate.open()
        }
        let statuses = try await withThrowingTaskGroup(of: Int.self) { group in
            for p in paths { group.addTask { try await client.send(get(p)).status } }
            var out: [Int] = []
            for try await s in group { out.append(s) }
            return out
        }
        await opener.value
        #expect(statuses == [200, 200, 200, 200, 200])
        let reqs = await sut.transport.requests
        #expect(reqs.filter(\.isRefresh).count == 1)
        for p in paths {
            let mine = reqs.filter { $0.apiPath == p }
            #expect(mine.map(\.bearer) == ["Bearer old-access", "Bearer new-access"])
        }
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-016 401을 받는 사이 다른 요청이 이미 갱신했으면 refresh 없이 새 토큰으로 재시도한다")
    func alreadyRefreshed() async throws {
        let gate = Gate()
        let transport = FakeTransport { req, i in
            if i == 0 { await gate.wait(); return unauthorized }
            return req.bearer == "Bearer new-access" ? .ok : unauthorized
        }
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/notifications")) }
        await waitUntil { await transport.count >= 1 }
        let old = makeSession()
        _ = await sut.store.replaceTokens(of: old, with: makeSession(access: "new-access", refresh: "new-refresh"))
        await gate.open()
        #expect(try await task.value.status == 200)
        let reqs = await sut.transport.requests
        #expect(reqs.filter(\.isRefresh).isEmpty)
        #expect(reqs.map(\.bearer) == ["Bearer old-access", "Bearer new-access"])
    }

    @Test("TC-NET-017 재전송한 요청이 다시 401이면 더 재전송하지 않는다")
    func retryOnlyOnce() async throws {
        let sut = try SUT(script: [.response(unauthorized), .response(.refreshOK()), .response(unauthorized), .response(.ok)])
        await #expect(throws: APIError.http(status: 401, code: .unauthorized, message: "유효하지 않은 인증 정보입니다.")) {
            try await sut.client.send(get("/notifications"))
        }
        #expect(await sut.transport.count == 3)
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-018 재전송한 요청이 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 이벤트를 낸다")
    func retryReauth() async throws {
        let sut = try SUT(script: [.response(unauthorized), .response(.refreshOK()), .response(reauth)])
        await #expect(throws: APIError.http(status: 401, code: .reauthenticationRequired, message: "다시 로그인해 주세요.")) {
            try await sut.client.send(get("/notifications"))
        }
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.events.count == 1)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-019 늦게 도착한 REAUTH 응답인데 이미 토큰이 갱신됐으면 새 토큰으로 1회 재시도하고 세션은 지우지 않는다")
    func lateReauth() async throws {
        let gate = Gate()
        let transport = FakeTransport { req, i in
            if i == 0 { await gate.wait(); return reauth }
            return req.bearer == "Bearer new-access" ? .ok : reauth
        }
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/notifications")) }
        await waitUntil { await transport.count >= 1 }
        _ = await sut.store.replaceTokens(of: makeSession(), with: makeSession(access: "new-access", refresh: "new-refresh"))
        await gate.open()
        #expect(try await task.value.status == 200)
        #expect(await sut.store.currentSession()?.accessToken == "new-access")
        #expect(await sut.store.clearCount == 0)
        #expect(await sut.events.count == 0)
        #expect(await sut.transport.requests.filter(\.isRefresh).isEmpty)
    }

    @Test("TC-NET-020 일반 API가 401 REAUTHENTICATION_REQUIRED면 refresh 없이 세션을 지운다")
    func generalReauth() async throws {
        let sut = try SUT(script: [.response(reauth)])
        await #expect(throws: APIError.http(status: 401, code: .reauthenticationRequired, message: "다시 로그인해 주세요.")) {
            try await sut.client.send(get("/notifications"))
        }
        #expect(await sut.transport.count == 1)
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.events.count == 1)
    }

    @Test("TC-NET-021 refresh 요청 자체가 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 이벤트를 낸다")
    func refreshReauth() async throws {
        let sut = try SUT(script: [.response(unauthorized), .response(reauth)])
        await #expect(throws: APIError.http(status: 401, code: .reauthenticationRequired, message: "다시 로그인해 주세요.")) {
            try await sut.client.send(get("/notifications"))
        }
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.events.count == 1)
        #expect(await sut.transport.count == 2)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-022 refresh 성공 시 두 토큰을 함께 저장하고 만료 시각을 응답 초 값으로 계산하며, 저장 뒤에 재전송한다")
    func savesBothTokens() async throws {
        let clock = makeTestClock()
        let store = Box<InMemorySessionStore?>(nil)
        let seenAtRetry = Box<[String?]>([])
        let transport = FakeTransport { req, i in
            if req.isRefresh { return .refreshOK() }
            if i == 0 { return unauthorized }
            let current = await store.get()
            await seenAtRetry.append(await current?.currentSession()?.refreshToken)
            return .ok
        }
        let sut = try SUT(transport: transport, clock: clock)
        await store.set(sut.store)
        _ = try await sut.client.send(get("/notifications"))
        let saved = try #require(await sut.store.currentSession())
        #expect(saved.userId == "user-a")
        #expect(saved.accessToken == "new-access")
        #expect(saved.refreshToken == "new-refresh")
        #expect(saved.accessTokenExpiresAt == clock.now.addingTimeInterval(900))
        #expect(saved.refreshTokenExpiresAt == clock.now.addingTimeInterval(2_592_000))
        #expect(await seenAtRetry.get() == ["new-refresh"])
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-023 refresh 네트워크 오류·타임아웃은 그 요청만 실패시키고 로그아웃·자동 재시도를 하지 않는다", arguments: [TransportError.timeout, .notConnected])
    func refreshNetworkFailure(error: TransportError) async throws {
        let sut = try SUT(script: [.response(unauthorized), .fail(error), .response(.refreshOK())])
        await #expect(throws: APIError.network) { try await sut.client.send(get("/notifications")) }
        #expect(await sut.transport.requests.filter(\.isRefresh).count == 1)
        #expect(await sut.store.currentSession() == makeSession())
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-024 refresh가 5xx면 세션을 유지한다")
    func refresh5xx() async throws {
        let sut = try SUT(script: [.response(unauthorized), .response(.error(500, "INTERNAL_ERROR", "서버 오류")), .response(.refreshOK())])
        await #expect(throws: APIError.http(status: 500, code: .internalError, message: "서버 오류")) {
            try await sut.client.send(get("/notifications"))
        }
        #expect(await sut.transport.requests.filter(\.isRefresh).count == 1)
        #expect(await sut.store.currentSession() == makeSession())
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-025 refresh 응답에 필수 토큰 필드가 없으면 일시 실패로 보고 기존 세션을 덮어쓰지 않는다")
    func refreshMissingField() async throws {
        let bad = HTTPResponse.json(200, #"{"accessToken":"new-access","expiresIn":900,"refreshTokenExpiresIn":2592000}"#)
        let sut = try SUT(script: [.response(unauthorized), .response(bad)])
        await #expect(throws: APIError.invalidResponse) { try await sut.client.send(get("/notifications")) }
        #expect(await sut.store.currentSession() == makeSession())
        #expect(await sut.store.replaceCount == 0)
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-026 refresh가 400이면 요청만 실패시키고 로그아웃하지 않는다")
    func refresh400() async throws {
        let sut = try SUT(script: [.response(unauthorized), .response(.error(400, "BUSINESS_ERROR", "refreshToken: 필수 값입니다."))])
        await #expect(throws: APIError.http(status: 400, code: .businessError, message: "refreshToken: 필수 값입니다.")) {
            try await sut.client.send(get("/notifications"))
        }
        #expect(await sut.store.currentSession() == makeSession())
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-027 refresh 도중 로그아웃하면 새 토큰을 저장하지 않고 세션을 되살리지 않는다")
    func logoutDuringRefresh() async throws {
        let gate = Gate()
        let transport = FakeTransport(handler: tokenServer(gate: gate))
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/notifications")) }
        await waitUntil { await transport.requests.contains { $0.isRefresh } }
        await sut.store.clearSession()
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.store.replaceCount == 0)
        #expect(await sut.transport.requests.filter { !$0.isRefresh }.count == 1)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-027 refresh 도중 계정이 바뀌면 B의 세션을 덮어쓰지 않는다")
    func accountSwitchDuringRefresh() async throws {
        let gate = Gate()
        let transport = FakeTransport(handler: tokenServer(gate: gate))
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/notifications")) }
        await waitUntil { await transport.requests.contains { $0.isRefresh } }
        let b = makeSession(userId: "user-b", access: "b-access", refresh: "b-refresh")
        await sut.store.save(b)
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(await sut.store.currentSession() == b)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-028 refresh 중 한 요청이 취소돼도 다른 대기 요청을 위한 refresh는 계속된다")
    func cancelledWaiter() async throws {
        let gate = Gate()
        let transport = FakeTransport(handler: tokenServer(gate: gate))
        let sut = try SUT(transport: transport)
        let client = sut.client
        let x = Task { try await client.send(get("/posts/1")) }
        let y = Task { try await client.send(get("/posts/2")) }
        await waitUntil {
            let all = await transport.requests
            return all.filter { !$0.isRefresh }.count >= 2 && all.contains { $0.isRefresh }
        }
        x.cancel()
        await gate.open()
        await #expect(throws: CancellationError.self) { try await x.value }
        #expect(try await y.value.status == 200)
        #expect(await sut.transport.requests.filter(\.isRefresh).count == 1)
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-029 같은 refresh token을 두 번 보내지 않는다")
    func neverReuseRefreshToken() async throws {
        let counter = Box<Int>(0)
        let transport = FakeTransport { req, _ in
            if req.isRefresh {
                let n = await counter.increment()
                return .refreshOK(access: "access-\(n)", refresh: "refresh-\(n)")
            }
            // 가장 최근에 발급된 access만 유효
            let n = await counter.get()
            return req.bearer == "Bearer access-\(n)" ? .ok : unauthorized
        }
        let sut = try SUT(transport: transport)
        _ = try await sut.client.send(get("/a"))
        await counter.set(2) // 서버가 토큰을 한 번 더 회전시킨 상황: access-1은 이제 무효
        _ = try await sut.client.send(get("/b"))
        let used = await sut.transport.requests.filter(\.isRefresh).compactMap(\.refreshTokenInBody)
        #expect(used.count == 2)
        #expect(Set(used).count == used.count)
        #expect(used.first == "old-refresh")
    }

    @Test("TC-NET-030 토큰을 보낸 비로그인 허용 API(GET /posts)도 만료 401이면 refresh 후 재전송한다")
    func publicApiWithToken() async throws {
        let sut = try SUT(transport: FakeTransport(handler: tokenServer()))
        let r = try await sut.client.send(get("/posts", query: [.int("page", 0)]))
        #expect(r.status == 200)
        #expect(await sut.transport.requests.map(\.apiPath) == ["/posts", "/auth/refresh", "/posts"])
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-031 anonymous 요청(GET /banners)은 Authorization 없이 나가고 401이어도 갱신하지 않는다")
    func bannersAnonymous() async throws {
        let sut = try SUT(script: [.response(unauthorized)])
        await #expect(throws: APIError.http(status: 401, code: .unauthorized, message: "유효하지 않은 인증 정보입니다.")) {
            try await sut.client.send(get("/banners", auth: .anonymous))
        }
        let reqs = await sut.transport.requests
        #expect(reqs.count == 1)
        #expect(reqs.first?.bearer == nil)
        #expect(await sut.store.currentSession() == makeSession())
    }

    @Test("TC-NET-057 계정 A의 요청이 진행 중 B로 전환되면 A의 재전송·refresh가 B의 세션을 건드리지 않는다")
    func accountSwitchInFlight() async throws {
        let gate = Gate()
        let transport = FakeTransport { req, i in
            if i == 0 { await gate.wait(); return unauthorized }
            return .ok
        }
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/notifications")) }
        await waitUntil { await transport.count >= 1 }
        let b = makeSession(userId: "user-b", access: "b-access", refresh: "b-refresh")
        await sut.store.save(b)
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
        let reqs = await sut.transport.requests
        #expect(reqs.count == 1)
        #expect(reqs.contains { $0.bearer == "Bearer b-access" } == false)
        #expect(await sut.store.currentSession() == b)
        #expect(await sut.events.count == 0)
    }

    @Test("TC-NET-022 만료 시각은 refresh 요청을 보내기 직전 시각 기준이다(응답이 늦어도 더 길게 잡지 않는다)")
    func expiryBasedOnRequestTime() async throws {
        let clock = makeTestClock()
        let start = clock.now
        let transport = FakeTransport { req, i in
            if req.isRefresh {
                clock.advance(by: .seconds(100)) // 응답이 100초 걸림
                return .refreshOK()
            }
            return i == 0 ? unauthorized : .ok
        }
        let sut = try SUT(transport: transport, clock: clock)
        _ = try await sut.client.send(get("/notifications"))
        let saved = try #require(await sut.store.currentSession())
        #expect(saved.accessTokenExpiresAt == start.addingTimeInterval(900))
        #expect(saved.refreshTokenExpiresAt == start.addingTimeInterval(2_592_000))
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-025 refresh 응답의 토큰이 비었거나 만료 초가 0 이하이면 invalidResponse이고 기존 세션을 덮어쓰지 않는다", arguments: [
        #"{"accessToken":"","expiresIn":900,"refreshToken":"r","refreshTokenExpiresIn":2592000}"#,
        #"{"accessToken":"a","expiresIn":900,"refreshToken":"","refreshTokenExpiresIn":2592000}"#,
        #"{"accessToken":"   ","expiresIn":900,"refreshToken":"r","refreshTokenExpiresIn":2592000}"#,
        #"{"accessToken":"a","expiresIn":0,"refreshToken":"r","refreshTokenExpiresIn":2592000}"#,
        #"{"accessToken":"a","expiresIn":-1,"refreshToken":"r","refreshTokenExpiresIn":2592000}"#,
        #"{"accessToken":"a","expiresIn":900,"refreshToken":"r","refreshTokenExpiresIn":0}"#,
        #"{"accessToken":"a","expiresIn":900,"refreshToken":"r","refreshTokenExpiresIn":-5}"#,
        #"{"accessToken":"a","expiresIn":"900","refreshToken":"r","refreshTokenExpiresIn":2592000}"#,
    ])
    func refreshInvalidValues(body: String) async throws {
        let sut = try SUT(script: [.response(unauthorized), .response(.json(200, body))])
        await #expect(throws: APIError.invalidResponse) { try await sut.client.send(get("/notifications")) }
        #expect(await sut.store.currentSession() == makeSession())
        #expect(await sut.store.replaceCount == 0)
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-057 같은 userId로 재로그인했으면 새 세션의 토큰으로 재전송하고 옛 refresh token은 다시 쓰지 않는다")
    func sameUserRelogin() async throws {
        let gate = Gate()
        let transport = FakeTransport { req, i in
            if req.isRefresh { return .refreshOK() }
            if i == 0 { await gate.wait(); return unauthorized }
            return req.bearer == "Bearer re-access" ? .ok : unauthorized
        }
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/notifications")) }
        await waitUntil("첫 요청 전송") { await transport.count >= 1 }
        let relogin = makeSession(userId: "user-a", access: "re-access", refresh: "re-refresh")
        await sut.store.clearSession()
        await sut.store.save(relogin)
        await gate.open()
        #expect(try await task.value.status == 200)
        let reqs = await sut.transport.requests
        #expect(reqs.filter(\.isRefresh).isEmpty)
        #expect(reqs.last?.bearer == "Bearer re-access")
        #expect(await sut.store.currentSession() == relogin)
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-057 refresh 도중 같은 userId로 재로그인하면 갱신 결과를 저장하지 않고 새 로그인 세션을 지키며 취소로 끝난다")
    func sameUserReloginDuringRefresh() async throws {
        let gate = Gate()
        let transport = FakeTransport(handler: tokenServer(gate: gate))
        let sut = try SUT(transport: transport)
        let client = sut.client
        let task = Task { try await client.send(get("/notifications")) }
        await waitUntil("refresh 전송") { await transport.requests.contains { $0.isRefresh } }
        let relogin = makeSession(userId: "user-a", access: "re-access", refresh: "re-refresh")
        await sut.store.clearSession()
        await sut.store.save(relogin)
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(await sut.store.currentSession() == relogin)
        #expect(await sut.store.replaceCount == 0)
        #expect(await sut.events.count == 0)
        await sut.expectNoRefreshTokenReuse()
    }

    @Test("TC-NET-057 갱신·재전송 도중 계정이 바뀌어도 APIClient 밖으로는 AuthError가 아니라 CancellationError만 나간다")
    func sessionChangedBecomesCancellation() async throws {
        let gate = Gate()
        let transport = FakeTransport { _, i in
            if i == 0 { await gate.wait(); return unauthorized }
            return .ok
        }
        let sut2 = try SUT(transport: transport)
        let client = sut2.client
        let task = Task { try await client.send(get("/x"), as: Sample.self) }
        await waitUntil("첫 요청 전송") { await transport.count >= 1 }
        await sut2.store.clearSession()
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
    }

}

/// 테스트용 작은 공유 상자(actor).
actor Box<T: Sendable> {
    var value: T
    init(_ value: T) { self.value = value }
    func get() -> T { value }
    func set(_ v: T) { value = v }
}
extension Box where T == Int {
    func increment() -> Int { value += 1; return value }
}
extension Box {
    func append<E>(_ e: E) where T == [E] { value.append(e) }
}
