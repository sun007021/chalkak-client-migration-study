import Foundation
import Testing
import ChalkakCore
@testable import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

// MARK: JWT 판별

@Suite("PUSH JWT session_id 판별", .timeLimit(.minutes(1)))
struct AccessTokenClaimsTests {
    @Test("TC-PUSH-022 TC-PUSH-023 session_id 클레임이 있으면 true, 없으면 false (fixture expect)", arguments: [
        "push/jwt__with-session-id.json", "push/jwt__without-session-id.json",
    ])
    func hasSessionId(name: String) throws {
        let fixture = try Fixture.load(name)
        let object = try fixture.object()
        let token = try #require(object["token"] as? String)
        let expected = try #require((object["expect"] as? [String: Any])?["hasSessionId"] as? Bool)
        #expect(AccessTokenClaims.hasSessionId(token) == expected)
    }

    @Test("TC-PUSH-026 잘못된 형식은 예외 없이 session_id 없음이다 (서명은 검증하지 않는다)")
    func malformedTokens() throws {
        let object = try Fixture.load("push/jwt__malformed.json").object()
        let cases = try #require(object["cases"] as? [[String: Any]])
        #expect(cases.count == 7)
        for item in cases {
            let token = try #require(item["token"] as? String)
            #expect(!AccessTokenClaims.hasSessionId(token), "\(item["name"] ?? "")")
        }
        // 양성 대조: 서명 자리가 아무 값이어도 session_id가 있으면 true.
        let withId = try #require(try Fixture.load("push/jwt__with-session-id.json").object()["token"] as? String)
        let tampered = withId.split(separator: ".").prefix(2).joined(separator: ".") + ".other-signature"
        #expect(AccessTokenClaims.hasSessionId(tampered))
    }
}

// MARK: 기기 등록

private actor FixedTokens: FCMTokenProviding {
    var token: String?
    init(_ token: String?) { self.token = token }
    func currentToken() async -> String? { token }
    func set(_ token: String?) { self.token = token }
}

private let sessionIdToken = (try? Fixture.load("push/jwt__with-session-id.json").object()["token"] as? String) ?? ""
private let noSessionIdToken = (try? Fixture.load("push/jwt__without-session-id.json").object()["token"] as? String) ?? ""

private func session(userId: String = "user-a", access: String, refresh: String = "old-refresh") -> AuthSession {
    makeSession(userId: userId, access: access, refresh: refresh)
}

