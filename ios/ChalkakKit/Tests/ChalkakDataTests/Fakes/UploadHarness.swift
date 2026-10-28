import Foundation
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport

// 사진 업로드(UPL) 저장소 테스트용 하네스. RouteScript(SignUpHarness.swift)로 "METHOD /path" 단위 대본을 쓴다.

let todayRoute = "GET /posts/today"
let issueRoute = "POST /posts/uploads"
let createRoute = "POST /posts"
let refreshRoute = "POST /auth/refresh"
let uploadId1 = UUID(uuidString: "55555555-5555-4555-8555-555555555501")!
let uploadId2 = UUID(uuidString: "55555555-5555-4555-8555-555555555502")!
let putRoute1 = "PUT /__upload/55555555-5555-4555-8555-555555555501"
let putRoute2 = "PUT /__upload/55555555-5555-4555-8555-555555555502"
let topicId27 = UUID(uuidString: "11111111-1111-4111-8111-111111111127")!
let postIdPending = UUID(uuidString: "22222222-2222-4222-8222-222222222201")!

/// upload/posts-uploads__issued.json 과 같은 값.
let issuedPolicy = PostUploadPolicy(
    uploadId: uploadId1,
    uploadUrl: URL(string: "http://localhost:4010/__upload/55555555-5555-4555-8555-555555555501?X-Amz-Expires=300")!,
    expiresInSeconds: 300, contentType: "image/webp", maxBytes: 5_242_880
)

/// WebP 대용 바이트(RIFF/WEBP 머리글 + 임의 본문). 저장소는 내용을 해석하지 않는다.
let testWebP = Data("RIFF".utf8) + Data([0x20, 0, 0, 0]) + Data("WEBP".utf8) + Data([1, 2, 3, 4, 5, 6, 7, 8])

/// 실제 `APIClient` + `APIPostCreationRepository`를 가짜 전송·저장소로 조립한다. 업로드 URL은 fixture의 loopback http를 허용한다.
struct UploadSUT {
    let repository: APIPostCreationRepository
    let today: APITodayPostRepository
    let script: RouteScript
    let transport: FakeTransport
    let store: InMemorySessionStore
    let events: RecordingAuthEvents
    let clock: TestClock

    init(script: RouteScript, session: AuthSession? = makeSession(), clockUptime: Duration = .zero) throws {
        let clock = TestClock(now: t0, uptime: clockUptime, sleepMode: .immediate)
        let config = try APIConfiguration(serverOrigin: testServerOrigin, allowInsecureLoopback: true)
        let transport = FakeTransport { request, _ in try await script.respond(to: request) }
        let store = InMemorySessionStore(session)
        let events = RecordingAuthEvents()
        let refresher = AuthRefresher(configuration: config, transport: transport, store: store, clock: clock, events: events)
        let client = APIClient(configuration: config, transport: transport, store: store, refresher: refresher, clock: clock)
        self.repository = APIPostCreationRepository(client: client)
        self.today = APITodayPostRepository(client: client)
        self.script = script
        self.transport = transport
        self.store = store
        self.events = events
        self.clock = clock
    }

    func create(rawTitle: String = "", topicId: UUID = topicId27, uploadId: UUID = uploadId1) async throws -> CreatedPost {
        try await repository.createPost(topicId: topicId, uploadId: uploadId, rawTitle: rawTitle)
    }
}
