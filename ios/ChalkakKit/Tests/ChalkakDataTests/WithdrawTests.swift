import Foundation
import Testing
import ChalkakTestSupport
import ChalkakNetwork
@testable import ChalkakData

@Suite("AUTH 회원탈퇴")
struct WithdrawTests {
    @Test("TC-AUTH-043 DELETE /users/me가 본문 없이 Bearer로 나가고 204면 로컬 세션·캐시를 지운다")
    func success() async throws {
        let sut = try AuthSUT { _, _ in .noContent }
        try await sut.repository.withdraw()
        let request = try #require(await sut.transport.requests.first)
        #expect(request.method == .delete)
        #expect(request.apiPath == "/users/me")
        #expect(request.body == nil)
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.caches.count == 1)
        let events = await sut.log.events
        #expect(try #require(events.firstIndex(of: "http DELETE /users/me")) < #require(events.firstIndex(of: "store.clear")))
    }

    @Test("TC-AUTH-044 500·네트워크 실패면 던지고 세션·캐시를 유지한다", arguments: ["500", "network"])
    func failureKeepsSession(kind: String) async throws {
        let sut = try AuthSUT { _, _ in
            if kind == "network" { throw TransportError.notConnected }
            return .error(500, "INTERNAL_ERROR")
        }
        let expected: APIError = kind == "network" ? .network : .http(status: 500, code: .internalError, message: "msg")
        await #expect(throws: expected) { try await sut.repository.withdraw() }
        #expect(await sut.store.currentSession()?.userId == "user-a")
        #expect(await sut.caches.count == 0)
    }

    @Test("TC-AUTH-045 401 UNAUTHORIZED면 refresh 후 원 요청을 1회 재전송하고 204면 성공")
    func refreshThenResend() async throws {
        let sut = try AuthSUT { request, _ in
            if request.apiPath == "/auth/refresh" { return .refreshOK() }
            return request.header("Authorization") == "Bearer new-access" ? .noContent : .error(401, "UNAUTHORIZED")
        }
        try await sut.repository.withdraw()
        #expect(await sut.transport.requests.map(\.apiPath) == ["/users/me", "/auth/refresh", "/users/me"])
        #expect(await sut.store.currentSession() == nil)
    }

    @Test("TC-AUTH-045 refresh가 5xx로 실패하면 던지고 세션을 유지한다")
    func refreshFailureKeepsSession() async throws {
        let sut = try AuthSUT { request, _ in
            request.apiPath == "/auth/refresh" ? .error(500, "INTERNAL_ERROR") : .error(401, "UNAUTHORIZED")
        }
        await #expect(throws: APIError.self) { try await sut.repository.withdraw() }
        #expect(await sut.store.currentSession()?.userId == "user-a")
        #expect(await sut.events.count == 0)
    }

    @Test("TC-AUTH-045 갱신 후에도 401 UNAUTHORIZED면 던지되 세션은 지우지 않는다")
    func persistentUnauthorizedKeepsSession() async throws {
        let sut = try AuthSUT { request, _ in
            request.apiPath == "/auth/refresh" ? .refreshOK() : .error(401, "UNAUTHORIZED")
        }
        await #expect(throws: APIError.http(status: 401, code: .unauthorized, message: "msg")) {
            try await sut.repository.withdraw()
        }
        #expect(await sut.store.currentSession() != nil)
        #expect(await sut.caches.count == 0)
    }

    @Test("TC-AUTH-051 refresh가 REAUTHENTICATION_REQUIRED면 세션이 지워지고 이벤트 1회, 던진다")
    func reauthenticationRequired() async throws {
        let sut = try AuthSUT { request, _ in
            request.apiPath == "/auth/refresh" ? .error(401, "REAUTHENTICATION_REQUIRED") : .error(401, "UNAUTHORIZED")
        }
        await #expect(throws: APIError.http(status: 401, code: .reauthenticationRequired, message: "msg")) {
            try await sut.repository.withdraw()
        }
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.events.count == 1)
        #expect(await sut.transport.requests(path: "/auth/refresh").count == 1)
    }

    @Test("TC-AUTH-049 요청 중 취소돼도 204가 도착했다면 로컬 세션·캐시는 정리된다")
    func cancelledButServerSucceeded() async throws {
        let gate = StubbornGate()
        let sut = try AuthSUT { _, _ in
            await gate.wait()
            return .noContent
        }
        let task = Task { try await sut.repository.withdraw() }
        await sut.transport.requested.wait()
        task.cancel()
        await gate.open()
        _ = try? await task.value
        #expect(await sut.store.currentSession() == nil)
        #expect(await sut.caches.count == 1)
    }
}
