import Foundation
import Synchronization
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

// MARK: 고정 ID (shared/fixtures/README.md §2)

enum FixtureIDs {
    static let myUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    static let otherUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    static let minePost = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!
    static let otherPost = UUID(uuidString: "22222222-2222-4222-8222-222222222202")!
    static let nullThumbnailPost = UUID(uuidString: "22222222-2222-4222-8222-222222222205")!
}

// MARK: Fake 전송

/// 요청을 기록하고 핸들러(요청별)로 응답한다. 실제 네트워크·sleep 없음.
actor FakeFeedTransport: HTTPTransport {
    typealias Handler = @Sendable (TransportRequest, Int) async throws -> HTTPResponse
    private(set) var requests: [TransportRequest] = []
    private let handler: Handler

    init(handler: @escaping Handler) { self.handler = handler }

    /// 항상 같은 fixture 응답.
    init(always fixture: Fixture) {
        let response = fixture.httpResponse
        handler = { _, _ in response }
    }

    /// 순서대로 응답(마지막 응답을 반복).
    init(sequence fixtures: [Fixture]) {
        let responses = fixtures.map(\.httpResponse)
        handler = { _, index in responses[min(index, responses.count - 1)] }
    }

    func send(_ request: TransportRequest) async throws -> HTTPResponse {
        let index = requests.count
        requests.append(request)
        return try await handler(request, index)
    }

    var count: Int { requests.count }
}

extension Fixture {
    /// manifest의 상태·헤더·본문으로 만든 HTTP 응답.
    var httpResponse: HTTPResponse {
        var h = headers
        if let contentType, !h.keys.contains(where: { $0.lowercased() == "content-type" }) { h["Content-Type"] = contentType }
        return HTTPResponse(status: status ?? 200, headers: h, body: body)
    }
}

// MARK: 세션·클라이언트

actor MemorySessionStore: SessionStore {
    private var session: AuthSession?
    init(_ session: AuthSession?) { self.session = session }
    func currentSession() async -> AuthSession? { session }
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

actor CountingAuthEvents: AuthEvents {
    private(set) var count = 0
    func reauthenticationRequired() async { count += 1 }
}

let feedTestEpoch = Date(timeIntervalSince1970: 1_800_000_000)

func feedTestSession(userId: String = FixtureIDs.myUserId) -> AuthSession {
    AuthSession(
        userId: userId, accessToken: "old-access", accessTokenExpiresAt: feedTestEpoch.addingTimeInterval(600),
        refreshToken: "old-refresh", refreshTokenExpiresAt: feedTestEpoch.addingTimeInterval(86_400)
    )
}

struct FeedViewer: ViewerContext {
    var userId: String?
    var isGuest: Bool { userId == nil }
    static let me = FeedViewer(userId: FixtureIDs.myUserId)
    static let guest = FeedViewer(userId: nil)
}

/// 실제 `APIClient` + Fake 전송. 재시도 백오프는 즉시(`TestClock.immediate`)라 기다리지 않고 길이만 `clock.recordedSleeps`에 남는다.
struct FeedSUT {
    let client: APIClient
    let transport: FakeFeedTransport
    let clock: TestClock

    init(transport: FakeFeedTransport, session: AuthSession? = feedTestSession()) throws {
        let config = try APIConfiguration(serverOrigin: "https://api.test")
        let clock = TestClock(now: feedTestEpoch, sleepMode: .immediate)
        let store = MemorySessionStore(session)
        let refresher = AuthRefresher(configuration: config, transport: transport, store: store, clock: clock, events: CountingAuthEvents())
        client = APIClient(configuration: config, transport: transport, store: store, refresher: refresher, clock: clock)
        self.transport = transport
        self.clock = clock
    }

    init(always fixture: Fixture, session: AuthSession? = feedTestSession()) throws {
        try self.init(transport: FakeFeedTransport(always: fixture), session: session)
    }

    func posts(viewer: FeedViewer = .me) -> APIPostRepository { APIPostRepository(client: client, viewer: viewer) }
    var likes: APILikeRepository { APILikeRepository(client: client) }
    var topics: APITopicRepository { APITopicRepository(client: client) }
}

extension TransportRequest {
    var queryDictionary: [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first })
    }
}

extension Fixture {
    /// manifest의 method·path가 요청과 같은가(경로는 `/api/v1` 포함 전체).
    func matches(_ request: TransportRequest) -> Bool {
        request.method.rawValue == method && request.url.path == path
    }
}

/// 던진 오류가 `FeedFailure`인지 확인하고 돌려준다.
func feedFailure(_ body: () async throws -> some Any, sourceLocation: SourceLocation = #_sourceLocation) async -> FeedFailure? {
    do {
        _ = try await body()
        Issue.record("오류가 나야 한다", sourceLocation: sourceLocation)
        return nil
    } catch let failure as FeedFailure {
        return failure
    } catch {
        Issue.record("FeedFailure가 아닌 오류: \(error)", sourceLocation: sourceLocation)
        return nil
    }
}

func day(_ y: Int, _ m: Int, _ d: Int) -> KSTDate { KSTDate(year: y, month: m, day: d)! }

// MARK: 응답 보조

let refreshSuccess = HTTPResponse(
    status: 200, headers: ["Content-Type": "application/json"],
    body: Data(#"{"accessToken":"new-access","expiresIn":900,"refreshToken":"new-refresh","refreshTokenExpiresIn":2592000}"#.utf8)
)

func jsonResponse(_ status: Int, _ body: String, headers: [String: String] = [:]) -> HTTPResponse {
    var h = headers
    h["Content-Type"] = "application/json"
    return HTTPResponse(status: status, headers: h, body: Data(body.utf8))
}

/// 200 JSON 본문을 그대로 돌려주는 임시 응답(본문을 변형해 계약 위반을 만들 때).
func fixtureResponse(_ body: Data) -> FakeFeedTransport {
    FakeFeedTransport { _, _ in HTTPResponse(status: 200, headers: ["Content-Type": "application/json"], body: body) }
}

extension Fixture {
    /// 본문 JSON의 최상위 키(오류 본문 `message`, 응답 `title` 등)를 던지지 않고 읽는다.
    var errorMessage: String? { (try? object())?["message"] as? String }
    func string(_ key: String) -> String? { (try? object())?[key] as? String }
    func int(_ key: String) -> Int? { (try? object())?[key] as? Int }
}
