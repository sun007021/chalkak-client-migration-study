import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport
@testable import ChalkakData

private let createdFixture = "feedback/feedbacks__created.json"

/// refresh 픽스처가 발급하는 새 access 토큰(하드코딩하지 않고 픽스처에서 읽는다).
private func refreshedAccessToken() throws -> String {
    struct Tokens: Decodable { let accessToken: String }
    return try Fixture.load("auth/refresh__success.json").decode(Tokens.self).accessToken
}

@Suite("FDBK 피드백 저장소", .timeLimit(.minutes(1)))
struct FeedbackRepositoryTests {
    private func sut(_ script: RouteScript, session: AuthSession? = makeSession()) throws -> SettingsSUT {
        try SettingsSUT(script: script, session: session)
    }

    private func createdSUT() throws -> SettingsSUT {
        try sut(RouteScript().on(feedbackPost, fixture: createdFixture))
    }

    // MARK: 요청 모양·응답

    @Test("TC-FDBK-015 POST /feedbacks, JSON 바디 {content}뿐, Bearer, Content-Type application/json이다")
    func requestShape() async throws {
        let sut = try sut(RouteScript().on(feedbackPost, fixture: createdFixture), session: makeSession(access: "AT-7"))
        _ = try await sut.feedback.submit(content: "좋아요")
        let request = try #require(await sut.transport.requests.first)
        #expect(request.method == .post)
        #expect(request.apiPath == "/feedbacks")
        #expect(request.bodyKeys == ["content"], "앱 버전·기기 정보 등 다른 필드는 보내지 않는다(Q-13)")
        #expect(request.jsonBody?["content"] as? String == "좋아요")
        #expect(request.header("Authorization") == "Bearer AT-7")
        #expect(request.header("Content-Type") == "application/json")
    }

    @Test("TC-FDBK-016 201 응답의 feedbackId와 createdAt(UTC Instant)을 읽는다")
    func decodesReceipt() async throws {
        let sut = try createdSUT()
        let receipt = try await sut.feedback.submit(content: "의견")
        #expect(receipt.feedbackId == UUID(uuidString: "12121212-1212-4121-8121-121212121201"))
        #expect(receipt.createdAt == Instant.parse("2026-10-27T03:00:00Z"))
    }

    @Test("TC-FDBK-028 정지 회원도 같은 요청으로 201을 성공으로 처리한다(정지 분기 없음)")
    func bannedMemberIsNotSpecial() async throws {
        let sut = try createdSUT()
        _ = try await sut.feedback.submit(content: "정지 회원의 의견")
        #expect(await sut.transport.count(of: feedbackPost) == 1)
    }

    // MARK: 트림

    @Test("TC-FDBK-008 앞뒤 공백을 포함한 내용은 앞뒤만 제거한 값이 서버로 간다(스페이스·탭·개행·전각 공백)")
    func contentIsTrimmed() async throws {
        let body = String(repeating: "가", count: 1000)
        let sut = try createdSUT()
        _ = try await sut.feedback.submit(content: " \t\n\u{3000}" + body + "\u{3000}\n \t")
        let request = try #require(await sut.transport.requests.first)
        let sent = try #require(request.jsonBody?["content"] as? String)
        #expect(sent == body)
        #expect(sent.unicodeScalars.count == 1000)
    }

    @Test("TC-FDBK-012 중간의 개행·연속 공백은 보존하고 앞뒤만 제거한다")
    func innerWhitespaceIsPreserved() async throws {
        let sut = try createdSUT()
        _ = try await sut.feedback.submit(content: "  첫 줄\n\n둘째  줄\t끝  ")
        let request = try #require(await sut.transport.requests.first)
        #expect(request.jsonBody?["content"] as? String == "첫 줄\n\n둘째  줄\t끝")
    }

    // MARK: 오류

    @Test("TC-FDBK-021 400 BUSINESS_ERROR는 status·errorCode·서버 message를 담아 그대로 던진다(재시도 없음)", arguments: [
        "feedback/feedbacks__bad-request-blank.json", "feedback/feedbacks__bad-request-too-long.json",
    ])
    func badRequest(name: String) async throws {
        let sut = try sut(RouteScript().on(feedbackPost, fixture: name))
        let expected = try apiError(fixture: name)
        guard case .http(400, .businessError, _) = expected else {
            Issue.record("fixture가 400 BUSINESS_ERROR가 아니다: \(expected)")
            return
        }
        await #expect(throws: expected) { try await sut.feedback.submit(content: "x") }
        #expect(await sut.transport.count(of: feedbackPost) == 1)
    }

