import Foundation
import Synchronization
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport

/// 사인 PNG 대용 바이트(PNG 시그니처 + 임의 본문). 저장소는 내용을 해석하지 않는다.
let testPNG = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5])

let signUpUploadsRoute = "POST /auth/social-signup/signature/uploads"
let signUpConfirmRoute = "POST /auth/social-signup"
let signUpPutRoute = "PUT /__upload/55555555-5555-4555-8555-555555555512"
let changeUploadsRoute = "POST /users/me/signature/uploads"
let changePutRoute = "PUT /__upload/55555555-5555-4555-8555-555555555521"
let changeConfirmRoute = "PUT /users/me/signature"
let signatureGetRoute = "GET /users/me/signature"

/// "METHOD /path" 키로 응답을 순서대로 돌려주는 가짜 서버. 대본이 끝나면 마지막 응답을 반복한다.
/// 경로가 없으면 전송 오류를 던진다(테스트가 놓친 호출이 조용히 성공하지 않게).
final class RouteScript: Sendable {
    private struct Entry: Sendable {
        var queue: [Result<HTTPResponse, TransportError>]
        let cooperativeGate: CancellableGate?
        let stubbornGate: StubbornGate?
        let entered: CallSignal
    }

    private let routes = Mutex<[String: Entry]>([:])

    @discardableResult
    func on(_ key: String, _ responses: [HTTPResponse], gate: CancellableGate? = nil, stubbornGate: StubbornGate? = nil) -> Self {
        routes.withLock {
            $0[key] = Entry(queue: responses.map { .success($0) }, cooperativeGate: gate, stubbornGate: stubbornGate, entered: CallSignal())
        }
        return self
    }

    @discardableResult
    func on(_ key: String, _ response: HTTPResponse, gate: CancellableGate? = nil, stubbornGate: StubbornGate? = nil) -> Self {
        on(key, [response], gate: gate, stubbornGate: stubbornGate)
    }

    @discardableResult
    func on(_ key: String, fixture name: String, gate: CancellableGate? = nil, stubbornGate: StubbornGate? = nil) throws -> Self {
        on(key, try HTTPResponse.fixture(name), gate: gate, stubbornGate: stubbornGate)
    }

    @discardableResult
    func on(_ key: String, fixtures names: [String]) throws -> Self {
        on(key, try names.map { try HTTPResponse.fixture($0) })
    }

    @discardableResult
    func fail(_ key: String, _ error: TransportError) -> Self {
        routes.withLock {
            $0[key] = Entry(queue: [.failure(error)], cooperativeGate: nil, stubbornGate: nil, entered: CallSignal())
        }
        return self
    }

    /// 그 경로의 요청이 들어올 때마다 올라가는 신호.
    func entered(_ key: String) -> CallSignal? { routes.withLock { $0[key]?.entered } }

    func respond(to request: TransportRequest) async throws -> HTTPResponse {
        let key = "\(request.method.rawValue) \(request.apiPath)"
        let step = routes.withLock { routes -> (Result<HTTPResponse, TransportError>, CancellableGate?, StubbornGate?, CallSignal)? in
            guard var entry = routes[key], !entry.queue.isEmpty else { return nil }
            let result = entry.queue.count > 1 ? entry.queue.removeFirst() : entry.queue[0]
            routes[key] = entry
            return (result, entry.cooperativeGate, entry.stubbornGate, entry.entered)
        }
        guard let (result, cooperativeGate, stubbornGate, entered) = step else { throw TransportError.other("대본에 없는 요청: \(key)") }
        await entered.fire()
        try await cooperativeGate?.wait()
        await stubbornGate?.wait()
        return try result.get()
    }

    /// 가입 성공 경로(발급 200 → PUT 200 → 확정 200).
    static func signUpHappyPath() throws -> RouteScript {
        try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixture: "onboarding/signup__success.json")
    }

    /// 사인 변경 성공 경로.
    static func changeHappyPath() throws -> RouteScript {
        try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-success.json")
    }
}

extension FakeTransport {
    /// 지금까지 나간 요청을 "METHOD /path"로.
    func sequence() -> [String] {
        requests.map { "\($0.method.rawValue) \($0.apiPath)" }
    }
    func count(of key: String) -> Int {
        sequence().filter { $0 == key }.count
    }
    func requests(key: String) -> [TransportRequest] {
        requests.filter { "\($0.method.rawValue) \($0.apiPath)" == key }
    }
}

extension TransportRequest {
    var bodyKeys: Set<String> { Set(jsonBody?.keys.map { $0 } ?? []) }
}

/// 실제 `APIClient` + 가입·사인 저장소를 가짜 전송·저장소로 조립한다. 업로드 URL은 fixture의 loopback http를 허용한다.
struct SignatureSUT {
    let signUpRepository: APISignUpRepository
    let signatureRepository: APISignatureRepository
    let auth: APIAuthRepository
    let script: RouteScript
    let transport: FakeTransport
    let store: InMemorySessionStore
    let guestFlags: FakeGuestFlagStore
    let events: RecordingAuthEvents
    let clock: TestClock
    let log: CallLog

    init(
        script: RouteScript,
        session: AuthSession? = nil,
        guest: Bool = false,
        sleepMode: TestClock.SleepMode = .immediate,
        saveGate: StubbornGate? = nil
    ) throws {
        let log = CallLog()
        let clock = TestClock(now: t0, sleepMode: sleepMode)
        let config = try APIConfiguration(serverOrigin: testServerOrigin, allowInsecureLoopback: true)
        let transport = FakeTransport(log: log) { request, _ in try await script.respond(to: request) }
        let store = InMemorySessionStore(session, log: log, saveGate: saveGate)
        let events = RecordingAuthEvents()
        let caches = RecordingUserCacheClearer(log: log)
        let guestFlags = FakeGuestFlagStore(guest)
        let refresher = AuthRefresher(configuration: config, transport: transport, store: store, clock: clock, events: events)
        let client = APIClient(configuration: config, transport: transport, store: store, refresher: refresher, clock: clock)
        let auth = APIAuthRepository(client: client, sessionStore: store, guestFlags: guestFlags, userCaches: caches, clock: clock)
        self.auth = auth
        self.signUpRepository = APISignUpRepository(client: client, sessionStore: store, guestFlags: guestFlags, authRepository: auth, clock: clock)
        self.signatureRepository = APISignatureRepository(client: client, sessionStore: store)
        self.script = script
        self.transport = transport
        self.store = store
        self.guestFlags = guestFlags
        self.events = events
        self.clock = clock
        self.log = log
    }

    func signUp(idToken: String = "ID-1", rawNonce: String = "RAW-1", png: Data = testPNG) async throws -> SignUpResult {
        try await signUpRepository.signUp(idToken: idToken, rawNonce: rawNonce, signaturePNG: png)
    }
}

/// fixture의 상태·본문을 `APIError`로(실제 파서와 같은 경로).
func apiError(fixture name: String) throws -> APIError {
    let fixture = try Fixture.load(name)
    guard let status = fixture.status else { throw FixtureError.malformed("\(name): status 없음") }
    return ErrorResponseParser.parse(status: status, body: fixture.body)
}

/// fixture 본문의 `message`.
func fixtureMessage(_ name: String) throws -> String? {
    try Fixture.load(name).object()["message"] as? String
}
