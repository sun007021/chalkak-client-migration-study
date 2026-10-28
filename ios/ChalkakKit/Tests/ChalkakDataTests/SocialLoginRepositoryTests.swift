import Foundation
import Testing
import ChalkakTestSupport
import ChalkakCore
import ChalkakNetwork
@testable import ChalkakData

@Suite("AUTH social-login 저장소")
struct SocialLoginRepositoryTests {
    private func sut(
        session: AuthSession? = nil,
        guest: Bool = false,
        saveGate: StubbornGate? = nil,
        cacheGate: StubbornGate? = nil,
        handler: @escaping FakeTransport.Handler
    ) throws -> AuthSUT {
        try AuthSUT(session: session, guest: guest, saveGate: saveGate, cacheGate: cacheGate, handler: handler)
    }

    @Test("TC-AUTH-005 POST /auth/social-login, 바디 {provider,idToken,rawNonce}, Authorization 없음(세션이 있어도)")
    func requestShape() async throws {
        let sut = try sut(session: makeSession()) { _, _ in .loginSuccess() }
        _ = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        let request = try #require(await sut.transport.requests.first)
        #expect(request.method == .post)
        #expect(request.apiPath == "/auth/social-login")
        #expect(request.header("Authorization") == nil)
        #expect(Set(request.jsonBody?.keys.map { $0 } ?? []) == ["provider", "idToken", "rawNonce"])
        #expect(request.jsonBody?["rawNonce"] as? String == "RAW")
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-AUTH-007 LOGIN_SUCCESS면 세션을 저장한다(만료 = now + 응답 초)")
    func savesSession() async throws {
        let sut = try sut { _, _ in .loginSuccess(userId: "user-b", access: "AT", refresh: "RT") }
        let outcome = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        #expect(outcome == .loggedIn(userId: "user-b"))
        let saved = try #require(await sut.store.currentSession())
        #expect(saved.userId == "user-b")
        #expect(saved.accessToken == "AT")
        #expect(saved.refreshToken == "RT")
        #expect(saved.accessTokenExpiresAt == t0.addingTimeInterval(900))
        #expect(saved.refreshTokenExpiresAt == t0.addingTimeInterval(2_592_000))
    }

    @Test("TC-AUTH-034 게스트 상태에서 로그인 성공이면 게스트 플래그가 지워진다")
    func clearsGuestFlag() async throws {
        let sut = try sut(guest: true) { _, _ in .loginSuccess() }
        _ = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        #expect(await sut.guestFlags.isGuest() == false)
    }

    @Test("TC-AUTH-010 SIGN_UP_REQUIRED면 토큰을 저장하지 않는다")
    func signUpRequiredDoesNotSave() async throws {
        let sut = try sut { _, _ in .signUpRequired }
        let outcome = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        #expect(outcome == .signUpRequired)
        #expect(await sut.store.saveCount == 0)
        #expect(await sut.store.currentSession() == nil)
    }

    @Test("TC-AUTH-011 알 수 없는 status는 invalidResponse이고 세션을 저장하지 않는다")
    func unknownStatus() async throws {
        let sut = try sut { _, _ in .json(200, #"{"status":"NEW_STATUS"}"#) }
        await #expect(throws: APIError.invalidResponse) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-AUTH-012 LOGIN_SUCCESS에 refreshToken이 없으면 invalidResponse, 저장 없음")
    func missingToken() async throws {
        let sut = try sut { _, _ in .json(200, #"{"status":"LOGIN_SUCCESS","userId":"u","accessToken":"a","expiresIn":900,"refreshTokenExpiresIn":1}"#) }
        await #expect(throws: APIError.invalidResponse) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-AUTH-020 401 UNAUTHORIZED는 refresh 없이 그대로 던진다(요청 1회)")
    func unauthorizedDoesNotRefresh() async throws {
        let sut = try sut(session: makeSession()) { _, _ in .error(401, "UNAUTHORIZED", "토큰 검증 실패") }
        await #expect(throws: APIError.http(status: 401, code: .unauthorized, message: "토큰 검증 실패")) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.transport.count == 1)
        #expect(await sut.transport.requests(path: "/auth/refresh").isEmpty)
        #expect(await sut.store.saveCount == 0)
    }

    @Test("TC-AUTH-021 403 FORBIDDEN은 서버 message를 보존해 던지고 재시도하지 않는다", arguments: ["차단된 소셜 계정입니다.", "탈퇴한 차단 소셜 계정입니다."])
    func forbidden(message: String) async throws {
        let sut = try sut { _, _ in .error(403, "FORBIDDEN", message) }
        await #expect(throws: APIError.http(status: 403, code: .forbidden, message: message)) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-AUTH-023 400 BUSINESS_ERROR는 그대로 던진다")
    func businessError() async throws {
        let sut = try sut { _, _ in .error(400, "BUSINESS_ERROR", "Authorization Code는 APPLE 로그인에만 필요합니다.") }
        await #expect(throws: APIError.http(status: 400, code: .businessError, message: "Authorization Code는 APPLE 로그인에만 필요합니다.")) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
    }

    @Test("TC-AUTH-024 500은 정확히 1회만 보낸다(자동 재시도 금지)")
    func noRetryOn500() async throws {
        let sut = try sut { _, _ in .error(500, "INTERNAL_ERROR") }
        await #expect(throws: APIError.http(status: 500, code: .internalError, message: "msg")) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-AUTH-025 타임아웃·연결 실패는 .network이고 요청은 1회뿐", arguments: [TransportError.timeout, .notConnected])
    func networkFailure(error: TransportError) async throws {
        let sut = try sut { _, _ in throw error }
        await #expect(throws: APIError.network) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-AUTH-026 502 HTML 응답은 status로 분류한다(크래시 없음)")
    func badGatewayHTML() async throws {
        let sut = try sut { _, _ in .badGatewayHTML }
        await #expect(throws: APIError.http(status: 502, code: nil, message: nil)) {
            try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        }
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-AUTH-031 취소 뒤에도 성공 응답을 돌려주는 전송이라도 저장하지 않고 CancellationError(checkCancellation)")
    func lateResponseAfterCancelIsDiscarded() async throws {
        let gate = StubbornGate()
        let sut = try sut { _, _ in
            await gate.wait()
            return .loginSuccess()
        }
        let task = Task { try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW") }
        await sut.transport.requested.wait()
        task.cancel()
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(await sut.store.saveCount == 0)
        #expect(await sut.guestFlags.setCalls.isEmpty)
    }

    @Test("TC-AUTH-031 저장이 시작된 뒤에는 취소돼도 끝까지 마치고 loggedIn(세션 저장 + 게스트 플래그 삭제)")
    func cancelDuringSaveCompletes() async throws {
        let gate = StubbornGate()
        let sut = try sut(guest: true, saveGate: gate) { _, _ in .loginSuccess(userId: "user-b") }
        let task = Task { try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW") }
        await sut.store.saveEntered.wait()
        task.cancel()
        await gate.open()
        #expect(try await task.value == .loggedIn(userId: "user-b"))
        #expect(await sut.store.currentSession()?.userId == "user-b")
        #expect(await sut.guestFlags.isGuest() == false)
    }

    @Test("TC-AUTH-031 이전 계정 캐시를 비우는 도중 취소돼도 저장까지 마친다")
    func cancelDuringCacheClearCompletes() async throws {
        let gate = StubbornGate()
        let sut = try sut(session: makeSession(userId: "user-a"), cacheGate: gate) { _, _ in .loginSuccess(userId: "user-b") }
        let task = Task { try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW") }
        await sut.caches.entered.wait()
        task.cancel()
        await gate.open()
        #expect(try await task.value == .loggedIn(userId: "user-b"))
        #expect(await sut.caches.count == 1)
        #expect(await sut.store.currentSession()?.userId == "user-b")
    }

    @Test("TC-AUTH-031 SIGN_UP_REQUIRED 응답이 취소 뒤에 도착해도 버린다")
    func signUpRequiredAfterCancelDiscarded() async throws {
        let gate = StubbornGate()
        let sut = try sut { _, _ in
            await gate.wait()
            return .signUpRequired
        }
        let task = Task { try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW") }
        await sut.transport.requested.wait()
        task.cancel()
        await gate.open()
        await #expect(throws: CancellationError.self) { try await task.value }
    }

    @Test("TC-AUTH-058 다른 계정으로 로그인하면 사용자 캐시를 비운다")
    func differentAccountClearsCaches() async throws {
        let sut = try sut(session: makeSession(userId: "user-a")) { _, _ in .loginSuccess(userId: "user-b") }
        _ = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        #expect(await sut.caches.count == 1)
        #expect(await sut.store.currentSession()?.userId == "user-b")
    }

    @Test("TC-AUTH-058 같은 계정으로 다시 로그인하면 캐시를 유지한다")
    func sameAccountKeepsCaches() async throws {
        let sut = try sut(session: makeSession(userId: "user-b")) { _, _ in .loginSuccess(userId: "user-b") }
        _ = try await sut.repository.socialLogin(idToken: "ID", rawNonce: "RAW")
        #expect(await sut.caches.count == 0)
    }
}
