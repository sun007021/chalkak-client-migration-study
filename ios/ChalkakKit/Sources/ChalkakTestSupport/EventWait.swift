import Foundation

/// 어떤 사건을 기다리되, 그 사건을 일으켜야 할 작업이 먼저 끝나 버리면(스텁·조기 실패) 기다림을 접는다.
/// 일어나지 않을 사건을 `CallSignal.wait`·`waitUntilSleeperCount`로 그냥 기다리면 테스트가 멈추므로, 실패해도 바로 끝나게 한다.
public enum EventWait {
    private actor Outcome {
        private(set) var eventFirst: Bool?
        func record(_ value: Bool) { if eventFirst == nil { eventFirst = value } }
    }

    /// `event`가 `task`보다 먼저 일어났으면 true, 작업이 먼저 끝났으면 false.
    public static func happens<T: Sendable, F: Error>(
        _ event: @escaping @Sendable () async -> Void,
        before task: Task<T, F>
    ) async -> Bool {
        let done = CallSignal()
        let outcome = Outcome()
        let eventWaiter = Task { await event(); await outcome.record(true); await done.fire() }
        let finishWaiter = Task { _ = await task.result; await outcome.record(false); await done.fire() }
        await done.wait()
        // 먼저 끝난 쪽만 남기고 나머지 대기 Task는 정리한다.
        eventWaiter.cancel()
        finishWaiter.cancel()
        return await outcome.eventFirst == true
    }

    public static func signal<T: Sendable, F: Error>(_ signal: CallSignal, atLeast count: Int = 1, before task: Task<T, F>) async -> Bool {
        await happens({ await signal.wait(atLeast: count) }, before: task)
    }

    public static func sleeper<T: Sendable, F: Error>(on clock: TestClock, atLeast count: Int = 1, before task: Task<T, F>) async -> Bool {
        await happens({ await clock.waitUntilSleeperCount(atLeast: count) }, before: task)
    }
}
