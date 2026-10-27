import Foundation
import Testing
import ChalkakTestSupport

/// NetworkTests가 쓰는 TestClock 확장(즉시 반환·기록 모드)의 계약.
@Suite("TestClock 즉시 반환·기록 모드", .timeLimit(.minutes(1)))
struct TestClockModeTests {
    @Test("TC-TIME-030 immediate 모드의 sleep은 기록하고 가상 시간을 앞당긴 뒤 즉시 돌아온다")
    func immediateMode() async throws {
        let clock = TestClock(now: Date(timeIntervalSince1970: 100), uptime: .seconds(1), sleepMode: .immediate)
        try await clock.sleep(for: .milliseconds(500))
        try await clock.sleep(for: .seconds(2))
        #expect(clock.recordedSleeps == [.milliseconds(500), .seconds(2)])
        #expect(clock.now == Date(timeIntervalSince1970: 102.5))
        #expect(clock.uptime == .milliseconds(3_500))
        #expect(clock.sleeperCount == 0)
    }

    @Test("TC-TIME-030 immediate 모드도 0초 요청을 기록하고, 취소된 작업은 CancellationError를 받는다")
    func immediateZeroAndCancel() async throws {
        let clock = TestClock(sleepMode: .immediate)
        try await clock.sleep(for: .zero)
        #expect(clock.recordedSleeps == [.zero])
        let task = Task {
            withUnsafeCurrentTask { $0?.cancel() }
            try await clock.sleep(for: .seconds(1))
        }
        await #expect(throws: CancellationError.self) { try await task.value }
    }

    @Test("TC-TIME-030 virtual 모드(기본)는 advance 전까지 머물고 요청 길이는 기록한다")
    func virtualModeRecords() async throws {
        let clock = TestClock()
        let task = Task { try await clock.sleep(for: .seconds(5)) }
        await clock.waitUntilSleeperCount(atLeast: 1)
        #expect(clock.recordedSleeps == [.seconds(5)])
        clock.advance(by: .seconds(5))
        try await task.value
    }

    @Test("TC-TIME-030 setSleepMode로 도중에 모드를 바꿀 수 있다")
    func switchMode() async throws {
        let clock = TestClock()
        clock.setSleepMode(.immediate)
        try await clock.sleep(for: .seconds(1))
        #expect(clock.uptime == .seconds(1))
    }
}
