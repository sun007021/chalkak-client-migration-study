import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport
@testable import ChalkakData

@Suite("SIGN 사인 조회·변경 저장소", .timeLimit(.minutes(1)))
struct SignatureRepositoryTests {
    private static let original = URL(string: "https://cdn.example.test/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/signature/original.png")!
    private static let thumbnail = URL(string: "https://cdn.example.test/users/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/signature/thumbnail.png")!
    private static let uploadId = "55555555-5555-4555-8555-555555555521"

    private func sut(_ script: RouteScript, session: AuthSession? = makeSession(), sleepMode: TestClock.SleepMode = .immediate) throws -> SignatureSUT {
        try SignatureSUT(script: script, session: session, sleepMode: sleepMode)
    }

    private func change(_ sut: SignatureSUT, png: Data = testPNG) async throws {
        try await sut.signatureRepository.changeSignature(png: png)
    }

    // MARK: 변경 순서·요청 모양

    @Test("TC-SIGN-019 요청 순서는 POST uploads → PUT presigned → PUT /users/me/signature이다")
    func requestOrder() async throws {
        let sut = try sut(.changeHappyPath())
        try await change(sut)
        #expect(await sut.transport.sequence() == [changeUploadsRoute, changePutRoute, changeConfirmRoute])
    }

    @Test("TC-SIGN-019 앞 단계가 실패하면 다음 단계는 0건이다(발급 403)")
    func issueFailureStopsEarly() async throws {
        let script = try RouteScript().on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__forbidden-banned.json")
        let sut = try sut(script)
        await #expect(throws: APIError.self) { try await change(sut) }
        #expect(await sut.transport.sequence() == [changeUploadsRoute])
    }

    @Test("TC-SIGN-020 발급 응답에 contentType·maxBytes가 없어도 오류가 아니다(클라이언트 상수 image/png 사용)")
    func issueResponseWithoutPolicyFields() async throws {
        let sut = try sut(.changeHappyPath())
        try await change(sut)
        let put = try #require(await sut.transport.requests(key: changePutRoute).first)
        #expect(put.header("Content-Type") == "image/png")
        #expect(put.url.absoluteString == "http://localhost:4010/__upload/\(Self.uploadId)?X-Amz-Expires=300")
    }

    @Test("TC-SIGN-021 변경 PUT presigned는 Authorization 없음, Content-Type image/png, 본문은 PNG 바이트이다")
    func presignedPutShape() async throws {
        let sut = try sut(.changeHappyPath())
        try await change(sut, png: testPNG)
        let put = try #require(await sut.transport.requests(key: changePutRoute).first)
        #expect(put.method == .put)
        #expect(put.header("Authorization") == nil)
        #expect(put.header("Content-Type") == "image/png")
        #expect(put.body == testPNG)
    }

    @Test("TC-SIGN-022 확정 바디는 {signatureOriginalUploadId}뿐이고 발급받은 uploadId(소문자)이다")
    func confirmBody() async throws {
        let sut = try sut(.changeHappyPath())
        try await change(sut)
        let confirm = try #require(await sut.transport.requests(key: changeConfirmRoute).first)
        #expect(confirm.bodyKeys == ["signatureOriginalUploadId"])
        #expect(confirm.jsonBody?["signatureOriginalUploadId"] as? String == Self.uploadId)
    }

    @Test("TC-SIGN-019 사인 API 호출(발급·확정)에는 Bearer가 붙는다")
    func apiCallsAreAuthenticated() async throws {
        let sut = try sut(.changeHappyPath(), session: makeSession(access: "AT-9"))
        try await change(sut)
        for key in [changeUploadsRoute, changeConfirmRoute] {
            let request = try #require(await sut.transport.requests(key: key).first)
            #expect(request.header("Authorization") == "Bearer AT-9")
        }
    }

    // MARK: 변경 실패

    @Test("TC-SIGN-023 업로드 PUT이 403이면 확정 호출 0건이고 uploadRejected이다")
    func putFailureSkipsConfirm() async throws {
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__forbidden.json")
        let sut = try sut(script)
        await #expect(throws: SignatureChangeError.uploadRejected(status: 403)) { try await change(sut) }
        #expect(await sut.transport.count(of: changePutRoute) == 1)
        #expect(await sut.transport.count(of: changeConfirmRoute) == 0)
    }