    @Test("TC-FDBK-022 401이면 refresh 1회 뒤 원 요청을 1회 재전송해 성공하면 정상 완료한다")
    func unauthorizedRefreshesAndResends() async throws {
        let script = try RouteScript()
            .on(feedbackPost, fixtures: ["feedback/feedbacks__unauthorized.json", createdFixture])
            .on(refreshRoute, fixture: "auth/refresh__success.json")
        let sut = try sut(script)
        let receipt = try await sut.feedback.submit(content: "다시 보내기")
        #expect(receipt.feedbackId == UUID(uuidString: "12121212-1212-4121-8121-121212121201"))
        #expect(await sut.transport.count(of: refreshRoute) == 1)
        let posts = await sut.transport.requests(key: feedbackPost)
        #expect(posts.count == 2)
        #expect(posts.last?.header("Authorization") == "Bearer \(try refreshedAccessToken())")
        #expect(posts.last?.jsonBody?["content"] as? String == "다시 보내기")
    }

    @Test("TC-FDBK-023 refresh가 REAUTHENTICATION_REQUIRED면 재인증 이벤트를 한 번 보내고 401을 던진다")
    func reauthenticationRequired() async throws {
        let script = try RouteScript()
            .on(feedbackPost, fixture: "feedback/feedbacks__unauthorized.json")
            .on(refreshRoute, fixture: "auth/refresh__reauthentication-required.json")
        let sut = try sut(script)
        do {
            _ = try await sut.feedback.submit(content: "x")
            Issue.record("오류가 나야 한다")
        } catch APIError.http(let status, _, _) {
            #expect(status == 401)
        } catch {
            Issue.record("APIError.http(401)이 아닌 오류: \(error)")
        }
        #expect(await sut.events.count == 1)
        #expect(await sut.transport.count(of: feedbackPost) == 1)
    }

    @Test("TC-FDBK-024 500은 자동 재시도 없이 한 번만 보내고 서버 오류를 던진다")
    func serverErrorIsNotRetried() async throws {
        let sut = try sut(RouteScript().on(feedbackPost, fixture: "feedback/feedbacks__internal-error.json"))
        let expected = try apiError(fixture: "feedback/feedbacks__internal-error.json")
        await #expect(throws: expected) { try await sut.feedback.submit(content: "x") }
        #expect(await sut.transport.count(of: feedbackPost) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-FDBK-025 연결 실패·타임아웃은 재시도 없이 한 번만 보내고 APIError.network이다", arguments: [TransportError.notConnected, .timeout])
    func connectionFailureIsNotRetried(failure: TransportError) async throws {
        let sut = try sut(RouteScript().fail(feedbackPost, failure))
        await #expect(throws: APIError.network) { try await sut.feedback.submit(content: "x") }
        #expect(await sut.transport.count(of: feedbackPost) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-FDBK-027 503(Retry-After)과 429는 재시도 없이 한 번만 보내고 서버 오류로 던진다", arguments: [
        "common/error__service-unavailable-503.json", "common/error__rate-limited-429.json",
    ])
    func retryAfterIsNotHonored(name: String) async throws {
        let sut = try sut(RouteScript().on(feedbackPost, fixture: name))
        let expected = try apiError(fixture: name)
        await #expect(throws: expected) { try await sut.feedback.submit(content: "x") }
        #expect(await sut.transport.count(of: feedbackPost) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-FDBK-026 타임아웃 뒤 사용자가 다시 보내면 중복 제거 없이 한 번 더 보낸다(제출 횟수 제한 없음)")
    func manualResendIsNotDeduplicated() async throws {
        let sut = try sut(RouteScript()
            .on(feedbackPost, fixture: createdFixture))
        _ = try await sut.feedback.submit(content: "같은 내용")
        _ = try await sut.feedback.submit(content: "같은 내용")
        let posts = await sut.transport.requests(key: feedbackPost)
        #expect(posts.count == 2)
        #expect(posts.map { $0.jsonBody?["content"] as? String } == ["같은 내용", "같은 내용"])
    }
}
