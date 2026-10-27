import Foundation

/// 업로드 URL 같은 만료형 자원의 사용 가능 여부를 **단조 시계(uptime)** 로 판정한다. 시스템 시각 변경에 영향받지 않는다.
/// 사용 가능 조건: `now < issuedAt + expiresIn - safetyMargin` (정각이면 이미 불가 → 새로 발급).
public struct ExpiringDeadline: Sendable {
    private let usableUntil: Duration

    public init(issuedAtUptime: Duration, expiresIn: Duration, safetyMargin: Duration = AppConstants.uploadURLSafetyMargin) {
        usableUntil = issuedAtUptime + expiresIn - safetyMargin
    }

    public init(clock: some AppClock, expiresIn: Duration, safetyMargin: Duration = AppConstants.uploadURLSafetyMargin) {
        self.init(issuedAtUptime: clock.uptime, expiresIn: expiresIn, safetyMargin: safetyMargin)
    }

    public func isUsable(atUptime uptime: Duration) -> Bool { uptime < usableUntil }

    public func isUsable(clock: some AppClock) -> Bool { isUsable(atUptime: clock.uptime) }
}
