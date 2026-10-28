import Foundation
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// 설정(SET)·피드백(FDBK) ViewModel 테스트용 Fake.

/// 호출 순서대로 응답한다(마지막 단계를 반복). 각 단계는 `hold`로 멈출 수 있다.
struct Step<Value: Sendable>: Sendable {
    let result: Result<Value, any Error>
    let hold: Hold?
    static func ok(_ value: Value, hold: Hold? = nil) -> Step { Step(result: .success(value), hold: hold) }
    static func fail(_ error: any Error, hold: Hold? = nil) -> Step { Step(result: .failure(error), hold: hold) }
}

actor FakeNotificationSettingsRepository: NotificationSettingsRepository {
    struct Update: Sendable, Equatable {
        let kind: NotificationSettingKind
        let enabled: Bool
    }

    private var fetchSteps: [Step<NotificationSettings>]
    private var updateSteps: [NotificationSettingKind: [Step<Void>]] = [:]
    private var updateCounts: [NotificationSettingKind: Int] = [:]
    let fetchEntered = CallSignal()
    let updateEntered = CallSignal()
    private(set) var fetchCount = 0
    private(set) var updates: [Update] = []

    init(fetch: [Step<NotificationSettings>] = [.ok(NotificationSettings(topic: true, moderation: true, aiReview: true))]) {
        fetchSteps = fetch
    }

    func setFetch(_ steps: [Step<NotificationSettings>]) { fetchSteps = steps }
    func setUpdate(_ steps: [Step<Void>], for kind: NotificationSettingKind) { updateSteps[kind] = steps }

    func fetch() async throws -> NotificationSettings {
        let index = fetchCount
        fetchCount += 1
        await fetchEntered.fire()
        let step = fetchSteps[min(index, fetchSteps.count - 1)]
        try await step.hold?.wait()
        return try step.result.get()
    }

    func update(_ kind: NotificationSettingKind, enabled: Bool) async throws {
        updates.append(Update(kind: kind, enabled: enabled))
        let index = updateCounts[kind, default: 0]
        updateCounts[kind] = index + 1
        await updateEntered.fire()
        guard let steps = updateSteps[kind], !steps.isEmpty else { return }
        let step = steps[min(index, steps.count - 1)]
        try await step.hold?.wait()
        try step.result.get()
    }
}

actor FakePushAuthorization: PushAuthorizationProviding {
    private var current: PushAuthorizationStatus
    private let grantsRequest: Bool
    private(set) var statusCount = 0
    private(set) var requestCount = 0
    /// 다음 `status()` 한 번만 멈춘다(권한 확인 중 경합을 만들 때).
    private var nextStatusHold: Hold?
    let statusEntered = CallSignal()

    init(_ status: PushAuthorizationStatus = .authorized, grantsRequest: Bool = true) {
        current = status
        self.grantsRequest = grantsRequest
    }

    func set(_ status: PushAuthorizationStatus) { current = status }

    /// 다음 `status()` 호출 하나를 `hold`가 열릴 때까지 멈춘다. 멈추는 동안 값은 호출 시점의 상태로 고정된다.
    func holdNextStatus(_ hold: Hold) { nextStatusHold = hold }

    func status() async -> PushAuthorizationStatus {
        statusCount += 1
        let snapshot = current
        await statusEntered.fire()
        if let hold = nextStatusHold {
            nextStatusHold = nil
            try? await hold.wait()
        }
        return snapshot
    }

    func requestAuthorization() async -> Bool {
        requestCount += 1
        if grantsRequest { current = .authorized }
        return grantsRequest
    }
}

actor RecordingSystemSettings: SystemSettingsOpening {
    private(set) var openCount = 0
    func openNotificationSettings() async { openCount += 1 }
}

actor FakeFeedbackRepository: FeedbackRepository {
    private var steps: [Step<FeedbackReceipt>]
    let entered = CallSignal()
    private(set) var contents: [String] = []

    static let receipt = FeedbackReceipt(
        feedbackId: UUID(uuidString: "12121212-1212-4121-8121-121212121201")!,
        createdAt: Instant.parse("2026-10-27T03:00:00Z")!
    )

    init(_ steps: [Step<FeedbackReceipt>] = [.ok(FakeFeedbackRepository.receipt)]) {
        self.steps = steps
    }

    func submit(content: String) async throws -> FeedbackReceipt {
        let index = contents.count
        contents.append(content)
        await entered.fire()
        let step = steps[min(index, steps.count - 1)]
        try await step.hold?.wait()
        return try step.result.get()
    }
}

extension APIError {
    static let serverError = APIError.http(status: 500, code: .internalError, message: "서버 원문")
}

let settingsUserA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
let settingsUserB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
let allOn = NotificationSettings(topic: true, moderation: true, aiReview: true)
let signatureThumbURL = URL(string: "https://cdn.example.test/settings/thumbnail.png")!
let signatureOriginalURL = URL(string: "https://cdn.example.test/settings/original.png")!

func signatureLookup(_ thumbnail: URL? = signatureThumbURL) -> Step<SignatureLookup> {
    .ok(.registered(UserSignature(originalImageURL: signatureOriginalURL, thumbnailImageURL: thumbnail)))
}

/// 설정 ViewModel 하나와 그 의존성 묶음. `signatures`는 사인 조회 응답을 호출 순서대로 준다.
@MainActor
struct SettingsWorld {
    let repo: FakeNotificationSettingsRepository
    let signatureRepo: FakeSignatureRepository
    let auth = FakeAuthRepository()
    let permission: FakePushAuthorization
    let systemSettings = RecordingSystemSettings()
    let opener = FakeExternalOpener()
    let toast = RecordingToast()
    let analytics = RecordingAnalytics()
    let viewer: MutableViewer
    let vm: SettingsViewModel

    init(
        guest: Bool = false,
        fetch: [Step<NotificationSettings>] = [.ok(allOn)],
        signatures: [Result<SignatureLookup, any Error>] = [.success(.registered(UserSignature(originalImageURL: signatureOriginalURL, thumbnailImageURL: signatureThumbURL)))],
        signatureHolds: [Hold?] = [],
        permission status: PushAuthorizationStatus = .authorized,
        appVersion: String = "1.2.3",
        documentURLs: [LegalDocument: String]? = nil
    ) {
        let access: MainAccess = guest ? .guest : .member
        repo = FakeNotificationSettingsRepository(fetch: fetch)
        signatureRepo = FakeSignatureRepository(lookupResults: signatures, lookupHolds: signatureHolds)
        permission = FakePushAuthorization(status)
        viewer = MutableViewer(userId: guest ? nil : settingsUserA)
        vm = SettingsViewModel(
            access: access, viewer: viewer, repository: repo,
            signature: SignatureCardViewModel(access: access, repository: signatureRepo),
            account: AccountSessionViewModel(authRepository: auth),
            permission: permission, systemSettings: systemSettings, externalOpener: opener,
            toast: toast, screens: ScreenTracker(tracker: analytics), appVersion: appVersion, documentURLs: documentURLs
        )
    }

    /// 푸시 조회까지 끝낸 상태로 시작한다.
    func loaded() async {
        await vm.screenAppeared()
    }

    func values() -> [Bool?] { NotificationSettingKind.allCases.map(vm.pushValue) }
}
