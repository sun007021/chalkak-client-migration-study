import Foundation
import Testing
@testable import ChalkakNetwork

private let server500 = HTTPResponse.error(500, "INTERNAL_ERROR", "서버에서 요청을 처리하지 못했습니다.")

private func httpDate(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "GMT")
    f.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
    return f.string(from: date)
}

private extension HTTPResponse {
    func withHeader(_ name: String, _ value: String) -> HTTPResponse {
        var copy = self
        copy.headers[name] = value
        return copy
    }
}

@Suite("NET 재시도·백오프")
struct RetryTests {
    static let idempotentMethods: [HTTPMethod] = [.get, .put, .delete, .patch]

    @Test("TC-NET-037 멱등 요청은 네트워크 오류에 0.5초, 1초 백오프로 최대 2회 재시도하고 총 3시도 뒤 실패한다", arguments: idempotentMethods)
    func networkErrorBackoff(method: HTTPMethod) async throws {
        let sut = try SUT(script: Array(repeating: .fail(.timeout), count: 5))
        await #expect(throws: APIError.network) {
            try await sut.client.send(HTTPRequest(method: method, path: "/x"))
        }
        #expect(await sut.transport.count == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .seconds(1)])
    }

    @Test("TC-NET-037 멱등 요청은 5xx에도 3시도 뒤 마지막 오류를 돌려준다", arguments: idempotentMethods)
    func fiveXXBackoff(method: HTTPMethod) async throws {
        let sut = try SUT(script: Array(repeating: .response(server500), count: 5))
        await #expect(throws: APIError.http(status: 500, code: .internalError, message: "서버에서 요청을 처리하지 못했습니다.")) {
            try await sut.client.send(HTTPRequest(method: method, path: "/x"))
        }
        #expect(await sut.transport.count == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .seconds(1)])
    }

    @Test("TC-NET-037 업로드 정책 발급 POST(명시적 idempotent)도 재시도하고, 중간에 성공하면 멈춘다")
    func uploadPolicyPostRetries() async throws {
        let sut = try SUT(script: [.fail(.notConnected), .response(server500), .response(.ok)])
        let r = try await sut.client.send(HTTPRequest(method: .post, path: "/posts/uploads", retryPolicy: .idempotent))
        #expect(r.status == 200)
        #expect(await sut.transport.count == 3)
    }

    @Test("TC-NET-037 메서드별 기본 재시도 정책")
    func defaultPolicies() {
        for m in Self.idempotentMethods { #expect(RetryPolicy.default(for: m) == .idempotent) }
        #expect(RetryPolicy.default(for: .post) == .none)
    }

    static let nonIdempotentPosts = [
        "/posts", "/auth/refresh", "/feedbacks", "/posts/0b9d2f0e-1111-4222-8333-444455556666/ai-review",
        "/auth/social-login", "/auth/social-signup/signature/uploads", "/auth/social-signup", "/auth/social-anything-new",
    ]

    @Test("TC-NET-038 비멱등 POST는 네트워크 오류에 자동 재시도 0회", arguments: nonIdempotentPosts)
    func postNoRetryOnNetwork(path: String) async throws {
        let sut = try SUT(script: [.fail(.timeout), .response(.ok)])
        await #expect(throws: APIError.network) {
            try await sut.client.send(HTTPRequest(method: .post, path: path, authPolicy: .anonymous))
        }
        #expect(await sut.transport.count == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-NET-038 비멱등 POST는 5xx에 자동 재시도 0회", arguments: nonIdempotentPosts)
    func postNoRetryOn5xx(path: String) async throws {
        let sut = try SUT(script: [.response(server500), .response(.ok)])
        await #expect(throws: APIError.http(status: 500, code: .internalError, message: "서버에서 요청을 처리하지 못했습니다.")) {
            try await sut.client.send(HTTPRequest(method: .post, path: path, authPolicy: .anonymous))
        }
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-NET-039 멱등 요청이라도 4xx는 재시도하지 않는다", arguments: [(400, "BUSINESS_ERROR"), (403, "FORBIDDEN"), (404, "BUSINESS_ERROR")])
    func noRetryOn4xx(status: Int, code: String) async throws {
        let sut = try SUT(script: [.response(.error(status, code)), .response(.ok)])
        await #expect(throws: APIError.self) { try await sut.client.send(get("/x")) }
        #expect(await sut.transport.count == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-NET-040 503·429의 Retry-After 초 값만큼 기다린 뒤 재시도한다", arguments: [503, 429])
    func retryAfterSeconds(status: Int) async throws {
        let sut = try SUT(script: [.response(.error(status, "INTERNAL_ERROR", headers: ["Retry-After": "2"])), .response(.ok)])
        let r = try await sut.client.send(get("/x"))
        #expect(r.status == 200)
        #expect(sut.clock.recordedSleeps == [.seconds(2)])
        #expect(await sut.transport.count == 2)
    }

    @Test("TC-NET-040 Retry-After가 HTTP 날짜여도 그 시각까지 기다린다")
    func retryAfterDate() async throws {
        let clock = makeTestClock()
        let header = httpDate(clock.now.addingTimeInterval(3))
        let sut = try SUT(script: [.response(.error(503, "INTERNAL_ERROR", headers: ["retry-after": header])), .response(.ok)], clock: clock)
        _ = try await sut.client.send(get("/x"))
        let slept = try #require(sut.clock.recordedSleeps.first)
        #expect(abs(slept.seconds - 3) < 1.0)
    }

    @Test("TC-NET-040 순수 함수: 초 값과 날짜 파싱")
    func parseRetryAfter() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        #expect(RetryBackoff.parseRetryAfter("2", now: now) == .seconds(2))
        #expect(RetryBackoff.parseRetryAfter("0", now: now) == .zero)
        let d = RetryBackoff.parseRetryAfter(httpDate(now.addingTimeInterval(10)), now: now)
        let parsed = try #require(d)
        #expect(abs(parsed.seconds - 10) < 1.0)
    }

    @Test("TC-NET-041 음수·비숫자·과거 날짜·빈 값 Retry-After는 무시하고 기본 백오프를 쓴다", arguments: ["-5", "abc", "", "1.5e3x", "Wed, 21 Oct 2015 07:28:00 GMT"])
    func invalidRetryAfter(value: String) async throws {
        let sut = try SUT(script: [.response(.error(503, "INTERNAL_ERROR", headers: ["Retry-After": value])), .response(.ok)])
        _ = try await sut.client.send(get("/x"))
        #expect(sut.clock.recordedSleeps == [.milliseconds(500)])
        #expect(RetryBackoff.parseRetryAfter(value, now: sut.clock.now) == nil)
    }

    @Test("TC-NET-041 상한(30초)과 같은 Retry-After는 그만큼 기다리고, 31초부터는 기다리지 않고 재시도 없이 실패한다", arguments: [503, 429])
    func retryAfterBoundary(status: Int) async throws {
        #expect(NetworkConstants.maxRetryAfter == .seconds(30))
        let at30 = try SUT(script: [.response(.error(status, "INTERNAL_ERROR", headers: ["Retry-After": "30"])), .response(.ok)])
        _ = try await at30.client.send(get("/x"))
        #expect(at30.clock.recordedSleeps == [.seconds(30)])
        #expect(await at30.transport.count == 2)

        let at31 = try SUT(script: [.response(.error(status, "INTERNAL_ERROR", "later", headers: ["Retry-After": "31"])), .response(.ok)])
        await #expect(throws: APIError.http(status: status, code: .internalError, message: "later")) { try await at31.client.send(get("/x")) }
        #expect(at31.clock.recordedSleeps.isEmpty)
        #expect(await at31.transport.count == 1)
    }

    @Test("TC-NET-041 매우 큰 값(Int 범위 밖 포함)도 기다리지 않고 실패한다", arguments: ["999999", "99999999999999999999999"])
    func hugeRetryAfter(value: String) async throws {
        let sut = try SUT(script: [.response(.error(503, "INTERNAL_ERROR", headers: ["Retry-After": value])), .response(.ok)])
        await #expect(throws: APIError.self) { try await sut.client.send(get("/x")) }
        #expect(sut.clock.recordedSleeps.isEmpty)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-NET-041 HTTP 날짜 Retry-After도 30초까지만 기다리고 31초부터는 실패한다", arguments: [503, 429])
    func retryAfterDateBoundary(status: Int) async throws {
        let clock = makeTestClock()
        let at30 = try SUT(script: [.response(.error(status, "INTERNAL_ERROR", headers: ["Retry-After": httpDate(clock.now.addingTimeInterval(30))])), .response(.ok)], clock: clock)
        _ = try await at30.client.send(get("/x"))
        #expect(at30.clock.recordedSleeps == [.seconds(30)])

        let clock31 = makeTestClock()
        let at31 = try SUT(script: [.response(.error(status, "INTERNAL_ERROR", headers: ["Retry-After": httpDate(clock31.now.addingTimeInterval(31))])), .response(.ok)], clock: clock31)
        await #expect(throws: APIError.self) { try await at31.client.send(get("/x")) }
        #expect(at31.clock.recordedSleeps.isEmpty)
        #expect(await at31.transport.count == 1)
    }

    @Test("TC-NET-042 429에 Retry-After가 없거나 유효하지 않으면 멱등 요청이라도 재시도하지 않는다", arguments: [nil, "", "abc", "-1", "Wed, 21 Oct 2015 07:28:00 GMT"] as [String?])
    func rateLimitedWithoutValidRetryAfter(value: String?) async throws {
        let headers = value.map { ["Retry-After": $0] } ?? [:]
        let sut = try SUT(script: [.response(.error(429, "BUSINESS_ERROR", "느림", headers: headers)), .response(.ok)])
        await #expect(throws: APIError.http(status: 429, code: .businessError, message: "느림")) { try await sut.client.send(get("/x")) }
        #expect(await sut.transport.count == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-NET-042 429가 유효한 Retry-After와 함께 오면 멱등 요청은 최대 2회까지만 다시 시도한다")
    func rateLimitedRetriesAreBounded() async throws {
        let limited = HTTPResponse.error(429, "BUSINESS_ERROR", headers: ["Retry-After": "1"])
        let sut = try SUT(script: Array(repeating: .response(limited), count: 5))
        await #expect(throws: APIError.self) { try await sut.client.send(get("/x")) }
        #expect(await sut.transport.count == 3)
        #expect(sut.clock.recordedSleeps == [.seconds(1), .seconds(1)])
    }

    @Test("TC-NET-040 Retry-After는 429·503에서만 존중한다(다른 5xx는 기본 백오프)")
    func retryAfterIgnoredFor500() async throws {
        let sut = try SUT(script: [.response(server500.withHeader("Retry-After", "20")), .response(.ok)])
        _ = try await sut.client.send(get("/x"))
        #expect(sut.clock.recordedSleeps == [.milliseconds(500)])
    }

    @Test("TC-NET-040 RetryBackoff.plan 순수 함수 표")
    func planTable() {
        let now = testEpoch
        #expect(RetryBackoff.plan(retryIndex: 0, status: nil, retryAfter: nil, now: now) == .wait(.milliseconds(500)))
        #expect(RetryBackoff.plan(retryIndex: 1, status: nil, retryAfter: "5", now: now) == .wait(.seconds(1)))
        #expect(RetryBackoff.plan(retryIndex: 1, status: 500, retryAfter: "5", now: now) == .wait(.seconds(1)))
        #expect(RetryBackoff.plan(retryIndex: 0, status: 503, retryAfter: nil, now: now) == .wait(.milliseconds(500)))
        #expect(RetryBackoff.plan(retryIndex: 0, status: 503, retryAfter: "abc", now: now) == .wait(.milliseconds(500)))
        #expect(RetryBackoff.plan(retryIndex: 0, status: 503, retryAfter: "7", now: now) == .wait(.seconds(7)))
        #expect(RetryBackoff.plan(retryIndex: 0, status: 503, retryAfter: "31", now: now) == .stop)
        #expect(RetryBackoff.plan(retryIndex: 0, status: 429, retryAfter: nil, now: now) == .stop)
        #expect(RetryBackoff.plan(retryIndex: 0, status: 429, retryAfter: "0", now: now) == .wait(.zero))
        #expect(RetryBackoff.plan(retryIndex: 0, status: 429, retryAfter: "30", now: now) == .wait(.seconds(30)))
        #expect(RetryBackoff.plan(retryIndex: 0, status: 429, retryAfter: "31", now: now) == .stop)
    }

    @Test("TC-NET-042 429가 비멱등 POST에 오면 재시도 없이 오류를 돌려준다")
    func rateLimitedPost() async throws {
        let sut = try SUT(script: [.response(.error(429, "BUSINESS_ERROR", "잠시 후 다시 시도", headers: ["Retry-After": "2"])), .response(.ok)])
        await #expect(throws: APIError.http(status: 429, code: .businessError, message: "잠시 후 다시 시도")) {
            try await sut.client.send(HTTPRequest(method: .post, path: "/feedbacks"))
        }
        #expect(await sut.transport.count == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-NET-049 백오프 대기 중 취소하면 즉시 중단하고 추가 요청을 보내지 않는다")
    func cancelDuringBackoff() async throws {
        let clock = makeTestClock(sleepMode: .virtual)
        let sut = try SUT(script: Array(repeating: .response(server500), count: 5), clock: clock)
        let client = sut.client
        let task = Task { try await client.send(get("/x")) }
        await waitUntil("백오프 sleep 진입") { clock.sleeperCount >= 1 }
        task.cancel()
        await #expect(throws: CancellationError.self) { try await task.value }
        #expect(await sut.transport.count == 1)
    }
}
