import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport
@testable import ChalkakData

@Suite("ONB 가입 시퀀스 저장소", .timeLimit(.minutes(1)))
struct SignUpRepositoryTests {
    private static let uploadURLString = "http://localhost:4010/__upload/55555555-5555-4555-8555-555555555512?X-Amz-Expires=300"
    private static let userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

    // MARK: 순서·요청 모양

    @Test("TC-ONB-019 요청 순서는 uploads → PUT presigned → signup이고 추가 호출이 없다")
    func requestOrder() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath())
        let result = try await sut.signUp()
        #expect(await sut.transport.sequence() == [signUpUploadsRoute, signUpPutRoute, signUpConfirmRoute])
        #expect(result == SignUpResult(userId: Self.userId, wasExistingAccount: false))
    }

    @Test("TC-ONB-019 업로드 발급이 실패하면 PUT·signup 호출은 0건이다", arguments: [
        "onboarding/signup-uploads__unauthorized.json", "onboarding/signup-uploads__forbidden-banned.json",
    ])
    func issueFailureStopsEarly(fixture: String) async throws {
        let script = try RouteScript().on(signUpUploadsRoute, fixture: fixture)
        let sut = try SignatureSUT(script: script)
        await #expect(throws: APIError.self) { try await sut.signUp() }
        #expect(await sut.transport.sequence() == [signUpUploadsRoute])
    }

    @Test("TC-ONB-019 PUT가 실패하면 signup 호출은 0건이다")
    func putFailureStopsEarly() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__expired.json")
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.uploadRejected(status: 403)) { try await sut.signUp() }
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 0)
    }

    @Test("TC-ONB-020 업로드 발급 바디는 {provider:KAKAO,idToken,rawNonce}뿐이고 Authorization이 없다(세션이 있어도)")
    func issueRequestBody() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath(), session: makeSession())
        _ = try await sut.signUp(idToken: "ID-X", rawNonce: "RAW-X")
        let request = try #require(await sut.transport.requests(key: signUpUploadsRoute).first)
        #expect(request.bodyKeys == ["provider", "idToken", "rawNonce"])
        #expect(request.jsonBody?["provider"] as? String == "KAKAO")
        #expect(request.jsonBody?["idToken"] as? String == "ID-X")
        #expect(request.jsonBody?["rawNonce"] as? String == "RAW-X")
        #expect(request.bodyKeys.contains("authorizationCode") == false)
        #expect(request.header("Authorization") == nil)
    }

    @Test("TC-ONB-021 발급 응답의 uploadUrl로 PUT하고 signupToken을 확정 요청에 쓴다")
    func issueResponseIsUsed() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath())
        _ = try await sut.signUp()
        let put = try #require(await sut.transport.requests(key: signUpPutRoute).first)
        #expect(put.url.absoluteString == Self.uploadURLString)
        let confirm = try #require(await sut.transport.requests(key: signUpConfirmRoute).first)
        #expect(confirm.jsonBody?["signupToken"] as? String == "fixture-signup-token-1")
    }

    @Test("TC-ONB-021 발급 응답에 signupToken이 없으면 invalidResponse이고 PUT은 0건이다")
    func issueResponseMissingToken() async throws {
        let script = RouteScript().on(signUpUploadsRoute, .json(200, #"{"uploadId":"55555555-5555-4555-8555-555555555512","uploadUrl":"https://upload.test/x","expiresInSeconds":300}"#))
        let sut = try SignatureSUT(script: script)
        await #expect(throws: APIError.invalidResponse) { try await sut.signUp() }
        #expect(await sut.transport.sequence() == [signUpUploadsRoute])
    }

    @Test("TC-ONB-022 PUT는 Content-Type image/png, Authorization 없음, 본문은 PNG 바이트 전체이다")
    func presignedPutShape() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath(), session: makeSession())
        _ = try await sut.signUp(png: testPNG)
        let put = try #require(await sut.transport.requests(key: signUpPutRoute).first)
        #expect(put.method == .put)
        #expect(put.header("Content-Type") == "image/png")
        #expect(put.header("Authorization") == nil)
        #expect(put.body == testPNG)
    }

    @Test("TC-ONB-023 확정 바디는 {signupToken}뿐이고 Authorization이 없다")
    func confirmRequestBody() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath(), session: makeSession())
        _ = try await sut.signUp()
        let confirm = try #require(await sut.transport.requests(key: signUpConfirmRoute).first)
        #expect(confirm.bodyKeys == ["signupToken"])
        #expect(confirm.header("Authorization") == nil)
    }

    @Test("TC-ONB-016 가입 전체 요청 어디에도 동의 관련 필드가 없다")
    func noConsentFieldsAnywhere() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath())
        _ = try await sut.signUp()
        for request in await sut.transport.requests where request.method == .post {
            let text = String(decoding: request.body ?? Data(), as: UTF8.self).lowercased()
            for word in ["term", "agree", "consent", "약관", "동의"] { #expect(!text.contains(word)) }
        }
        #expect(await sut.transport.count == 3)
    }

    // MARK: 성공 처리

    @Test("TC-ONB-024 200이면 userId·토큰 4종을 저장한다(만료 = 받은 시각 + 응답 초)")
    func savesSession() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath())
        _ = try await sut.signUp()
        let saved = try #require(await sut.store.currentSession())
        #expect(saved.userId == Self.userId)
        #expect(saved.accessToken == "fixture-access-token-1")
        #expect(saved.refreshToken == "fixture-refresh-token-1")
        #expect(saved.accessTokenExpiresAt == t0.addingTimeInterval(900))
        #expect(saved.refreshTokenExpiresAt == t0.addingTimeInterval(2_592_000))
        #expect(await sut.store.saveCount == 1)
    }

    @Test("TC-ONB-025 가입 성공 뒤 social-login 재호출이 0건이다")
    func noReloginAfterSignUp() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath())
        _ = try await sut.signUp()
        #expect(await sut.transport.count(of: "POST /auth/social-login") == 0)
    }

    @Test("TC-ONB-024 가입 성공이면 게스트 플래그를 지운다")
    func clearsGuestFlag() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath(), guest: true)
        _ = try await sut.signUp()
        #expect(await sut.guestFlags.isGuest() == false)
    }

    @Test("TC-ONB-038 같은 계정으로 signup이 다시 200을 줘도 성공과 똑같이 처리한다")
    func repeatedSuccessIsSuccess() async throws {
        let sut = try SignatureSUT(script: .signUpHappyPath())
        let first = try await sut.signUp()
        let second = try await sut.signUp()
        #expect(first == second)
        #expect(await sut.store.currentSession()?.userId == Self.userId)
    }

    // MARK: PENDING 폴링

    @Test("TC-ONB-026 첫 signup이 PENDING이면 같은 signupToken으로 1초 뒤 다시 요청하고 uploads·PUT은 다시 부르지 않는다")
    func pendingRetriesSameToken() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixtures: ["onboarding/signup__signature-processing-pending.json", "onboarding/signup__success.json"])
        let sut = try SignatureSUT(script: script)
        _ = try await sut.signUp()
        #expect(await sut.transport.sequence() == [signUpUploadsRoute, signUpPutRoute, signUpConfirmRoute, signUpConfirmRoute])
        let tokens = await sut.transport.requests(key: signUpConfirmRoute).map { $0.jsonBody?["signupToken"] as? String }
        #expect(tokens == ["fixture-signup-token-1", "fixture-signup-token-1"])
        #expect(sut.clock.recordedSleeps == [.seconds(1)])
    }

    @Test("TC-ONB-027 PENDING 2회 뒤 200이면 가상 시간 2초에 성공하고 signup 요청은 총 3회이다")
    func pendingTwiceThenSuccessAtTwoSeconds() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixtures: [
                "onboarding/signup__signature-processing-pending.json", "onboarding/signup__signature-processing-pending.json",
                "onboarding/signup__success.json",
            ])
        let sut = try SignatureSUT(script: script, sleepMode: .virtual)
        let task = Task { try await sut.signUp() }
        guard await EventWait.sleeper(on: sut.clock, before: task) else { Issue.record("첫 PENDING 뒤 대기에 들어가야 한다"); return }
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 1)
        sut.clock.advance(by: .seconds(1))
        guard await EventWait.sleeper(on: sut.clock, before: task) else { Issue.record("두 번째 PENDING 뒤 대기에 들어가야 한다"); return }
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 2)
        sut.clock.advance(by: .seconds(1))
        let result = try await task.value
        #expect(result.userId == Self.userId)
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 3)
        #expect(sut.clock.uptime == .seconds(2))
    }

    @Test("TC-ONB-028 PENDING이 계속되면 최초 1회 + 재시도 10회(총 11회, 1초 간격)까지 보내고 processingTimeout이다")
    func pendingExhaustsAfterTenRetries() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixture: "onboarding/signup__signature-processing-pending.json")
        let sut = try SignatureSUT(script: script, sleepMode: .virtual)
        let task = Task { try await sut.signUp() }
        for sent in 1...10 {
            guard await EventWait.sleeper(on: sut.clock, before: task) else { Issue.record("\(sent)번째 대기에 들어가야 한다"); return }
            // 9번째·10번째 재시도 직전까지 아직 대기 중이다: 대기가 열 번째이면 요청은 열 번 나갔다.
            #expect(await sut.transport.count(of: signUpConfirmRoute) == sent)
            sut.clock.advance(by: .seconds(1))
        }
        let outcome = await task.result
        #expect(outcome.failure as? SignUpError == .processingTimeout)
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 11)
        #expect(sut.clock.recordedSleeps == Array(repeating: .seconds(1), count: 10))
        #expect(sut.clock.sleeperCount == 0)
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-ONB-029 시간 초과 뒤 다시 시도하면 새 uploads부터 시작하고 같은 idToken·rawNonce를 쓴다")
    func retryAfterTimeoutStartsFromUploads() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixture: "onboarding/signup__signature-processing-pending.json")
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.processingTimeout) { try await sut.signUp(idToken: "ID-S", rawNonce: "RAW-S") }
        let before = await sut.transport.count
        await #expect(throws: SignUpError.processingTimeout) { try await sut.signUp(idToken: "ID-S", rawNonce: "RAW-S") }
        let second = (await sut.transport.sequence()).dropFirst(before)
        #expect(Array(second.prefix(2)) == [signUpUploadsRoute, signUpPutRoute])
        let issues = await sut.transport.requests(key: signUpUploadsRoute)
        #expect(issues.count == 2)
        #expect(issues.map { $0.jsonBody?["idToken"] as? String } == ["ID-S", "ID-S"])
        #expect(issues.map { $0.jsonBody?["rawNonce"] as? String } == ["RAW-S", "RAW-S"])
    }

    @Test("TC-ONB-030 PENDING 재시도 중 signupToken 만료로 401이면 거기서 멈추고 401을 던진다")
    func tokenExpiresDuringPolling() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixtures: ["onboarding/signup__signature-processing-pending.json", "onboarding/signup__unauthorized.json"])
        let sut = try SignatureSUT(script: script)
        let expected = try apiError(fixture: "onboarding/signup__unauthorized.json")
        await #expect(throws: expected) { try await sut.signUp() }
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 2)
        #expect(await sut.store.saveCount == 0)
    }

    @Test("PENDING 대기 중 취소되면 더 요청하지 않고 CancellationError이며 세션을 저장하지 않는다")
    func cancelWhilePolling() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixture: "onboarding/signup__signature-processing-pending.json")
        let sut = try SignatureSUT(script: script, sleepMode: .virtual)
        let task = Task { try await sut.signUp() }
        guard await EventWait.sleeper(on: sut.clock, before: task) else { Issue.record("대기에 들어가야 한다"); return }
        task.cancel()
        let outcome = await task.result
        #expect(outcome.failure is CancellationError)
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 1)
        #expect(await sut.store.saveCount == 0)
    }

    // MARK: 업로드 발급 400 → 기존 계정

    @Test("TC-ONB-031 업로드 발급이 400이면 같은 idToken·rawNonce로 social-login을 다시 불러 LOGIN_SUCCESS면 로그인 처리한다")
    func alreadyRegisteredFallsBackToLogin() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__already-registered.json")
            .on("POST /auth/social-login", fixture: "auth/social-login__login-success.json")
        let sut = try SignatureSUT(script: script)
        let result = try await sut.signUp(idToken: "ID-E", rawNonce: "RAW-E")
        #expect(result == SignUpResult(userId: Self.userId, wasExistingAccount: true))
        #expect(await sut.transport.sequence() == [signUpUploadsRoute, "POST /auth/social-login"])
        let login = try #require(await sut.transport.requests(key: "POST /auth/social-login").first)
        #expect(login.jsonBody?["idToken"] as? String == "ID-E")
        #expect(login.jsonBody?["rawNonce"] as? String == "RAW-E")
        #expect(await sut.store.currentSession()?.userId == Self.userId)
    }

    @Test("TC-ONB-031 400의 message가 달라도 같은 분기이다(D-02: message로 분기하지 않는다)")
    func fallbackIgnoresMessage() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, .error(400, "BUSINESS_ERROR", "전혀 다른 문구"))
            .on("POST /auth/social-login", fixture: "auth/social-login__login-success.json")
        let sut = try SignatureSUT(script: script)
        let result = try await sut.signUp()
        #expect(result.wasExistingAccount)
    }

    @Test("TC-ONB-031 재호출도 SIGN_UP_REQUIRED면 existingAccountNeedsSignUp이다")
    func fallbackStillSignUpRequired() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__already-registered.json")
            .on("POST /auth/social-login", fixture: "auth/social-login__sign-up-required.json")
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.existingAccountNeedsSignUp) { try await sut.signUp() }
        #expect(await sut.transport.count(of: signUpPutRoute) == 0)
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-ONB-031 폴백 social-login이 400·404·500이면 확정 단계 오류와 섞이지 않게 existingAccountLoginFailed이다", arguments: [
        HTTPResponse.error(400, "BUSINESS_ERROR", "x"), HTTPResponse.error(404, "BUSINESS_ERROR", "x"), HTTPResponse.error(500, "INTERNAL_ERROR", "x"),
    ])
    func fallbackLoginHttpFailureIsWrapped(response: HTTPResponse) async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__already-registered.json")
            .on("POST /auth/social-login", response)
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.existingAccountLoginFailed(status: response.status)) { try await sut.signUp() }
    }

    @Test("TC-ONB-031 폴백 social-login의 403·네트워크 오류는 그대로 전달한다")
    func fallbackLoginForbiddenAndNetworkPassThrough() async throws {
        let forbidden = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__already-registered.json")
            .on("POST /auth/social-login", .error(403, "FORBIDDEN", "차단"))
        await #expect(throws: APIError.http(status: 403, code: .forbidden, message: "차단")) { try await SignatureSUT(script: forbidden).signUp() }
        let offline = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__already-registered.json")
            .fail("POST /auth/social-login", .notConnected)
        await #expect(throws: APIError.network) { try await SignatureSUT(script: offline).signUp() }
    }

    @Test("TC-ONB-036 발급 단계의 404는 확정 단계의 404(업로드 없음)와 구분해 issueNotFound이다")
    func issueNotFoundIsDistinct() async throws {
        let script = RouteScript().on(signUpUploadsRoute, .error(404, "BUSINESS_ERROR", "없음"))
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.issueNotFound) { try await sut.signUp() }
        #expect(await sut.transport.sequence() == [signUpUploadsRoute])
    }

    // MARK: 오류 전달

    @Test("TC-ONB-032 업로드 발급 403은 서버 message를 담은 APIError로 그대로 던지고 재요청하지 않는다")
    func issueForbidden() async throws {
        let script = try RouteScript().on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__forbidden-banned.json")
        let sut = try SignatureSUT(script: script)
        await #expect(throws: APIError.http(status: 403, code: .forbidden, message: "차단된 소셜 계정입니다.")) { try await sut.signUp() }
        #expect(await sut.transport.sequence() == [signUpUploadsRoute])
    }

    @Test("TC-ONB-033 업로드 발급 401은 갱신 없이 401 UNAUTHORIZED를 던진다(anonymous)", arguments: [nil, makeSession()])
    func issueUnauthorized(session: AuthSession?) async throws {
        let script = try RouteScript().on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__unauthorized.json")
        let sut = try SignatureSUT(script: script, session: session)
        let expected = try apiError(fixture: "onboarding/signup-uploads__unauthorized.json")
        await #expect(throws: expected) { try await sut.signUp() }
        #expect(await sut.transport.sequence() == [signUpUploadsRoute])
    }

    @Test("TC-ONB-034 TC-ONB-035 TC-ONB-036 TC-ONB-037 TC-ONB-039 signup 오류는 status·errorCode·message를 담아 그대로 던지고 한 번만 요청한다", arguments: [
        "onboarding/signup__already-used-token.json",
        "onboarding/signup__invalid-signature.json",
        "onboarding/signup__already-registered-withdrawn.json",
        "onboarding/signup__upload-not-found.json",
        "onboarding/signup__forbidden-banned.json",
        "onboarding/signup__unauthorized.json",
    ])
    func confirmErrorsPassThrough(fixture: String) async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixture: fixture)
        let sut = try SignatureSUT(script: script)
        let expected = try apiError(fixture: fixture)
        await #expect(throws: expected) { try await sut.signUp() }
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 1)
        #expect(await sut.transport.count(of: "POST /auth/social-login") == 0)
        #expect(await sut.store.saveCount == 0)
    }

    // MARK: PUT 실패

    @Test("TC-ONB-040 presigned PUT 403(만료·서명 불일치)이면 signup 0건이고 uploadRejected이며 PUT은 재시도하지 않는다", arguments: [
        "onboarding/presigned-put__expired.json", "onboarding/presigned-put__content-type-mismatch.json",
    ])
    func putForbidden(fixture: String) async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: fixture)
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.uploadRejected(status: 403)) { try await sut.signUp() }
        #expect(await sut.transport.count(of: signUpPutRoute) == 1)
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 0)
    }

    @Test("TC-ONB-040 PUT 실패 뒤 다음 시도는 새 uploads부터 시작한다")
    func nextAttemptAfterPutFailureReissues() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixtures: ["onboarding/presigned-put__expired.json", "onboarding/presigned-put__ok.json"])
            .on(signUpConfirmRoute, fixture: "onboarding/signup__success.json")
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.self) { try await sut.signUp() }
        _ = try await sut.signUp()
        #expect(await sut.transport.count(of: signUpUploadsRoute) == 2)
    }

    @Test("D-21 PUT 5xx는 0.5초·1초 백오프로 최대 2회 재시도하고(총 3회) 그래도 실패하면 uploadRejected이다")
    func putServerErrorRetries() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, .error(500, "INTERNAL_ERROR"))
        let sut = try SignatureSUT(script: script)
        await #expect(throws: SignUpError.uploadRejected(status: 500)) { try await sut.signUp() }
        #expect(await sut.transport.count(of: signUpPutRoute) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 0)
    }

    @Test("TC-ONB-041 PUT 타임아웃은 재시도 후에도 실패하면 APIError.network이다")
    func putTimeout() async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .fail(signUpPutRoute, .timeout)
        let sut = try SignatureSUT(script: script)
        await #expect(throws: APIError.network) { try await sut.signUp() }
        #expect(await sut.transport.count(of: signUpPutRoute) == 3)
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 0)
    }

    // MARK: 네트워크·5xx: POST는 재시도 없음

    @Test("TC-ONB-041 업로드 발급·확정의 네트워크 오류는 재시도 없이 APIError.network이다", arguments: [signUpUploadsRoute, signUpConfirmRoute])
    func networkErrorOnPostIsNotRetried(failing: String) async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .fail(failing, .notConnected)
        let sut = try SignatureSUT(script: script)
        await #expect(throws: APIError.network) { try await sut.signUp() }
        #expect(await sut.transport.count(of: failing) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-ONB-042 업로드 발급·확정의 500은 자동 재시도하지 않는다", arguments: [signUpUploadsRoute, signUpConfirmRoute])
    func serverErrorOnPostIsNotRetried(failing: String) async throws {
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(failing, fixture: "common/error__internal-500.json")
        let sut = try SignatureSUT(script: script)
        let expected = try apiError(fixture: "common/error__internal-500.json")
        await #expect(throws: expected) { try await sut.signUp() }
        #expect(await sut.transport.count(of: failing) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    // MARK: 취소

    @Test("TC-ONB-044 확정 응답이 취소 뒤에 도착하면 CancellationError이고 세션을 저장하지 않는다")
    func responseAfterCancelIsDiscarded() async throws {
        let gate = StubbornGate()
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json")
            .on(signUpConfirmRoute, fixture: "onboarding/signup__success.json", stubbornGate: gate)
        let sut = try SignatureSUT(script: script)
        let task = Task { try await sut.signUp() }
        let signal = try #require(sut.script.entered(signUpConfirmRoute))
        guard await EventWait.signal(signal, before: task) else { Issue.record("확정 요청이 나가야 한다"); return }
        task.cancel()
        await gate.open()
        let outcome = await task.result
        #expect(outcome.failure is CancellationError)
        #expect(await sut.store.saveCount == 0)
        #expect(await sut.store.currentSession() == nil)
    }

    @Test("TC-ONB-044 PUT 도중 취소되면 확정 호출은 0건이다")
    func cancelDuringPutSkipsConfirm() async throws {
        let gate = CancellableGate()
        let script = try RouteScript()
            .on(signUpUploadsRoute, fixture: "onboarding/signup-uploads__success.json")
            .on(signUpPutRoute, fixture: "onboarding/presigned-put__ok.json", gate: gate)
            .on(signUpConfirmRoute, fixture: "onboarding/signup__success.json")
        let sut = try SignatureSUT(script: script)
        let task = Task { try await sut.signUp() }
        let signal = try #require(sut.script.entered(signUpPutRoute))
        guard await EventWait.signal(signal, before: task) else { Issue.record("PUT 요청이 나가야 한다"); return }
        task.cancel()
        let outcome = await task.result
        #expect(outcome.failure is CancellationError)
        #expect(await sut.transport.count(of: signUpConfirmRoute) == 0)
        #expect(await sut.store.saveCount == 0)
    }
}

extension Result {
    var failure: Failure? {
        if case .failure(let error) = self { error } else { nil }
    }
}