    @Test("TC-SIGN-024 TC-SIGN-028 실패 뒤 다시 시도하면 이전 uploadId를 재사용하지 않고 새 발급부터 시작한다")
    func retryReissuesUpload() async throws {
        let secondId = "55555555-5555-4555-8555-555555555599"
        let script = try RouteScript()
            .on(changeUploadsRoute, [
                try .fixture("signature/users-me-signature-uploads__success.json"),
                .json(200, #"{"uploadId":"\#(secondId)","uploadUrl":"https://upload.test/second","expiresInSeconds":300}"#),
            ])
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on("PUT /second", fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixtures: ["signature/users-me-signature__put-reupload-required.json", "signature/users-me-signature__put-success.json"])
        let sut = try sut(script)
        let expected = try apiError(fixture: "signature/users-me-signature__put-reupload-required.json")
        await #expect(throws: expected) { try await change(sut) }
        try await change(sut)
        #expect(await sut.transport.count(of: changeUploadsRoute) == 2)
        let ids = await sut.transport.requests(key: changeConfirmRoute).map { $0.jsonBody?["signatureOriginalUploadId"] as? String }
        #expect(ids == [Self.uploadId, secondId])
        // REUPLOAD_REQUIRED(400)는 재시도 대상이 아니다.
        #expect(await sut.transport.count(of: changeConfirmRoute) == 2)
    }

    @Test("TC-SIGN-029 TC-SIGN-030 TC-SIGN-031 TC-SIGN-032 확정·발급 오류는 status·errorCode·message를 담아 그대로 던지고 한 번만 요청한다", arguments: [
        ("signature/users-me-signature__put-invalid-signature.json", changeConfirmRoute),
        ("signature/users-me-signature__put-upload-not-found.json", changeConfirmRoute),
        ("signature/users-me-signature__put-forbidden-banned.json", changeConfirmRoute),
        ("signature/users-me-signature-uploads__forbidden-banned.json", changeUploadsRoute),
    ])
    func errorsPassThrough(fixture: String, failing: String) async throws {
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-success.json")
            .on(failing, fixture: fixture)
        let sut = try sut(script)
        let expected = try apiError(fixture: fixture)
        await #expect(throws: expected) { try await change(sut) }
        #expect(await sut.transport.count(of: failing) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-SIGN-030 정지 회원은 발급 403에서 멈추고 이후 요청이 0건이다")
    func bannedStopsAfterIssue() async throws {
        let script = try RouteScript().on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__forbidden-banned.json")
        let sut = try sut(script)
        await #expect(throws: APIError.http(status: 403, code: .forbidden, message: "차단된 회원입니다.")) { try await change(sut) }
        #expect(await sut.transport.sequence() == [changeUploadsRoute])
    }

    // MARK: 401

    @Test("TC-SIGN-033 확정이 401이면 refresh 1회 뒤 원 요청을 1회만 재전송한다")
    func confirmUnauthorizedRefreshesOnce() async throws {
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixtures: ["signature/users-me-signature__put-unauthorized.json", "signature/users-me-signature__put-success.json"])
            .on("POST /auth/refresh", fixture: "auth/refresh__success.json")
        let sut = try sut(script)
        try await change(sut)
        #expect(await sut.transport.count(of: "POST /auth/refresh") == 1)
        #expect(await sut.transport.count(of: changeConfirmRoute) == 2)
    }

    @Test("TC-SIGN-033 refresh가 REAUTHENTICATION_REQUIRED면 재인증 이벤트를 한 번 보내고 401을 던진다")
    func reauthenticationRequired() async throws {
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-unauthorized.json")
            .on("POST /auth/refresh", fixture: "auth/refresh__reauthentication-required.json")
        let sut = try sut(script)
        await #expect(throws: APIError.self) { try await change(sut) }
        #expect(await sut.events.count == 1)
        #expect(await sut.transport.count(of: changeConfirmRoute) == 1)
    }

    // MARK: 재시도(D-21)

    @Test("TC-SIGN-035 업로드 발급(POST)도 멱등이라 500이면 0.5초·1초 백오프로 최대 2회 재시도하고 그래도 실패하면 오류를 던진다")
    func issueRetriesOnServerError() async throws {
        let script = try RouteScript().on(changeUploadsRoute, fixture: "common/error__internal-500.json")
        let sut = try sut(script)
        let expected = try apiError(fixture: "common/error__internal-500.json")
        await #expect(throws: expected) { try await change(sut) }
        #expect(await sut.transport.count(of: changeUploadsRoute) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
        #expect(await sut.transport.count(of: changePutRoute) == 0)
    }

    @Test("TC-SIGN-035 발급이 한 번 500이어도 재시도로 성공하면 이어서 진행한다")
    func issueRecoversAfterRetry() async throws {
        let script = try RouteScript()
            .on(changeUploadsRoute, fixtures: ["common/error__internal-500.json", "signature/users-me-signature-uploads__success.json"])
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-success.json")
        let sut = try sut(script)
        try await change(sut)
        #expect(await sut.transport.count(of: changeUploadsRoute) == 2)
    }

    @Test("TC-SIGN-035 확정 PUT이 500이면 같은 백오프로 최대 2회 재시도한다")
    func confirmRetriesOnServerError() async throws {
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-internal-error.json")
        let sut = try sut(script)
        let expected = try apiError(fixture: "signature/users-me-signature__put-internal-error.json")
        await #expect(throws: expected) { try await change(sut) }
        #expect(await sut.transport.count(of: changeConfirmRoute) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-SIGN-034 네트워크 오류는 재시도 후에도 실패하면 APIError.network이다")
    func networkError() async throws {
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .fail(changeConfirmRoute, .notConnected)
        let sut = try sut(script)
        await #expect(throws: APIError.network) { try await change(sut) }
    }

    // MARK: 취소·계정 전환

    @Test("TC-SIGN-037 PUT 도중 취소되면 확정 호출 0건이고 CancellationError이다")
    func cancelBeforeConfirm() async throws {
        let gate = CancellableGate()
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json", gate: gate)
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-success.json")
        let sut = try sut(script)
        let task = Task { try await change(sut) }
        let signal = try #require(sut.script.entered(changePutRoute))
        guard await EventWait.signal(signal, before: task) else { Issue.record("PUT 요청이 나가야 한다"); return }
        task.cancel()
        let outcome = await task.result
        #expect(outcome.failure is CancellationError)
        #expect(await sut.transport.count(of: changeConfirmRoute) == 0)
    }

    @Test("TC-SIGN-038 변경 중 로그아웃하거나 다른 계정으로 바뀌면 확정 응답을 버리고 CancellationError이다", arguments: [nil, makeSession(userId: "user-b")])
    func accountChangedDuringConfirm(replacement: AuthSession?) async throws {
        let gate = StubbornGate()
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json")
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-success.json", stubbornGate: gate)
        let sut = try sut(script, session: makeSession(userId: "user-a"))
        let task = Task { try await change(sut) }
        let signal = try #require(sut.script.entered(changeConfirmRoute))
        guard await EventWait.signal(signal, before: task) else { Issue.record("확정 요청이 나가야 한다"); return }
        await sut.store.clearSession()
        if let replacement { await sut.store.save(replacement) }
        await gate.open()
        let outcome = await task.result
        #expect(outcome.failure is CancellationError)
    }

    @Test("TC-SIGN-038 PUT 도중 계정이 바뀌면 이전 계정의 uploadId를 확정하지 않는다(확정 호출 0건)", arguments: [nil, makeSession(userId: "user-b")])
    func accountChangedDuringPut(replacement: AuthSession?) async throws {
        let gate = CancellableGate()
        let script = try RouteScript()
            .on(changeUploadsRoute, fixture: "signature/users-me-signature-uploads__success.json")
            .on(changePutRoute, fixture: "signature/presigned-put__ok.json", gate: gate)
            .on(changeConfirmRoute, fixture: "signature/users-me-signature__put-success.json")
        let sut = try sut(script, session: makeSession(userId: "user-a"))
        let task = Task { try await change(sut) }
        let signal = try #require(sut.script.entered(changePutRoute))
        guard await EventWait.signal(signal, before: task) else { Issue.record("PUT 요청이 나가야 한다"); return }
        await sut.store.clearSession()
        if let replacement { await sut.store.save(replacement) }
        await gate.open()
        let outcome = await task.result
        #expect(outcome.failure is CancellationError)
        #expect(await sut.transport.count(of: changeConfirmRoute) == 0)
    }

    // MARK: 조회

    @Test("TC-SIGN-026 GET 성공이면 썸네일이 있으면 썸네일을 쓴다(displayURL)")
    func lookupWithThumbnail() async throws {
        let script = try RouteScript().on(signatureGetRoute, fixture: "signature/users-me-signature__get-success.json")
        let sut = try sut(script)
        let lookup = try await sut.signatureRepository.currentSignature()
        guard case .registered(let signature) = lookup else { Issue.record("registered여야 한다: \(lookup)"); return }
        #expect(signature == UserSignature(originalImageURL: Self.original, thumbnailImageURL: Self.thumbnail))
        #expect(signature.displayURL == Self.thumbnail)
        let request = try #require(await sut.transport.requests(key: signatureGetRoute).first)
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-SIGN-026 썸네일이 null이면 원본 URL을 쓴다")
    func lookupThumbnailNull() async throws {
        let script = try RouteScript().on(signatureGetRoute, fixture: "signature/users-me-signature__get-thumbnail-null.json")
        let sut = try sut(script)
        let lookup = try await sut.signatureRepository.currentSignature()
        guard case .registered(let signature) = lookup else { Issue.record("registered여야 한다: \(lookup)"); return }
        #expect(signature.thumbnailImageURL == nil)
        #expect(signature.displayURL == Self.original)
    }

    @Test("TC-SIGN-040 400 SIGNATURE_REGISTRATION_REQUIRED는 오류가 아니라 registrationRequired이고 재시도하지 않는다")
    func lookupRegistrationRequired() async throws {
        let script = try RouteScript().on(signatureGetRoute, fixture: "signature/users-me-signature__get-registration-required.json")
        let sut = try sut(script)
        #expect(try await sut.signatureRepository.currentSignature() == .registrationRequired)
        #expect(await sut.transport.count(of: signatureGetRoute) == 1)
    }

    @Test("TC-SIGN-039 GET은 정지 여부와 무관하게 성공한다(사인 API 중 GET만 허용)")
    func lookupSucceedsRegardless() async throws {
        let script = try RouteScript().on(signatureGetRoute, fixture: "signature/users-me-signature__get-success.json")
        let sut = try sut(script)
        guard case .registered = try await sut.signatureRepository.currentSignature() else { Issue.record("registered여야 한다"); return }
    }

    @Test("조회 500은 GET이라 최대 2회 재시도 뒤 오류를 던진다")
    func lookupServerErrorRetries() async throws {
        let script = try RouteScript().on(signatureGetRoute, fixture: "signature/users-me-signature__get-internal-error.json")
        let sut = try sut(script)
        let expected = try apiError(fixture: "signature/users-me-signature__get-internal-error.json")
        await #expect(throws: expected) { try await sut.signatureRepository.currentSignature() }
        #expect(await sut.transport.count(of: signatureGetRoute) == 3)
    }

    @Test("조회 401은 refresh 후 1회 재전송한다")
    func lookupUnauthorizedRefreshes() async throws {
        let script = try RouteScript()
            .on(signatureGetRoute, fixtures: ["signature/users-me-signature__get-unauthorized.json", "signature/users-me-signature__get-success.json"])
            .on("POST /auth/refresh", fixture: "auth/refresh__success.json")
        let sut = try sut(script)
        guard case .registered = try await sut.signatureRepository.currentSignature() else { Issue.record("registered여야 한다"); return }
        #expect(await sut.transport.count(of: "POST /auth/refresh") == 1)
        #expect(await sut.transport.count(of: signatureGetRoute) == 2)
    }
}
