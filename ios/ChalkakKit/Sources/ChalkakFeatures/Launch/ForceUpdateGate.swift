import Foundation
import ChalkakCore

public enum VersionGateResult: Sendable, Equatable {
    case passed
    case updateRequired
}

public protocol VersionGating: Sendable {
    func evaluate() async -> VersionGateResult
}

/// 스토어 최신 버전 조회. nil = 응답에 버전 없음(results 빔). 네트워크·5xx는 throw.
public protocol StoreVersionLookup: Sendable {
    func latestVersion() async throws -> String?
}

/// iOS 강제 업데이트 게이트(D-15). 조회 실패·타임아웃·파싱 실패·오프라인·`enabled == false`면 통과한다.
/// 한 번 `updateRequired`로 확인되면 이후 조회가 실패해도 유지한다(sticky).
public actor ForceUpdateGate: VersionGating {
    private let enabled: Bool
    private let installedVersion: AppVersion?
    private let lookup: any StoreVersionLookup
    private let clock: any AppClock
    private let timeout: Duration
    private var confirmedRequired = false

    public init(
        enabled: Bool,
        installedVersion: String,
        lookup: any StoreVersionLookup,
        clock: any AppClock,
        timeout: Duration = AppConstants.versionLookupTimeout
    ) {
        self.enabled = enabled
        self.installedVersion = AppVersion(parsing: installedVersion)
        self.lookup = lookup
        self.clock = clock
        self.timeout = timeout
    }

    /// 조회는 `timeout`(가짜 시계 기준) 안에 끝나야 한다. 정확히 timeout 시점은 중단·통과.
    public func evaluate() async -> VersionGateResult {
        if confirmedRequired { return .updateRequired }
        guard enabled, let installedVersion else { return .passed }
        guard let text = await lookupWithTimeout(), let store = AppVersion(parsing: text) else { return .passed }
        guard AppVersion.requiresUpdate(installed: installedVersion, store: store) else { return .passed }
        confirmedRequired = true
        return .updateRequired
    }

    /// 조회와 타임아웃을 경쟁시켜 먼저 끝난 쪽만 쓴다. 두 작업은 구조화 그룹이 아니라 독립 Task이므로 취소에 협조하지 않는
    /// 조회가 있어도 타임아웃 시점에 바로 돌아온다(남은 조회는 취소만 요청하고 기다리지 않는다). 실패·타임아웃·버전 없음은 모두 nil.
    private func lookupWithTimeout() async -> String? {
        let lookup = lookup, clock = clock, timeout = timeout
        let (results, sink) = AsyncStream<LookupOutcome>.makeStream(bufferingPolicy: .bufferingNewest(1))
        let lookupTask = Task {
            do { sink.yield(.version(try await lookup.latestVersion())) } catch { sink.yield(.failed) }
        }
        let timerTask = Task {
            do { try await clock.sleep(for: timeout) } catch { return }
            sink.yield(.timedOut)
        }
        let first = await withTaskCancellationHandler {
            var iterator = results.makeAsyncIterator()
            return await iterator.next()
        } onCancel: {
            lookupTask.cancel()
            timerTask.cancel()
            sink.finish()
        }
        lookupTask.cancel()
        timerTask.cancel()
        if case .version(let version)? = first { return version }
        return nil
    }

    private enum LookupOutcome: Sendable {
        case version(String?)
        case timedOut
        case failed
    }
}
