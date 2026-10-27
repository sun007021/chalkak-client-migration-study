import Foundation
import ChalkakCore

public enum NetworkConstants {
    /// 재시도 최대 횟수(총 3시도).
    public static let maxRetries = AppConstants.retryMax
    /// Retry-After 상한. 이보다 길면 기다리지 않고 재시도 없이 실패한다(common-infra 임시 결정, 5개 플랫폼 공통).
    public static let maxRetryAfter = AppConstants.retryAfterMax
}

public enum RetryPlan: Sendable, Equatable {
    case wait(Duration)
    /// 재시도하지 않고 받은 응답을 그대로 돌려준다.
    case stop
}

public enum RetryBackoff {
    /// 다음 시도 전 계획. `retryIndex`는 0부터, `status`는 응답이 있을 때만(전송 오류는 nil).
    /// - 429: 유효한 Retry-After가 상한 이내일 때만 그만큼 기다리고, 없거나 유효하지 않거나 상한 초과면 `.stop`.
    /// - 503: 유효한 Retry-After면 그만큼(상한 초과면 `.stop`), 아니면 기본 백오프.
    /// - 그 밖(전송 오류·다른 5xx): 기본 백오프(`AppConstants.retryBackoff`). Retry-After는 무시.
    public static func plan(retryIndex: Int, status: Int?, retryAfter: String?, now: Date) -> RetryPlan {
        if status == 429 || status == 503 {
            if let requested = parseRetryAfter(retryAfter, now: now) {
                return requested <= NetworkConstants.maxRetryAfter ? .wait(requested) : .stop
            }
            if status == 429 { return .stop }
        }
        let table = AppConstants.retryBackoff
        return .wait(table[min(max(0, retryIndex), table.count - 1)])
    }

    /// 초 값 또는 HTTP 날짜를 Duration으로. 유효하지 않으면(음수·비숫자·과거 날짜) nil. Int 범위를 넘는 큰 수는 아주 긴 시간이다.
    public static func parseRetryAfter(_ value: String?, now: Date) -> Duration? {
        guard let text = value?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
        if text.utf8.allSatisfy({ (UInt8(ascii: "0")...UInt8(ascii: "9")).contains($0) }) {
            return .seconds(Int64(text) ?? Int64.max)
        }
        guard let date = httpDateFormatter().date(from: text) else { return nil }
        let delta = date.timeIntervalSince(now)
        return delta >= 0 ? .seconds(delta) : nil
    }

    private static func httpDateFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
        return formatter
    }
}
