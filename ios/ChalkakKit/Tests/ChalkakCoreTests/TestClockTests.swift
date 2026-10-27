import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport


@Suite("TestClock 가짜 시계", .timeLimit(.minutes(1)))
struct TestClockTests {
    @Test("TC-TIME-030 advance가 now와 uptime을 함께 전진시킨다")
    func advanceMovesNowAndUptime() {
        let clock = TestClock(now: utc(2026, 10, 27, 0, 0), uptime: .seconds(10))
        clock.advance(by: .seconds(3))
        #expect(clock.now == utc(2026, 10, 27, 0, 0, 3))
        #expect(clock.uptime == .seconds(13))
    }

    @Test("TC-TIME-030 setNow는 벽시계만 바꾸고 uptime은 그대로다")
    func setNowKeepsUptime() {
        let clock = TestClock(now: utc(2026, 10, 27), uptime: .seconds(10))
        clock.setNow(utc(2000, 1, 1))
        #expect(clock.now == utc(2000, 1, 1))
        #expect(clock.uptime == .seconds(10))
    }

    struct Wait: Sendable, CustomTestStringConvertible {
        let name: String
        let duration: Duration
        var testDescription: String { name }
    }
    static let waits: [Wait] = [
        Wait(name: "스플래시 700ms", duration: AppConstants.splashPreloadMax),
        Wait(name: "토스트 2.5초", duration: AppConstants.toastDuration),
        Wait(name: "폴링 3초", duration: AppConstants.aiReviewPollInterval),
        Wait(name: "폴링 창 300초", duration: AppConstants.aiReviewPollWindow),
        Wait(name: "가입 재시도 1초", duration: AppConstants.signupPendingRetryInterval),
        Wait(name: "업로드 만료 마진 5초", duration: AppConstants.uploadURLSafetyMargin),
    ]

    @Test("TC-TIME-030 기한 직전까지는 깨어나지 않고 기한이 되면 깨어난다 (실제 대기 없음)", arguments: waits)
    func sleeperWakesExactlyAtDeadline(w: Wait) async throws {
        #expect(w.duration > .zero)   // 상수가 채워지기 전 스텁에서 무의미한 통과를 막는다
        let clock = TestClock()
        let started = ContinuousClock.now
        let sleeper = Task { try await clock.sleep(for: w.duration) }
        await clock.waitUntilSleeperCount(atLeast: 1)
        #expect(clock.sleeperCount == 1)

        clock.advance(by: w.duration - .milliseconds(1))
        await Task.yield()
        #expect(clock.sleeperCount == 1)   // 아직 자는 중

        clock.advance(by: .milliseconds(1))
        try await sleeper.value
        #expect(clock.sleeperCount == 0)
        #expect(ContinuousClock.now - started < .seconds(5))   // 가상 시간만으로 끝남
    }

    @Test("TC-TIME-030 한 번의 advance가 기한이 지난 여러 sleeper를 모두 깨우고 늦은 것은 남긴다")
    func advanceWakesAllDueSleepers() async throws {
        let clock = TestClock()
        let short1 = Task { try await clock.sleep(for: .seconds(1)) }
        let short2 = Task { try await clock.sleep(for: .seconds(2)) }
        let long = Task { try await clock.sleep(for: .seconds(10)) }
        await clock.waitUntilSleeperCount(atLeast: 3)

        clock.advance(by: .seconds(2))
        try await short1.value
        try await short2.value
        #expect(clock.sleeperCount == 1)

        clock.advance(by: .seconds(8))
        try await long.value
        #expect(clock.sleeperCount == 0)
    }

    @Test("TC-TIME-030 sleep 중 취소하면 CancellationError로 끝나고 sleeper에서 빠진다")
    func cancellationThrows() async throws {
        let clock = TestClock()
        let sleeper = Task { try await clock.sleep(for: .seconds(100)) }
        await clock.waitUntilSleeperCount(atLeast: 1)
        sleeper.cancel()
        await #expect(throws: CancellationError.self) { try await sleeper.value }
        #expect(clock.sleeperCount == 0)
    }

    @Test("TC-TIME-030 0 이하 duration의 sleep은 즉시 끝난다")
    func zeroDurationReturnsImmediately() async throws {
        let clock = TestClock()
        try await clock.sleep(for: .zero)
        #expect(clock.sleeperCount == 0)
    }

    @Test("TC-TIME-030 연쇄 sleep(3초 폴링 반복)을 advance만으로 300초 진행한다")
    func repeatedPollingCompletesWithVirtualTime() async throws {
        let clock = TestClock()
        let polls = Task { () -> Int in
            var count = 0
            while clock.uptime < AppConstants.aiReviewPollWindow {
                try await clock.sleep(for: AppConstants.aiReviewPollInterval)
                count += 1
            }
            return count
        }
        for _ in 0..<100 {
            await clock.waitUntilSleeperCount(atLeast: 1)
            clock.advance(by: AppConstants.aiReviewPollInterval)
        }
        #expect(try await polls.value == 100)
    }
}
