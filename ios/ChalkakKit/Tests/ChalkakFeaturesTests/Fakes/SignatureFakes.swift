import Foundation
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

let testPNG = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3])

// MARK: 가입

actor FakeSignUpRepository: SignUpRepository {
    struct Call: Sendable, Equatable {
        let idToken: String
        let rawNonce: String
        let png: Data
    }

    private var results: [Result<SignUpResult, any Error>]
    private let hold: Hold?
    let entered = CallSignal()
    private(set) var calls: [Call] = []

    init(results: [Result<SignUpResult, any Error>] = [.success(SignUpResult(userId: "user-1", wasExistingAccount: false))], hold: Hold? = nil) {
        self.results = results
        self.hold = hold
    }

    func signUp(idToken: String, rawNonce: String, signaturePNG: Data) async throws -> SignUpResult {
        calls.append(Call(idToken: idToken, rawNonce: rawNonce, png: signaturePNG))
        await entered.fire()
        try await hold?.wait()
        guard !results.isEmpty else { return SignUpResult(userId: "user-1", wasExistingAccount: false) }
        return try (results.count > 1 ? results.removeFirst() : results[0]).get()
    }
}

// MARK: 사인 조회·변경

actor FakeSignatureRepository: SignatureRepository {
    private var lookupResults: [Result<SignatureLookup, any Error>]
    private var changeResults: [Result<Void, any Error>]
    private let lookupHold: Hold?
    private let changeHold: Hold?
    let lookupEntered = CallSignal()
    let changeEntered = CallSignal()
    private(set) var lookupCount = 0
    private(set) var changeCalls: [Data] = []

    init(
        lookupResults: [Result<SignatureLookup, any Error>] = [.success(.registrationRequired)],
        changeResults: [Result<Void, any Error>] = [.success(())],
        lookupHold: Hold? = nil,
        changeHold: Hold? = nil
    ) {
        self.lookupResults = lookupResults
        self.changeResults = changeResults
        self.lookupHold = lookupHold
        self.changeHold = changeHold
    }

    func currentSignature() async throws -> SignatureLookup {
        lookupCount += 1
        await lookupEntered.fire()
        try await lookupHold?.wait()
        guard !lookupResults.isEmpty else { return .registrationRequired }
        return try (lookupResults.count > 1 ? lookupResults.removeFirst() : lookupResults[0]).get()
    }

    func changeSignature(png: Data) async throws {
        changeCalls.append(png)
        await changeEntered.fire()
        try await changeHold?.wait()
        guard !changeResults.isEmpty else { return }
        try (changeResults.count > 1 ? changeResults.removeFirst() : changeResults[0]).get()
    }
}

// MARK: 인코더·외부 열기

actor FakeSignatureEncoder: SignatureImageEncoder {
    private let byteCount: Int
    private let hold: Hold?
    let entered = CallSignal()
    private(set) var plans: [SignatureRenderPlan] = []

    init(byteCount: Int = 100, hold: Hold? = nil) {
        self.byteCount = byteCount
        self.hold = hold
    }

    func encodePNG(_ plan: SignatureRenderPlan) async throws -> Data {
        plans.append(plan)
        await entered.fire()
        try await hold?.wait()
        return Data(repeating: 7, count: byteCount)
    }
}

actor FakeExternalOpener: ExternalURLOpening {
    private let succeeds: Bool
    private(set) var opened: [URL] = []
    init(succeeds: Bool = true) { self.succeeds = succeeds }
    func open(_ url: URL) async -> Bool {
        opened.append(url)
        return succeeds
    }
}

// MARK: 도우미

/// fixture의 상태·본문을 `APIError`로(실제 파서와 같은 경로).
func apiError(fixture name: String) throws -> APIError {
    let fixture = try Fixture.load(name)
    guard let status = fixture.status else { throw FixtureError.malformed("\(name): status 없음") }
    return ErrorResponseParser.parse(status: status, body: fixture.body)
}

let testContext = SignUpContext(idToken: "ID-ctx", rawNonce: "RAW-ctx")

extension SignaturePreviewState {
    var notice: Notice? {
        switch self {
        case .failed(let notice): notice
        case .finished(.returnToDrawing(let notice)), .finished(.loginRequired(let notice)), .finished(.changed(let notice)): notice
        default: nil
        }
    }
    var message: String? { notice?.message }
}

func copy(_ key: String) throws -> String { try SharedCopy.require(key) }
