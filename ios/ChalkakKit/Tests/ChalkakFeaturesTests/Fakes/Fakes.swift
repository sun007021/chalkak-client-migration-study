import Foundation
import Synchronization
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

/// 테스트가 풀어 주는 멈춤 지점. 기본은 취소에 협조(기다리는 중 취소되면 CancellationError)하고,
/// `ignoringCancellation`이면 취소와 무관하게 열릴 때까지 기다린다(늦게 도착한 응답을 흉내).
final class Hold: Sendable {
    private let cooperative: CancellableGate?
    private let stubborn: StubbornGate?

    init(ignoringCancellation: Bool = false) {
        cooperative = ignoringCancellation ? nil : CancellableGate()
        stubborn = ignoringCancellation ? StubbornGate() : nil
    }

    func wait() async throws {
        if let cooperative { try await cooperative.wait() } else { await stubborn?.wait() }
    }

    func open() async {
        await cooperative?.open()
        await stubborn?.open()
    }
}

// MARK: - 인증 저장소

actor FakeAuthRepository: AuthRepository {
    struct LoginCall: Sendable, Equatable {
        let idToken: String
        let rawNonce: String
    }

    private var loginResults: [Result<SocialLoginOutcome, any Error>]
    private var withdrawResults: [Result<Void, any Error>]
    private let loginHold: Hold?
    private let logoutLocalHold: Hold?
    private let sendLogoutHold: Hold?
    private let withdrawHold: Hold?
    private let enterGuestError: (any Error)?
    private let exitGuestError: (any Error)?

    /// 각 호출에 진입할 때 알린다. 테스트가 이것으로 "진행 중" 시점을 기다린다.
    let loginEntered = CallSignal()
    let logoutLocalEntered = CallSignal()
    let sendLogoutEntered = CallSignal()
    let sendLogoutFinished = CallSignal()
    let withdrawEntered = CallSignal()

    private(set) var loginCalls: [LoginCall] = []
    private(set) var logoutLocalCount = 0
    private(set) var sendLogoutCount = 0
    private(set) var sendLogoutWasCancelled = false
    private(set) var withdrawCount = 0
    private(set) var enterGuestCount = 0
    private(set) var exitGuestCount = 0

    init(
        loginResults: [Result<SocialLoginOutcome, any Error>] = [.success(.loggedIn(userId: "user-1"))],
        withdrawResults: [Result<Void, any Error>] = [.success(())],
        loginHold: Hold? = nil,
        logoutLocalHold: Hold? = nil,
        sendLogoutHold: Hold? = nil,
        withdrawHold: Hold? = nil,
        enterGuestError: (any Error)? = nil,
        exitGuestError: (any Error)? = nil
    ) {
        self.loginResults = loginResults
        self.withdrawResults = withdrawResults
        self.loginHold = loginHold
        self.logoutLocalHold = logoutLocalHold
        self.sendLogoutHold = sendLogoutHold
        self.withdrawHold = withdrawHold
        self.enterGuestError = enterGuestError
        self.exitGuestError = exitGuestError
    }

    func socialLogin(idToken: String, rawNonce: String) async throws -> SocialLoginOutcome {
        loginCalls.append(LoginCall(idToken: idToken, rawNonce: rawNonce))
        await loginEntered.fire()
        try await loginHold?.wait()
        guard !loginResults.isEmpty else { return .loggedIn(userId: "user-1") }
        return try loginResults.removeFirst().get()
    }

    func logoutLocally() async -> PendingServerLogout? {
        logoutLocalCount += 1
        await logoutLocalEntered.fire()
        try? await logoutLocalHold?.wait()
        return PendingServerLogout(refreshToken: "RT")
    }

    func sendLogout(_ pending: PendingServerLogout) async {
        sendLogoutCount += 1
        await sendLogoutEntered.fire()
        do { try await sendLogoutHold?.wait() } catch { sendLogoutWasCancelled = true }
        await sendLogoutFinished.fire()
    }

    func withdraw() async throws {
        withdrawCount += 1
        await withdrawEntered.fire()
        try await withdrawHold?.wait()
        guard !withdrawResults.isEmpty else { return }
        try withdrawResults.removeFirst().get()
    }

    func enterGuestMode() async throws {
        enterGuestCount += 1
        if let enterGuestError { throw enterGuestError }
    }

    func exitGuestMode() async throws {
        exitGuestCount += 1
        if let exitGuestError { throw exitGuestError }
    }
}

actor RecordingUserCaches: UserCacheClearing {
    private(set) var count = 0
    func clearUserCaches() async { count += 1 }
}

actor RecordingPushRegistration: PushRegistrationTrigger {
    private(set) var count = 0
    func registerDevice() async { count += 1 }
}

// MARK: - 소셜 로그인

actor FakeSocialLoginClient: SocialLoginClient {
    private var results: [Result<KakaoCredential, any Error>]
    private let hold: Hold?
    let entered = CallSignal()
    private(set) var hashedNonces: [String] = []

    init(results: [Result<KakaoCredential, any Error>] = [.success(KakaoCredential(idToken: "ID-1"))], hold: Hold? = nil) {
        self.results = results
        self.hold = hold
    }

    func authenticate(hashedNonce: String) async throws -> KakaoCredential {
        hashedNonces.append(hashedNonce)
        await entered.fire()
        try await hold?.wait()
        guard !results.isEmpty else { return KakaoCredential(idToken: "ID-n") }
        return try results.removeFirst().get()
    }
}

