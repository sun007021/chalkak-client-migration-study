import Foundation
import Testing
import ChalkakCore
import ChalkakData
import ChalkakNetwork
import ChalkakTestSupport

extension FeedSUT {
    var aiReviews: APIAIReviewRepository { APIAIReviewRepository(client: client) }
}

private let post = FixtureIDs.minePost
private let reviewPath = "/api/v1/posts/22222222-2222-4222-8222-222222222201/ai-review"

/// 파일의 JSON을 고쳐 계약 위반 본문을 만든다.
private func mutated(_ name: String, _ edit: (inout [String: Any]) -> Void) throws -> HTTPResponse {
    var object = try Fixture.load(name).object()
    edit(&object)
    let data = try JSONSerialization.data(withJSONObject: object)
    return HTTPResponse(status: 200, headers: ["Content-Type": "application/json"], body: data)
}

private func makeSUT(_ response: HTTPResponse) throws -> FeedSUT {
    try FeedSUT(transport: FakeFeedTransport { _, _ in response })
}

@Suite("AIR 저장소", .timeLimit(.minutes(1)))
struct AIReviewRepositoryTests {
    // MARK: 요청 모양

    @Test("TC-AIR-001 GET은 경로·Authorization을 쓰고 본문이 없다")
    func getRequestShape() async throws {
        let fixture = try Fixture.load("ai-review/ai-review-get__none.json")
        let sut = try FeedSUT(always: fixture)
        _ = try await sut.aiReviews.status(postId: post)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.method == .get)
        #expect(request.url.path == reviewPath)
        #expect(fixture.matches(request))
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(request.body == nil || request.body?.isEmpty == true)
    }

    @Test("TC-AIR-001 POST는 같은 경로·Authorization을 쓰고 본문이 없다")
    func postRequestShape() async throws {
        let fixture = try Fixture.load("ai-review/ai-review-post__202-processing.json")
        let sut = try FeedSUT(always: fixture)
        _ = try await sut.aiReviews.request(postId: post)
        let request = try #require(await sut.transport.requests.first)
        #expect(request.method == .post)
        #expect(request.url.path == reviewPath)
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(request.body == nil || request.body?.isEmpty == true)
    }

    @Test("TC-AIR-001 TC-AIR-023 POST는 연결 실패여도 자동으로 다시 보내지 않는다")
    func postIsNotRetriedOnConnectionFailure() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw TransportError.notConnected })
        let failure = await feedFailure { try await sut.aiReviews.request(postId: post) }
        #expect(failure == .network)
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-AIR-031 POST 500은 자동 재시도 없이 서버 오류이다")
    func postServerErrorIsNotRetried() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-post__500-server-error.json"))
        let failure = await feedFailure { try await sut.aiReviews.request(postId: post) }
        #expect(failure == .server(status: 500))
        #expect(await sut.transport.count == 1)
    }

    // MARK: 파싱

    @Test("TC-AIR-002 NONE: canRequestAgain=false, 시각·result 모두 nil")
    func parsesNone() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-get__none.json"))
        let review = try await sut.aiReviews.status(postId: post)
        #expect(review == AIReview(status: .none, requestedAt: nil, completedAt: nil, result: nil, canRequestAgain: false))
    }

    @Test("TC-AIR-003 COMPLETED의 점수·criteria·feedback·시각을 읽는다")
    func parsesCompleted() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-get__completed.json"))
        let review = try await sut.aiReviews.status(postId: post)
        #expect(review.status == .completed)
        #expect(review.requestedAt == Instant.parse("2026-10-27T02:58:00Z"))
        #expect(review.completedAt == Instant.parse("2026-10-27T02:58:21Z"))
        let result = try #require(review.result)
        #expect(result.overallScore == 7.5)
        #expect(result.criteria == [AIReviewCriterion(key: "COMPOSITION", label: "구도", score: 7.5)])
        #expect(result.distinctivePerspective)
        #expect(result.feedback.summary == "빛을 따라 시선이 흐르는 안정적인 구도")
        #expect(result.feedback.strength == "빛이 들어오는 방향을 따라 시선이 자연스럽게 이어집니다.")
        #expect(result.feedback.weakness == "수평선이 살짝 기울어 안정감이 조금 떨어집니다.")
        #expect(result.feedback.suggestion == "카메라를 낮추고 수평선을 맞춰 한 번 더 찍어 보세요.")
        #expect(!review.canRequestAgain)
    }

    @Test("TC-AIR-003 소수초가 있는 UTC 시각도 읽는다")
    func parsesFractionalSeconds() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-get__completed-fractional-seconds.json"))
        let review = try await sut.aiReviews.status(postId: post)
        #expect(review.requestedAt == Instant.parse("2026-10-27T02:58:00.123Z"))
        #expect(review.completedAt == Instant.parse("2026-10-27T02:58:21.123Z"))
    }

    @Test("TC-AIR-003 criteria는 개수를 고정하지 않고 응답 순서를 유지한다")
    func criteriaKeepOrderAndCount() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-get__completed-long-text.json"))
        let result = try #require(try await sut.aiReviews.status(postId: post).result)
        let object = try Fixture.load("ai-review/ai-review-get__completed-long-text.json").object()
        let expected = ((object["result"] as? [String: Any])?["criteria"] as? [[String: Any]])?.compactMap { $0["key"] as? String }
        #expect(result.criteria.map(\.key) == expected)
        #expect(result.criteria.count == expected?.count)
        #expect(result.criteria.count == 3)
    }

    @Test("TC-AIR-004 COMPLETED인데 result가 null이면 계약 위반이다")
    func completedWithoutResultIsInvalid() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-get__completed-no-result.json"))
        let failure = await feedFailure { try await sut.aiReviews.status(postId: post) }
        #expect(failure == .invalidResponse)
    }

    @Test("TC-AIR-005 점수가 0~10 밖이면 응답 전체가 계약 위반이다", arguments: [
        "fixture-10.1", "overall-negative", "criterion-over", "criterion-negative",
    ])
    func scoreOutOfRangeIsInvalid(kind: String) async throws {
        let response: HTTPResponse
        switch kind {
        case "fixture-10.1": response = try .fixture("ai-review/ai-review-get__score-out-of-range.json")
        case "overall-negative": response = try mutated("ai-review/ai-review-get__completed.json") { object in
            var result = object["result"] as? [String: Any] ?? [:]
            result["overallScore"] = -0.1
            object["result"] = result
        }
        case "criterion-over": response = try mutated("ai-review/ai-review-get__completed.json") { object in
            var result = object["result"] as? [String: Any] ?? [:]
            result["criteria"] = [["key": "COMPOSITION", "label": "구도", "score": 10.1]]
            object["result"] = result
        }
        default: response = try mutated("ai-review/ai-review-get__completed.json") { object in
            var result = object["result"] as? [String: Any] ?? [:]
            result["criteria"] = [["key": "COMPOSITION", "label": "구도", "score": -0.1]]
            object["result"] = result
        }
        }
        let sut = try makeSUT(response)
        let failure = await feedFailure { try await sut.aiReviews.status(postId: post) }
        #expect(failure == .invalidResponse)
    }

    @Test("TC-AIR-005 0.0과 10.0은 유효하다", arguments: [
        ("ai-review/ai-review-get__completed-score-0.json", 0.0), ("ai-review/ai-review-get__completed-score-10.json", 10.0),
    ])
    func scoreBoundsAreValid(name: String, expected: Double) async throws {
        let sut = try FeedSUT(always: Fixture.load(name))
        let result = try #require(try await sut.aiReviews.status(postId: post).result)
        #expect(result.overallScore == expected)
    }

    @Test("TC-AIR-006 FAILED는 result=null이고 canRequestAgain은 서버 값, 필드가 없으면 false이다", arguments: [
        ("ai-review/ai-review-get__failed-can-retry.json", true),
        ("ai-review/ai-review-get__failed-cannot-retry.json", false),
        ("ai-review/ai-review-get__missing-can-request-again.json", false),
    ])
    func parsesFailed(name: String, canRetry: Bool) async throws {
        let sut = try FeedSUT(always: Fixture.load(name))
        let review = try await sut.aiReviews.status(postId: post)
        #expect(review.status == .failed)
        #expect(review.result == nil)
        #expect(review.canRequestAgain == canRetry)
    }

    @Test("TC-AIR-007 알 수 없는 status는 계약 위반이다")
    func unknownStatusIsInvalid() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-get__unknown-status.json"))
        let failure = await feedFailure { try await sut.aiReviews.status(postId: post) }
        #expect(failure == .invalidResponse)
    }

    @Test("TC-AIR-007 COMPLETED가 아닌데 result가 있으면 계약 위반이다", arguments: [
        "ai-review/ai-review-get__none.json", "ai-review/ai-review-get__processing.json", "ai-review/ai-review-get__failed-can-retry.json",
    ])
    func resultWithoutCompletedIsInvalid(name: String) async throws {
        let completed = try Fixture.load("ai-review/ai-review-get__completed.json").object()
        let response = try mutated(name) { $0["result"] = completed["result"] }
        let sut = try makeSUT(response)
        let failure = await feedFailure { try await sut.aiReviews.status(postId: post) }
        #expect(failure == .invalidResponse)
    }

    @Test("REQ-AIR-045 feedback 항목이 비어 있으면 계약 위반이다", arguments: ["summary", "strength", "weakness", "suggestion"])
    func emptyFeedbackItemIsInvalid(key: String) async throws {
        let response = try mutated("ai-review/ai-review-get__completed.json") { object in
            var result = object["result"] as? [String: Any] ?? [:]
            var feedback = result["feedback"] as? [String: Any] ?? [:]
            feedback[key] = ""
            result["feedback"] = feedback
            object["result"] = result
        }
        let sut = try makeSUT(response)
        let failure = await feedFailure { try await sut.aiReviews.status(postId: post) }
        #expect(failure == .invalidResponse)
    }

    @Test("REQ-AIR-045 공백만 있는 feedback 항목은 '비어 있음'이 아니라 그대로 받는다(명세는 비어 있는 경우만 정한다)")
    func whitespaceFeedbackIsAccepted() async throws {
        let response = try mutated("ai-review/ai-review-get__completed.json") { object in
            var result = object["result"] as? [String: Any] ?? [:]
            var feedback = result["feedback"] as? [String: Any] ?? [:]
            feedback["weakness"] = "   "
            result["feedback"] = feedback
            object["result"] = result
        }
        let review = try await makeSUT(response).aiReviews.status(postId: post)
        #expect(review.result?.feedback.weakness == "   ")
    }

    // MARK: POST 응답 해석

    @Test("TC-AIR-008 POST 202 PROCESSING과 200 COMPLETED를 본문 status로 읽는다")
    func postStatusFromBody() async throws {
        let processing = try await FeedSUT(always: Fixture.load("ai-review/ai-review-post__202-processing.json")).aiReviews.request(postId: post)
        #expect(processing.status == .processing)
        #expect(processing.requestedAt == Instant.parse("2026-10-27T03:00:00Z"))
        let completed = try await FeedSUT(always: Fixture.load("ai-review/ai-review-post__200-completed.json")).aiReviews.request(postId: post)
        #expect(completed.status == .completed)
        #expect(completed.result != nil)
    }

    @Test("TC-AIR-008 HTTP 코드가 아니라 본문 status로 분기한다(200+PROCESSING, 202+COMPLETED)")
    func statusIgnoresHTTPCode() async throws {
        let processingBody = try Fixture.load("ai-review/ai-review-post__202-processing.json").body
        let completedBody = try Fixture.load("ai-review/ai-review-post__200-completed.json").body
        let a = try await makeSUT(jsonResponse(200, String(decoding: processingBody, as: UTF8.self))).aiReviews.request(postId: post)
        #expect(a.status == .processing)
        let b = try await makeSUT(jsonResponse(202, String(decoding: completedBody, as: UTF8.self))).aiReviews.request(postId: post)
        #expect(b.status == .completed)
    }

    // MARK: 오류

    @Test("TC-AIR-009 TC-AIR-026 POST 400은 HTTP 상태와 서버 message를 보존한다", arguments: [
        "ai-review/ai-review-post__400-limit-reached.json", "ai-review/ai-review-post__400-disabled.json",
    ])
    func postBadRequestKeepsServerMessage(name: String) async throws {
        let fixture = try Fixture.load(name)
        let sut = try FeedSUT(always: fixture)
        let failure = await feedFailure { try await sut.aiReviews.request(postId: post) }
        #expect(failure == .badRequest(message: fixture.errorMessage))
        #expect(await sut.transport.count == 1)
    }

    @Test("TC-AIR-009 TC-AIR-027 POST 403은 정지 회원(banned)이다")
    func postForbiddenIsBanned() async throws {
        let sut = try FeedSUT(always: Fixture.load("ai-review/ai-review-post__403-banned.json"))
        let failure = await feedFailure { try await sut.aiReviews.request(postId: post) }
        #expect(failure == .banned)
    }

    @Test("TC-AIR-028 TC-AIR-041 GET·POST 404는 notFound이다")
    func notFound() async throws {
        let get = try FeedSUT(always: Fixture.load("ai-review/ai-review-get__404-not-found.json"))
        #expect(await feedFailure { try await get.aiReviews.status(postId: post) } == .notFound)
        let post404 = try FeedSUT(always: Fixture.load("ai-review/ai-review-post__404-not-found.json"))
        #expect(await feedFailure { try await post404.aiReviews.request(postId: post) } == .notFound)
    }

    @Test("TC-AIR-009 요청 취소는 통신 오류로 바뀌지 않는다")
    func cancellationPropagates() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport { _, _ in throw CancellationError() })
        await #expect(throws: CancellationError.self) { try await sut.aiReviews.status(postId: post) }
        await #expect(throws: CancellationError.self) { try await sut.aiReviews.request(postId: post) }
    }

    @Test("TC-AIR-047 GET 503 Retry-After: 1은 1초 기다린 뒤 다시 조회한다")
    func getHonorsRetryAfter() async throws {
        let sut = try FeedSUT(transport: FakeFeedTransport(sequence: [
            Fixture.load("ai-review/ai-review-get__503-retry-after.json"),
            Fixture.load("ai-review/ai-review-get__completed.json"),
        ]))
        let review = try await sut.aiReviews.status(postId: post)
        #expect(review.status == .completed)
        #expect(await sut.transport.count == 2)
        #expect(sut.clock.recordedSleeps == [.seconds(1)])
    }
}