private func refreshResponse(access: String, refresh: String = "new-refresh") -> HTTPResponse {
    .json(200, #"{"accessToken":"\#(access)","expiresIn":900,"refreshToken":"\#(refresh)","refreshTokenExpiresIn":2592000}"#)
}

private struct PushSUT {
    let registrar: PushDeviceRegistrar
    let transport: FakeTransport
    let store: InMemorySessionStore
    let events: RecordingAuthEvents
    let tokens: FixedTokens

    init(
        session: AuthSession? = session(access: sessionIdToken), token: String? = "fcm-token-1",
        handler: @escaping FakeTransport.Handler = { request, _ in request.apiPath == "/auth/refresh" ? refreshResponse(access: sessionIdToken) : .noContent }
    ) throws {
        let clock = TestClock(now: t0, sleepMode: .immediate)
        let config = try APIConfiguration(serverOrigin: testServerOrigin)
        transport = FakeTransport(handler: handler)
        store = InMemorySessionStore(session)
        events = RecordingAuthEvents()
        tokens = FixedTokens(token)
        let refresher = AuthRefresher(configuration: config, transport: transport, store: store, clock: clock, events: events)
        let client = APIClient(configuration: config, transport: transport, store: store, refresher: refresher, clock: clock)
        registrar = PushDeviceRegistrar(client: client, store: store, refresher: refresher, tokens: tokens)
    }

    func puts() async -> [TransportRequest] { await transport.requests(path: "/push-devices/current") }
    func refreshes() async -> Int { await transport.requests(path: "/auth/refresh").count }
}

@Suite("PUSH 기기 등록", .timeLimit(.minutes(1)))
struct PushDeviceRegistrarTests {
    @Test("TC-PUSH-012 로그인 성공 + 토큰 준비 → PUT /push-devices/current, 바디는 {fcmToken}뿐이고 204가 성공이다")
    func registersWithTokenOnly() async throws {
        let sut = try PushSUT()
        let result = await sut.registrar.register()

        #expect(result == .registered)
        let request = try #require(await sut.puts().first)
        #expect(request.method == .put)
        #expect(request.jsonBody as? [String: String] == ["fcmToken": "fcm-token-1"])
        #expect(request.header("Authorization") == "Bearer \(sessionIdToken)")
    }

    @Test("TC-PUSH-033 정지 회원도 등록은 204로 성공한다 (등록 쪽에서 계정 상태를 거르지 않는다)")
    func suspendedMemberRegisters() async throws {
        let sut = try PushSUT(handler: { _, _ in .noContent })
        #expect(await sut.registrar.register() == .registered)
    }

    @Test("TC-PUSH-013 가입 직후에도 로그인 성공과 같은 register()로 1회 등록한다")
    func registersAfterSignUp() async throws {
        let sut = try PushSUT()
        _ = await sut.registrar.register()
        #expect(await sut.puts().count == 1)
    }

    @Test("TC-PUSH-014 인증된 상태로 앱을 시작하면 register()로 1회 등록한다")
    func registersOnAuthenticatedStart() async throws {
        let sut = try PushSUT()
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.puts().count == 1)
    }

    @Test("TC-PUSH-015 FCM 토큰이 바뀌면 새 토큰으로 1회 등록한다")
    func tokenChangedRegistersNewToken() async throws {
        let sut = try PushSUT()
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.registrar.tokenChanged("fcm-token-2") == .registered)
        let bodies = await sut.puts().map { $0.jsonBody as? [String: String] }
        #expect(bodies == [["fcmToken": "fcm-token-1"], ["fcmToken": "fcm-token-2"]])
    }

    @Test("TC-PUSH-016 TC-PUSH-017 세션이 없으면(게스트·로그아웃) 토큰이 도착해도 등록하지 않고, 로그인 뒤 같은 토큰으로 등록한다")
    func noSessionThenLogin() async throws {
        let sut = try PushSUT(session: nil, token: nil)
        #expect(await sut.registrar.tokenChanged("fcm-token-early") == .skippedNoSession)
        #expect(await sut.puts().isEmpty)

        await sut.store.save(session(access: sessionIdToken))
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.puts().first?.jsonBody as? [String: String] == ["fcmToken": "fcm-token-early"])
    }

    @Test("TC-PUSH-018 FCM 토큰이 아직 없으면 요청 없이 건너뛰고, 토큰이 준비되면 등록한다")
    func noTokenYet() async throws {
        let sut = try PushSUT(token: nil)
        #expect(await sut.registrar.register() == .skippedNoToken)
        #expect(await sut.puts().isEmpty)
        #expect(await sut.registrar.tokenChanged("fcm-token-ready") == .registered)
        #expect(await sut.puts().count == 1)
    }

    @Test("TC-PUSH-019 전달받은 토큰이 없어도 SDK의 현재 토큰을 조회해 등록한다")
    func fallsBackToProviderToken() async throws {
        let sut = try PushSUT(token: "sdk-current-token")
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.puts().first?.jsonBody as? [String: String] == ["fcmToken": "sdk-current-token"])
    }

    @Test("TC-PUSH-020 같은 (userId, token)으로 트리거가 연달아 와도 요청은 1회뿐이다")
    func deduplicates() async throws {
        let sut = try PushSUT()
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.registrar.register() == .alreadyRegistered)
        #expect(await sut.registrar.tokenChanged("fcm-token-1") == .alreadyRegistered)
        #expect(await sut.puts().count == 1)
    }

    @Test("TC-PUSH-021 세션 변경·포그라운드·토큰 변경이 동시에 와도 등록 요청은 직렬화되어 1회만 나간다")
    func serializesConcurrentTriggers() async throws {
        let gate = StubbornGate()
        let sut = try PushSUT(handler: { request, _ in
            if request.apiPath == "/push-devices/current" { await gate.wait() }
            return .noContent
        })
        let first = Task { await sut.registrar.register() }
        guard await EventWait.signal(sut.transport.requested, before: first) else {
            Issue.record("첫 등록 요청이 나가야 한다")
            return
        }
        let queued = CallSignal()
        await sut.registrar.setQueueObserver { Task { await queued.fire() } }
        let second = Task { await sut.registrar.register() }
        let third = Task { await sut.registrar.tokenChanged("fcm-token-1") }
        await queued.wait(atLeast: 2) // 두 호출이 실제로 대기열에 들어간 뒤에 확인한다.
        #expect(await sut.puts().count == 1, "진행 중에는 두 번째 요청이 나가지 않는다")

        await gate.open()
        let results = [await first.value, await second.value, await third.value]
        #expect(results.filter { $0 == .registered }.count == 1)
        #expect(await sut.puts().count == 1)
    }

    @Test("REQ-PUSH-009 대기 중이던 호출이 취소돼도 잠금은 다음 대기자에게 넘어가 모두 끝난다")
    func cancelledWaiterHandsOverLock() async throws {
        let gate = StubbornGate()
        let sut = try PushSUT(handler: { request, _ in
            if request.apiPath == "/push-devices/current" { await gate.wait() }
            return .noContent
        })
        let first = Task { await sut.registrar.register() }
        guard await EventWait.signal(sut.transport.requested, before: first) else {
            Issue.record("첫 등록 요청이 나가야 한다")
            return
        }
        let queued = CallSignal()
        await sut.registrar.setQueueObserver { Task { await queued.fire() } }
        let second = Task { await sut.registrar.register() }
        await queued.wait(atLeast: 1)
        let third = Task { await sut.registrar.register() }
        await queued.wait(atLeast: 2)
        second.cancel()

        await gate.open()
        #expect(await first.value == .registered)
        _ = await second.value
        #expect(await third.value == .alreadyRegistered)
        #expect(await sut.puts().count == 1)
    }

    @Test("REQ-PUSH-015 요청 도중 sessionEnded가 오면 그 성공을 중복 제거 기록에 남기지 않아 재로그인 뒤 다시 등록한다")
    func sessionEndedDuringRequestDoesNotRecord() async throws {
        let gate = StubbornGate()
        let sut = try PushSUT(handler: { request, _ in
            if request.apiPath == "/push-devices/current" { await gate.wait() }
            return .noContent
        })
        let first = Task { await sut.registrar.register() }
        guard await EventWait.signal(sut.transport.requested, before: first) else {
            Issue.record("첫 등록 요청이 나가야 한다")
            return
        }
        await sut.registrar.sessionEnded()
        await gate.open()
        #expect(await first.value == .skippedNoSession)

        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.puts().count == 2, "재로그인 뒤 실제 PUT이 다시 나간다")
    }

    @Test("REQ-PUSH-009 이미 등록한 (userId, token)이면 session_id가 없어도 갱신 없이 건너뛴다")
    func alreadyRegisteredSkipsRefresh() async throws {
        let sut = try PushSUT()
        #expect(await sut.registrar.register() == .registered)
        await sut.store.save(session(access: noSessionIdToken))
        #expect(await sut.registrar.register() == .alreadyRegistered)
        #expect(await sut.refreshes() == 0)
    }

    @Test("TC-PUSH-022 액세스 토큰에 session_id가 있으면 refresh 없이 바로 등록한다")
    func noRefreshWhenSessionIdPresent() async throws {
        let sut = try PushSUT()
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.refreshes() == 0)
        #expect(await sut.puts().count == 1)
    }

    @Test("TC-PUSH-023 session_id가 없으면 먼저 POST /auth/refresh로 새 토큰을 받고 새 토큰으로 등록한다")
    func refreshesBeforeRegisterWithoutSessionId() async throws {
        let sut = try PushSUT(session: session(access: noSessionIdToken))
        let result = await sut.registrar.register()

        #expect(result == .registered)
        let log = await sut.transport.requests.map(\.apiPath)
        #expect(log == ["/auth/refresh", "/push-devices/current"])
        #expect(await sut.puts().first?.header("Authorization") == "Bearer \(sessionIdToken)")
    }

    @Test("TC-PUSH-024 갱신한 토큰에도 session_id가 없으면 등록 요청 0건이고 로그인은 유지된다")
    func stillNoSessionIdAfterRefresh() async throws {
        let sut = try PushSUT(
            session: session(access: noSessionIdToken),
            handler: { _, _ in refreshResponse(access: noSessionIdToken) }
        )
        #expect(await sut.registrar.register() == .skippedNoSessionId)
        #expect(await sut.puts().isEmpty)
        #expect(await sut.store.currentSession() != nil)
        #expect(await sut.events.count == 0)
    }

    @Test("TC-PUSH-025 session_id 확인용 refresh가 REAUTHENTICATION_REQUIRED면 세션을 지우고 로그인 화면으로 간다")
    func reauthDuringSessionIdRefresh() async throws {
        let sut = try PushSUT(
            session: session(access: noSessionIdToken),
            handler: { _, _ in .error(401, "REAUTHENTICATION_REQUIRED") }
        )
        #expect(await sut.registrar.register() == .loginRequired)
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.events.count == 1)
        #expect(await sut.puts().isEmpty)
    }

    @Test("TC-PUSH-027 만료된 토큰으로 등록 → 401 UNAUTHORIZED면 refresh 후 1회 재등록한다")
    func unauthorizedRefreshesAndRetriesOnce() async throws {
        let sessionBefore = session(access: sessionIdToken + "x")
        let flow = try PushSUT(session: sessionBefore, handler: { request, _ in
            if request.apiPath == "/auth/refresh" { return refreshResponse(access: sessionIdToken) }
            return request.header("Authorization") == "Bearer \(sessionIdToken)" ? .noContent : .error(401, "UNAUTHORIZED")
        })
        #expect(await flow.registrar.register() == .registered)
        #expect(await flow.puts().count == 2, "401 한 번 + 재전송 한 번")
        #expect(await flow.refreshes() == 1)
    }

    @Test("TC-PUSH-028 TC-PUSH-034 등록이 401 REAUTHENTICATION_REQUIRED이고 refresh도 REAUTH면 세션을 지우고 로그인 화면으로 간다")
    func reauthenticationRequiredGoesToLogin() async throws {
        let sut = try PushSUT(handler: { _, _ in .error(401, "REAUTHENTICATION_REQUIRED") })
        #expect(await sut.registrar.register() == .loginRequired)
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.events.count == 1)
    }

    @Test("TC-PUSH-029 400·반복 거절로 등록이 실패해도 로그인을 해제하지 않고 오류를 던지지 않는다")
    func rejectedRegistrationKeepsLogin() async throws {
        let sut = try PushSUT(handler: { _, _ in .error(400, "BUSINESS_ERROR", "FCM 토큰이 필요합니다.") })
        #expect(await sut.registrar.register() == .failed)
        #expect(await sut.store.currentSession() != nil)
        #expect(await sut.events.count == 0)
        #expect(await sut.puts().count == 1, "400은 재시도하지 않는다")
    }

    @Test("TC-PUSH-030 네트워크 오류·500은 PUT 멱등 재시도(최대 2회)를 거쳐 실패하고 로그인은 유지되며 다음 트리거에 다시 시도한다")
    func transientFailureRetriesThenFailsAndRetriesLater() async throws {
        let failing = FailureSwitch()
        let sut = try PushSUT(handler: { request, _ in
            if request.apiPath == "/push-devices/current", await failing.isFailing { return .error(500, "INTERNAL_SERVER_ERROR") }
            return .noContent
        })
        #expect(await sut.registrar.register() == .failed)
        #expect(await sut.puts().count == 3)
        #expect(await sut.store.currentSession() != nil)

        await failing.set(false)
        #expect(await sut.registrar.register() == .registered, "실패는 중복 제거 기록에 남지 않는다")
        #expect(await sut.puts().count == 4)
    }

    @Test("TC-PUSH-031 빈 FCM 토큰은 요청을 보내지 않는다")
    func emptyTokenIsNotSent() async throws {
        let sut = try PushSUT(token: "")
        #expect(await sut.registrar.register() == .skippedEmptyToken)
        #expect(await sut.registrar.tokenChanged("") == .skippedEmptyToken)
        #expect(await sut.puts().isEmpty)
    }

    @Test("TC-PUSH-032 로그아웃(sessionEnded) 후 같은 토큰으로 다른 계정 B가 로그인하면 B 세션으로 다시 등록한다")
    func accountSwitchRegistersAgain() async throws {
        let sut = try PushSUT()
        #expect(await sut.registrar.register() == .registered)

        await sut.registrar.sessionEnded()
        await sut.store.save(session(userId: "user-b", access: sessionIdToken, refresh: "b-refresh"))
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.puts().count == 2)
    }

    @Test("TC-PUSH-032 sessionEnded 없이 계정만 바뀌어도 (userId, 토큰) 쌍이 달라 다시 등록한다")
    func userIdIsPartOfDedupeKey() async throws {
        let sut = try PushSUT()
        _ = await sut.registrar.register()
        await sut.store.save(session(userId: "user-b", access: sessionIdToken, refresh: "b-refresh"))
        #expect(await sut.registrar.register() == .registered)
        #expect(await sut.puts().count == 2)
    }

    @Test("TC-PUSH-035 로그아웃·탈퇴 처리(sessionEnded)는 기기 해제 API를 부르지 않는다")
    func noUnregisterCall() async throws {
        let sut = try PushSUT()
        _ = await sut.registrar.register()
        await sut.registrar.sessionEnded()
        let others = await sut.transport.requests.filter { $0.apiPath.hasPrefix("/push-devices") && $0.method != .put }
        #expect(others.isEmpty)
        #expect(await sut.transport.count == 1)
    }
}

private actor FailureSwitch {
    private(set) var isFailing = true
    func set(_ value: Bool) { isFailing = value }
}
