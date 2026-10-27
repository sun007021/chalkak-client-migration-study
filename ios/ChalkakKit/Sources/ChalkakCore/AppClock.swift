import Foundation

/// 시간 의존 로직의 유일한 시계. `Date()`·`Task.sleep`을 직접 부르지 않고 이것을 주입받는다.
public protocol AppClock: Sendable {
    /// 벽시계 현재 시각(표시·KST 날짜 계산용).
    var now: Date { get }
    /// 단조 시계 값(경과 시간·만료 판정용). 시스템 시각 변경에 영향받지 않는다.
    var uptime: Duration { get }
    /// 주어진 시간만큼 기다린다. 취소되면 `CancellationError`를 던진다.
    func sleep(for duration: Duration) async throws
}

/// 실제 시스템 시계. 앱 조립 지점에서만 만든다.
public struct SystemClock: AppClock {
    private static let origin = ContinuousClock.now

    public init() {}

    public var now: Date { Date() }
    public var uptime: Duration { ContinuousClock.now - Self.origin }

    public func sleep(for duration: Duration) async throws {
        try await Task.sleep(for: duration)
    }
}
