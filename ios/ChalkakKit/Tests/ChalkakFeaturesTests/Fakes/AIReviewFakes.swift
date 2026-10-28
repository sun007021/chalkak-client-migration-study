import Foundation
import ChalkakCore
import ChalkakNetwork
import ChalkakData
import ChalkakTestSupport
@testable import ChalkakFeatures

// AI 피드백 ViewModel 테스트용 Fake 저장소·하네스·fixture 읽기.

/// 게시물별로 호출 순서대로 응답한다(마지막 단계를 반복). 각 단계는 `hold`로 멈출 수 있다.
actor FakeAIReviewRepository: AIReviewRepository {
    struct Step: Sendable {
        let result: Result<AIReview, any Error>
        let hold: Hold?
        static func ok(_ review: AIReview, hold: Hold? = nil) -> Step { Step(result: .success(review), hold: hold) }
        static func fail(_ error: any Error, hold: Hold? = nil) -> Step { Step(result: .failure(error), hold: hold) }
    }

    /// 호출 순서(GET/POST 섞어서)를 남긴다.
    enum Call: Sendable, Equatable {
        case status(UUID)
        case request(UUID)
    }

    private var statusSteps: [UUID: [Step]] = [:]
    private var requestSteps: [UUID: [Step]] = [:]
    private var statusCount: [UUID: Int] = [:]
    private var requestCount: [UUID: Int] = [:]
    private(set) var calls: [Call] = []
    private var inFlightStatus = 0
    private(set) var maxConcurrentStatus = 0
    let statusEntered = CallSignal()
    let requestEntered = CallSignal()

    func setStatus(_ steps: [Step], for postId: UUID = postA) { statusSteps[postId] = steps }
    func setRequest(_ steps: [Step], for postId: UUID = postA) { requestSteps[postId] = steps }

    var statusCalls: Int { calls.filter { if case .status = $0 { true } else { false } }.count }
    var requestCalls: Int { calls.filter { if case .request = $0 { true } else { false } }.count }

    func status(postId: UUID) async throws -> AIReview {
        calls.append(.status(postId))
        inFlightStatus += 1
        maxConcurrentStatus = max(maxConcurrentStatus, inFlightStatus)
        defer { inFlightStatus -= 1 }
        let index = statusCount[postId, default: 0]
        statusCount[postId] = index + 1
        await statusEntered.fire()
        return try await run(statusSteps[postId], index: index)
    }

    func request(postId: UUID) async throws -> AIReview {
        calls.append(.request(postId))
        let index = requestCount[postId, default: 0]
        requestCount[postId] = index + 1
        await requestEntered.fire()
        return try await run(requestSteps[postId], index: index)
    }

    private func run(_ steps: [Step]?, index: Int) async throws -> AIReview {
        guard let steps, !steps.isEmpty else { throw FeedFailure.invalidResponse } // 스크립트 누락
        let step = steps[min(index, steps.count - 1)]
        if let hold = step.hold { try await hold.wait() }
        return try step.result.get()
    }
}

/// `shared/fixtures/ai-review`를 `AIReview`로 읽는다(복제하지 않는다).
enum AIFixtures {
    static func review(_ name: String) throws -> AIReview {
        try Fixture.load("ai-review/\(name).json").decode(AIReview.self, using: APIJSON.makeDecoder())
    }
    static func none() throws -> AIReview { try review("ai-review-get__none") }
    static func processing() throws -> AIReview { try review("ai-review-get__processing") }
    static func processingOldRequestedAt() throws -> AIReview { try review("ai-review-get__processing-old-requested-at") }
    static func completed() throws -> AIReview { try review("ai-review-get__completed") }
    static func failedCanRetry() throws -> AIReview { try review("ai-review-get__failed-can-retry") }
    static func failedCannotRetry() throws -> AIReview { try review("ai-review-get__failed-cannot-retry") }
    static func postProcessing() throws -> AIReview { try review("ai-review-post__202-processing") }
    static func postCompleted() throws -> AIReview { try review("ai-review-post__200-completed") }

    /// 오류 fixture의 서버 message.
    static func message(_ name: String) throws -> String {
        guard let text = try Fixture.load("ai-review/\(name).json").object()["message"] as? String else {
            throw FixtureError.malformed("\(name): message 없음")
        }
        return text
    }
}

/// ViewModel 하나와 그 의존성 묶음. 시계는 FIXTURE_NOW(KST 2026-10-27 12:00)에서 시작한다.
@MainActor
struct AIReviewWorld {
    let repo = FakeAIReviewRepository()
    let clock = TestClock(now: Instant.parse("2026-10-27T03:00:00Z")!)
    let viewer = MutableViewer(userId: FeedFixtures.userA)
    let today = FeedFixtures.today

    func target(_ postId: UUID = postA, topicDate: KSTDate? = nil, isMine: Bool = true) -> AIReviewTarget {
        AIReviewTarget(postId: postId, topicDate: topicDate ?? today, isMine: isMine)
    }

    func makeVM(
        _ target: AIReviewTarget? = nil, surface: AIReviewViewModel.Surface = .detail,
        opensSheetOnFirstResult: Bool = false, viewer: (any ViewerContext)? = nil
    ) -> AIReviewViewModel {
        AIReviewViewModel(
            target: target ?? self.target(), surface: surface, repository: repo,
            viewer: viewer ?? self.viewer, clock: clock, opensSheetOnFirstResult: opensSheetOnFirstResult
        )
    }

    /// 3초씩 `count`번 시계를 앞당긴다. 매번 폴링이 다음 sleep에 들어가길(= 직전 GET이 끝나길) 기다린다.
    /// 작업(`run`)이 먼저 끝나 버리면(폴링이 멈췄거나 스텁) 기다리지 않고 실패로 돌려준다.
    func tick(_ count: Int = 1, by step: Duration = AppConstants.aiReviewPollInterval, before run: Task<Void, Never>) async -> Bool {
        for _ in 0..<count {
            guard await EventWait.sleeper(on: clock, before: run) else { return false }
            clock.advance(by: step)
        }
        return true
    }

    /// 폴링이 다음 sleep에 들어갔는가(작업이 먼저 끝나면 false).
    func isSleeping(before run: Task<Void, Never>) async -> Bool {
        await EventWait.sleeper(on: clock, before: run)
    }

    /// 호출 `n`번째 진입을 기다린다(멈춰 있는 단계가 있을 때 쓴다). 작업이 먼저 끝나면 false.
    func statusEntered(atLeast n: Int, before run: Task<Void, Never>) async -> Bool {
        await EventWait.signal(repo.statusEntered, atLeast: n, before: run)
    }
    func requestEntered(atLeast n: Int, before run: Task<Void, Never>) async -> Bool {
        await EventWait.signal(repo.requestEntered, atLeast: n, before: run)
    }
}

extension TestClock {
    /// 오프셋이 붙은 ISO-8601 순간으로 벽시계를 옮긴다(uptime 불변).
    func setInstant(_ text: String) { setNow(Instant.parse(text)!) }
}
