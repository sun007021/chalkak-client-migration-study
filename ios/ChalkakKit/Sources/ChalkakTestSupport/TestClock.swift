import ChalkakCore
import Foundation
import Synchronization

/// 가짜 시계. 실제로 기다리지 않고 `advance(by:)`로 가상 시간을 앞당겨 `sleep` 중인 작업을 깨운다.
/// - `advance(by:)`는 now와 uptime을 함께 전진시킨다. 기한이 지난 sleeper는 오래된 순(기한 오름차순)으로 깨운다.
/// - `setNow(_:)`는 벽시계만 바꾼다(uptime 불변) — 사용자가 기기 시각을 바꾼 상황을 흉내 낸다.
/// - 취소된 sleep은 `CancellationError`로 끝난다.
/// - `.immediate` 모드는 sleep을 기록만 하고 가상 시간을 그만큼 앞당긴 뒤 곧바로 돌아온다(재시도 백오프처럼 대기 길이만 검증할 때).
/// - 어느 모드든 sleep 요청 길이는 `recordedSleeps`에 쌓인다(0초 포함).
public final class TestClock: AppClock {
    public enum SleepMode: Sendable {
        /// 기본값. `advance(by:)`가 기한에 닿을 때까지 sleep이 머문다.
        case virtual
        /// 기록 후 즉시 반환. now·uptime은 요청한 길이만큼 전진한다.
        case immediate
    }

    private struct Sleeper {
        let deadline: Duration
        let continuation: CheckedContinuation<Void, any Error>
    }

    private struct State {
        var now: Date
        var uptime: Duration
        var nextID = 0
        var sleepers: [Int: Sleeper] = [:]
        var sleepMode: SleepMode
        var recordedSleeps: [Duration] = []
    }

    private let state: Mutex<State>

    public init(now: Date = Date(timeIntervalSince1970: 0), uptime: Duration = .zero, sleepMode: SleepMode = .virtual) {
        state = Mutex(State(now: now, uptime: uptime, sleepMode: sleepMode))
    }

    public var now: Date { state.withLock { $0.now } }
    public var uptime: Duration { state.withLock { $0.uptime } }

    /// 현재 sleep 중인 작업 수.
    public var sleeperCount: Int { state.withLock { $0.sleepers.count } }

    /// sleep 요청 길이 기록(요청 순서).
    public var recordedSleeps: [Duration] { state.withLock { $0.recordedSleeps } }

    public func setSleepMode(_ mode: SleepMode) {
        state.withLock { $0.sleepMode = mode }
    }

    public func sleep(for duration: Duration) async throws {
        let immediate = state.withLock { s -> Bool in
            s.recordedSleeps.append(duration)
            return s.sleepMode == .immediate
        }
        if immediate {
            try Task.checkCancellation()
            advance(by: max(duration, .zero))
            return
        }
        guard duration > .zero else { return }
        let id = state.withLock { s -> Int in
            s.nextID += 1
            return s.nextID
        }
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                let alreadyCancelled = state.withLock { s -> Bool in
                    if Task.isCancelled { return true }
                    s.sleepers[id] = Sleeper(deadline: s.uptime + duration, continuation: continuation)
                    return false
                }
                if alreadyCancelled { continuation.resume(throwing: CancellationError()) }
            }
        } onCancel: {
            let sleeper = state.withLock { $0.sleepers.removeValue(forKey: id) }
            sleeper?.continuation.resume(throwing: CancellationError())
        }
    }

    /// 가상 시간 전진. 기한이 된 sleeper를 깨운다.
    public func advance(by duration: Duration) {
        let due = state.withLock { s -> [Sleeper] in
            s.now = s.now.addingTimeInterval(Self.seconds(duration))
            s.uptime += duration
            let dueIDs = s.sleepers.filter { $0.value.deadline <= s.uptime }.keys
            let woken = dueIDs.compactMap { s.sleepers.removeValue(forKey: $0) }
            return woken.sorted { $0.deadline < $1.deadline }
        }
        for sleeper in due { sleeper.continuation.resume() }
    }

    /// 벽시계만 변경(단조 시계 uptime은 그대로).
    public func setNow(_ date: Date) {
        state.withLock { $0.now = date }
    }

    /// sleeper가 `count`개 이상 등록될 때까지 실시간 대기 없이 양보(`Task.yield`)하며 기다린다.
    public func waitUntilSleeperCount(atLeast count: Int) async {
        while sleeperCount < count { await Task.yield() }
    }

    private static func seconds(_ duration: Duration) -> TimeInterval {
        let parts = duration.components
        return Double(parts.seconds) + Double(parts.attoseconds) / 1e18
    }
}