actor FakeKakaoGateway: KakaoSDKGateway {
    private let talkAvailable: Bool
    private let talkResult: Result<String?, any Error>
    private let accountResult: Result<String?, any Error>
    private(set) var calls: [String] = []

    init(
        talkAvailable: Bool = true,
        talkResult: Result<String?, any Error> = .success("TALK-ID"),
        accountResult: Result<String?, any Error> = .success("ACCOUNT-ID")
    ) {
        self.talkAvailable = talkAvailable
        self.talkResult = talkResult
        self.accountResult = accountResult
    }

    func isTalkLoginAvailable() async -> Bool { talkAvailable }
    func loginWithTalk(hashedNonce: String) async throws -> String? {
        calls.append("talk:\(hashedNonce)")
        return try talkResult.get()
    }
    func loginWithAccount(hashedNonce: String) async throws -> String? {
        calls.append("account:\(hashedNonce)")
        return try accountResult.get()
    }
}

/// 호출마다 다른 32바이트(카운터)를 주는 난수원.
final class SequenceRandomBytes: RandomBytesSource, Sendable {
    private let counter = Mutex(0)
    func randomBytes(count: Int) -> [UInt8] {
        let value = counter.withLock { c -> Int in
            c += 1
            return c
        }
        return (0..<count).map { UInt8(truncatingIfNeeded: value &* 31 &+ $0) }
    }
}

struct FixedRandomBytes: RandomBytesSource {
    let byte: UInt8
    func randomBytes(count: Int) -> [UInt8] { [UInt8](repeating: byte, count: count) }
}

/// 입력을 기록하고 항상 0xAB 32바이트를 돌려준다.
final class RecordingHasher: SHA256Hashing, Sendable {
    private let inputs = Mutex<[[UInt8]]>([])
    var recordedInputs: [[UInt8]] { inputs.withLock { $0 } }
    func sha256(_ bytes: [UInt8]) -> [UInt8] {
        inputs.withLock { $0.append(bytes) }
        return [UInt8](repeating: 0xAB, count: 32)
    }
}

func hex(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02x", $0) }.joined() }

// MARK: - 시작 흐름

actor FakeSessionResolver: SessionResolving {
    private let result: AuthGateResult
    private(set) var count = 0
    init(_ result: AuthGateResult) { self.result = result }
    func resolve() async -> AuthGateResult {
        count += 1
        return result
    }
}

/// 결과를 순서대로 돌려준다. `hold`가 있으면 열릴 때까지 `evaluate`가 멈춘다.
actor FakeVersionGate: VersionGating {
    private var results: [VersionGateResult]
    private let hold: Hold?
    let entered = CallSignal()
    private(set) var count = 0
    init(_ results: [VersionGateResult] = [.passed], hold: Hold? = nil) {
        self.results = results
        self.hold = hold
    }
    func evaluate() async -> VersionGateResult {
        count += 1
        await entered.fire()
        try? await hold?.wait()
        return results.count > 1 ? results.removeFirst() : (results.first ?? .passed)
    }
}

actor FakeHomePreloader: HomePreloading {
    private let hold: Hold?
    private let error: (any Error)?
    let entered = CallSignal()
    private(set) var accesses: [MainAccess] = []
    init(hold: Hold? = nil, error: (any Error)? = nil) {
        self.hold = hold
        self.error = error
    }
    func preload(access: MainAccess) async throws {
        accesses.append(access)
        await entered.fire()
        try await hold?.wait()
        if let error { throw error }
    }
}

actor FakeStoreOpener: StoreOpening {
    private(set) var count = 0
    func openStore() async { count += 1 }
}

struct LookupFailure: Error {}

/// 순서대로 응답하는 스토어 조회.
actor ScriptedLookup: StoreVersionLookup {
    private var steps: [Result<String?, any Error>]
    private(set) var count = 0
    init(_ steps: [Result<String?, any Error>]) { self.steps = steps }
    func latestVersion() async throws -> String? {
        count += 1
        guard !steps.isEmpty else { throw LookupFailure() }
        return try (steps.count > 1 ? steps.removeFirst() : steps[0]).get()
    }
}

/// 테스트가 직접 풀어 주는 스토어 조회. 기다리는 중 취소되면 취소를 기록한다. `ignoringCancellation`이면 취소를 무시하고 응답을 기다린다.
actor ControllableLookup: StoreVersionLookup {
    private let hold: Hold
    private var value: String?
    let entered = CallSignal()
    let cancelled = CallSignal()
    private(set) var wasCancelled = false

    init(ignoringCancellation: Bool = false) { hold = Hold(ignoringCancellation: ignoringCancellation) }

    func latestVersion() async throws -> String? {
        await entered.fire()
        do { try await hold.wait() } catch {
            wasCancelled = true
            await cancelled.fire()
            throw error
        }
        return value
    }
    func respond(with version: String?) async {
        value = version
        await hold.open()
    }
}

// MARK: - 분석

final class RecordingAnalytics: AnalyticsTracker, Sendable {
    private let storage = Mutex<[AnalyticsEvent]>([])
    var events: [AnalyticsEvent] { storage.withLock { $0 } }
    func track(_ event: AnalyticsEvent) throws { storage.withLock { $0.append(event) } }
}
