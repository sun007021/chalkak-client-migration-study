import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport

let testServerOrigin = "https://api.test"
let t0 = Date(timeIntervalSince1970: 1_800_000_000)

extension HTTPResponse {
    static func json(_ status: Int, _ text: String) -> HTTPResponse {
        HTTPResponse(status: status, headers: ["Content-Type": "application/json"], body: Data(text.utf8))
    }
    static func error(_ status: Int, _ code: String, _ message: String = "msg") -> HTTPResponse {
        json(status, #"{"errorCode":"\#(code)","message":"\#(message)"}"#)
    }
    static func refreshOK(access: String = "new-access", refresh: String = "new-refresh") -> HTTPResponse {
        json(200, #"{"accessToken":"\#(access)","expiresIn":900,"refreshToken":"\#(refresh)","refreshTokenExpiresIn":2592000}"#)
    }
    static func loginSuccess(userId: String = "user-b", access: String = "login-access", refresh: String = "login-refresh") -> HTTPResponse {
        json(200, #"{"status":"LOGIN_SUCCESS","userId":"\#(userId)","accessToken":"\#(access)","expiresIn":900,"refreshToken":"\#(refresh)","refreshTokenExpiresIn":2592000}"#)
    }
    static let signUpRequired = json(200, #"{"status":"SIGN_UP_REQUIRED"}"#)
    static let noContent = HTTPResponse(status: 204)
    static let badGatewayHTML = HTTPResponse(status: 502, headers: ["Content-Type": "text/html"], body: Data("<html>Bad Gateway</html>".utf8))
}

extension TransportRequest {
    var apiPath: String { url.path.replacingOccurrences(of: "/api/v1", with: "") }
    var jsonBody: [String: Any]? {
        guard let body, let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any] else { return nil }
        return object
    }
}

func makeSession(userId: String = "user-a", access: String = "old-access", refresh: String = "old-refresh") -> AuthSession {
    AuthSession(
        userId: userId,
        accessToken: access,
        accessTokenExpiresAt: t0.addingTimeInterval(600),
        refreshToken: refresh,
        refreshTokenExpiresAt: t0.addingTimeInterval(86_400)
    )
}

/// 실제 APIClient + APIAuthRepository를 가짜 전송·저장소로 조립한다.
struct AuthSUT {
    let repository: APIAuthRepository
    let transport: FakeTransport
    let store: InMemorySessionStore
    let guestFlags: FakeGuestFlagStore
    let caches: RecordingUserCacheClearer
    let events: RecordingAuthEvents
    let clock: TestClock
    let log: CallLog

    init(
        session: AuthSession? = makeSession(),
        guest: Bool = false,
        saveGate: StubbornGate? = nil,
        cacheGate: StubbornGate? = nil,
        handler: @escaping FakeTransport.Handler
    ) throws {
        let log = CallLog()
        let clock = TestClock(now: t0, sleepMode: .immediate)
        let config = try APIConfiguration(serverOrigin: testServerOrigin)
        let transport = FakeTransport(log: log, handler: handler)
        let store = InMemorySessionStore(session, log: log, saveGate: saveGate)
        let events = RecordingAuthEvents()
        let caches = RecordingUserCacheClearer(log: log, gate: cacheGate)
        let guestFlags = FakeGuestFlagStore(guest)
        let refresher = AuthRefresher(configuration: config, transport: transport, store: store, clock: clock, events: events)
        let client = APIClient(configuration: config, transport: transport, store: store, refresher: refresher, clock: clock)
        self.repository = APIAuthRepository(client: client, sessionStore: store, guestFlags: guestFlags, userCaches: caches, clock: clock)
        self.transport = transport
        self.store = store
        self.guestFlags = guestFlags
        self.caches = caches
        self.events = events
        self.clock = clock
        self.log = log
    }
}

extension HTTPResponse {
    /// 공용 fixture(`shared/fixtures/<영역>/<이름>.json`)를 서버 응답으로 쓴다. 상태 코드는 manifest, 본문은 파일에서 읽는다.
    static func fixture(_ name: String) throws -> HTTPResponse {
        let fixture = try Fixture.load(name)
        var headers: [String: String] = fixture.headers
        if !fixture.body.isEmpty, let contentType = fixture.contentType { headers["Content-Type"] = contentType }
        return HTTPResponse(status: try #require(fixture.status), headers: headers, body: fixture.body)
    }
}
