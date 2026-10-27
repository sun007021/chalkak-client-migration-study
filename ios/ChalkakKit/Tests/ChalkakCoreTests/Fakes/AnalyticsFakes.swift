import ChalkakCore
import Synchronization

/// 호출을 기록하는 Fake tracker.
final class SpyAnalyticsTracker: AnalyticsTracker {
    private let storage = Mutex<[AnalyticsEvent]>([])
    var events: [AnalyticsEvent] { storage.withLock { $0 } }
    func track(_ event: AnalyticsEvent) throws { storage.withLock { $0.append(event) } }
}

struct AnalyticsBoom: Error {}

/// 항상 throw하는 tracker(시도 횟수는 기록).
final class ThrowingAnalyticsTracker: AnalyticsTracker {
    private let count = Mutex(0)
    var attempts: Int { count.withLock { $0 } }
    func track(_ event: AnalyticsEvent) throws {
        count.withLock { $0 += 1 }
        throw AnalyticsBoom()
    }
}

final class LogSink: Sendable {
    private let storage = Mutex<[String]>([])
    var lines: [String] { storage.withLock { $0 } }
    func append(_ line: String) { storage.withLock { $0.append(line) } }
}
