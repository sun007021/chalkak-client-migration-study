import Foundation
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport

/// 호출 순서를 기록한다(로컬 정리가 서버 호출보다 먼저인지 등).
actor CallLog {
    private(set) var events: [String] = []
    func record(_ event: String) { events.append(event) }
    func index(of event: String) -> Int? { events.firstIndex(of: event) }
    func count(of event: String) -> Int { events.filter { $0 == event }.count }
}

actor InMemorySessionStore: SessionStore {
    private var session: AuthSession?
    private let log: CallLog?
    /// 있으면 `save`가 열릴 때까지 멈춘다(저장 도중 취소를 흉내). 취소를 무시한다.
    private let saveGate: StubbornGate?
    /// `save` 진입 때 알린다.
    let saveEntered = CallSignal()
    private(set) var saveCount = 0
    private(set) var clearCount = 0
    private(set) var replaceCount = 0

    init(_ session: AuthSession? = nil, log: CallLog? = nil, saveGate: StubbornGate? = nil) {
        self.session = session
        self.log = log
        self.saveGate = saveGate
    }

    func currentSession() async -> AuthSession? { session }
    func save(_ session: AuthSession) async {
        await saveEntered.fire()
        await saveGate?.wait()
        self.session = session
        saveCount += 1
        await log?.record("store.save")
    }
    func replaceTokens(of expected: AuthSession, with refreshed: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = refreshed
        replaceCount += 1
        return true
    }
    func clearSession(ifMatching expected: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = nil
        clearCount += 1
        await log?.record("store.clear")
        return true
    }
    func clearSession() async {
        session = nil
        clearCount += 1
        await log?.record("store.clear")
    }
}

actor FakeGuestFlagStore: GuestFlagStore {
    struct SaveFailed: Error {}
    private(set) var flag: Bool
    private(set) var setCalls: [Bool] = []
    var failOnSet = false

    init(_ flag: Bool = false) { self.flag = flag }

    func isGuest() async -> Bool { flag }
    func setGuest(_ isGuest: Bool) async throws {
        setCalls.append(isGuest)
        if failOnSet { throw SaveFailed() }
        flag = isGuest
    }
    func setFailOnSet(_ value: Bool) { failOnSet = value }
}

actor RecordingUserCacheClearer: UserCacheClearing {
    private(set) var count = 0
    private let log: CallLog?
    private let gate: StubbornGate?
    let entered = CallSignal()
    init(log: CallLog? = nil, gate: StubbornGate? = nil) {
        self.log = log
        self.gate = gate
    }
    func clearUserCaches() async {
        await entered.fire()
        await gate?.wait()
        count += 1
        await log?.record("cache.clear")
    }
}

actor RecordingAuthEvents: AuthEvents {
    private(set) var count = 0
    func reauthenticationRequired() async { count += 1 }
}

actor FakeTransport: HTTPTransport {
    typealias Handler = @Sendable (TransportRequest, Int) async throws -> HTTPResponse
    private(set) var requests: [TransportRequest] = []
    private let handler: Handler
    private let log: CallLog?
    /// 요청이 기록될 때마다 알린다(핸들러가 멈추기 전).
    let requested = CallSignal()

    init(log: CallLog? = nil, handler: @escaping Handler) {
        self.handler = handler
        self.log = log
    }

    func send(_ request: TransportRequest) async throws -> HTTPResponse {
        let index = requests.count
        requests.append(request)
        await log?.record("http \(request.method.rawValue) \(request.apiPath)")
        await requested.fire()
        return try await handler(request, index)
    }

    var count: Int { requests.count }
    func requests(path: String) -> [TransportRequest] { requests.filter { $0.apiPath == path } }
}
