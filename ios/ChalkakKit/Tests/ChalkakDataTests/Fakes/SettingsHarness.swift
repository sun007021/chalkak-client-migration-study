import Foundation
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport

// 푸시 수신 설정(SET)·피드백(FDBK) 저장소 테스트용 하네스. RouteScript(SignUpHarness.swift)로 "METHOD /path" 단위 대본을 쓴다.

let notificationSettingsGet = "GET /notification-settings"
let notificationSettingsPatch = "PATCH /notification-settings"
let feedbackPost = "POST /feedbacks"

/// 실제 `APIClient` + 설정·피드백 저장소를 가짜 전송·저장소로 조립한다. 재시도 백오프는 즉시(`TestClock.immediate`)라 기다리지 않고 길이만 `clock.recordedSleeps`에 남는다.
struct SettingsSUT {
    let notifications: APINotificationSettingsRepository
    let feedback: APIFeedbackRepository
    let script: RouteScript
    let transport: FakeTransport
    let store: InMemorySessionStore
    let events: RecordingAuthEvents
    let clock: TestClock

    init(script: RouteScript, session: AuthSession? = makeSession()) throws {
        let clock = TestClock(now: t0, sleepMode: .immediate)
        let config = try APIConfiguration(serverOrigin: testServerOrigin)
        let transport = FakeTransport { request, _ in try await script.respond(to: request) }
        let store = InMemorySessionStore(session)
        let events = RecordingAuthEvents()
        let refresher = AuthRefresher(configuration: config, transport: transport, store: store, clock: clock, events: events)
        let client = APIClient(configuration: config, transport: transport, store: store, refresher: refresher, clock: clock)
        self.notifications = APINotificationSettingsRepository(client: client)
        self.feedback = APIFeedbackRepository(client: client)
        self.script = script
        self.transport = transport
        self.store = store
        self.events = events
        self.clock = clock
    }
}
