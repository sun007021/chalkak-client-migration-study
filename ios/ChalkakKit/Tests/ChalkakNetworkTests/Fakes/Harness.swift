import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport

/// 서버 origin만 넣는다. 앱 코드가 `/api/v1/`을 붙이므로 요청 URL 기대값은 `https://api.test/api/v1/...`.
let testServerOrigin = "https://api.test"
let testEpoch = Date(timeIntervalSince1970: 1_800_000_000)

/// 실제로 기다리지 않는 시계: sleep은 길이를 기록하고 가상 시간을 앞당긴 뒤 즉시 돌아온다.
func makeTestClock(sleepMode: TestClock.SleepMode = .immediate) -> TestClock {
    TestClock(now: testEpoch, sleepMode: sleepMode)
}

extension Duration {
    var seconds: Double { Double(components.seconds) + Double(components.attoseconds) / 1e18 }
}

extension HTTPResponse {
    static func json(_ status: Int, _ text: String, headers: [String: String] = [:]) -> HTTPResponse {
        var h = headers
        if !h.keys.contains(where: { $0.lowercased() == "content-type" }) { h["Content-Type"] = "application/json" }
        return HTTPResponse(status: status, headers: h, body: Data(text.utf8))
    }
    static func error(_ status: Int, _ code: String, _ message: String = "msg", headers: [String: String] = [:]) -> HTTPResponse {
        json(status, #"{"errorCode":"\#(code)","message":"\#(message)"}"#, headers: headers)
    }
    static func refreshOK(access: String = "new-access", refresh: String = "new-refresh") -> HTTPResponse {
        json(200, #"{"accessToken":"\#(access)","expiresIn":900,"refreshToken":"\#(refresh)","refreshTokenExpiresIn":2592000}"#)
    }
    static let ok = json(200, #"{"id":"x"}"#)
    static let noContent = HTTPResponse(status: 204)
}

extension TransportRequest {
    /// base URL(`/api/v1`)을 뺀 경로.
    var apiPath: String { url.path.replacingOccurrences(of: "/api/v1", with: "") }
    var isRefresh: Bool { apiPath == "/auth/refresh" }
    var bearer: String? { header("Authorization") }
    var refreshTokenInBody: String? {
        guard let body, let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        return obj["refreshToken"] as? String
    }
}

func makeSession(
    userId: String = "user-a",
    access: String = "old-access",
    refresh: String = "old-refresh",
    accessExpiresAt: Date = testEpoch.addingTimeInterval(600)
) -> AuthSession {
    AuthSession(
        userId: userId,
        accessToken: access,
        accessTokenExpiresAt: accessExpiresAt,
        refreshToken: refresh,
        refreshTokenExpiresAt: testEpoch.addingTimeInterval(86_400)
    )
}

struct SUT {
    let client: APIClient
    let transport: FakeTransport
    let store: InMemorySessionStore
    let clock: TestClock
    let events: RecordingAuthEvents
    let logger: RecordingLogger
    let refresher: AuthRefresher

    init(
        session: AuthSession? = makeSession(),
        transport: FakeTransport,
        clock: TestClock = makeTestClock(),
        origin: String = testServerOrigin,
        allowInsecureLoopback: Bool = false
    ) throws {
        let config = try APIConfiguration(serverOrigin: origin, allowInsecureLoopback: allowInsecureLoopback)
        let store = InMemorySessionStore(session)
        let events = RecordingAuthEvents()
        let logger = RecordingLogger()
        let refresher = AuthRefresher(configuration: config, transport: transport, store: store, clock: clock, events: events)
        self.client = APIClient(configuration: config, transport: transport, store: store, refresher: refresher, clock: clock, logger: logger)
        self.transport = transport
        self.store = store
        self.clock = clock
        self.events = events
        self.logger = logger
        self.refresher = refresher
    }

    init(session: AuthSession? = makeSession(), script: [FakeTransport.Step], clock: TestClock = makeTestClock()) throws {
        try self.init(session: session, transport: FakeTransport(script: script), clock: clock)
    }
}

extension SUT {
    /// 모든 refresh 시나리오 공통 단언: 같은 refreshToken을 두 번 보내지 않는다(서버의 재사용 감지 방지).
    func expectNoRefreshTokenReuse(sourceLocation: SourceLocation = #_sourceLocation) async {
        let used = await transport.requests.filter(\.isRefresh).compactMap(\.refreshTokenInBody)
        #expect(Set(used).count == used.count, "refreshToken 중복 전송: \(used)", sourceLocation: sourceLocation)
    }
}

struct Sample: Decodable, Sendable, Equatable {
    let id: String
    let nickname: String?
}

func get(_ path: String, auth: AuthPolicy = .session, retry: RetryPolicy? = nil, query: [QueryItem] = []) -> HTTPRequest {
    HTTPRequest(method: .get, path: path, query: query, authPolicy: auth, retryPolicy: retry)
}

/// 토큰 기반 가짜 서버: `valid` 토큰이면 200, 아니면 401 UNAUTHORIZED. /auth/refresh는 새 토큰 발급.
func tokenServer(valid: String = "Bearer new-access", gate: Gate? = nil) -> FakeTransport.Handler {
    { req, _ in
        if req.isRefresh {
            if let gate { await gate.wait() }
            return .refreshOK()
        }
        return req.bearer == valid ? .ok : .error(401, "UNAUTHORIZED", "유효하지 않은 인증 정보입니다.")
    }
}
