import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport

@Suite("만료 판정(단조 시계)")
struct ExpiringDeadlineTests {
    // 발급 uptime 100초, expiresIn 60초, 마진 5초 → uptime 155초 정각부터 재발급 필요.
    static let issued = Duration.seconds(100)

    @Test("TC-TIME-027 만료 5초 전 직전(155초 미만)은 사용 가능하고 정각부터는 불가다")
    func boundaryAroundSafetyMargin() {
        let d = ExpiringDeadline(issuedAtUptime: Self.issued, expiresIn: .seconds(60))
        #expect(d.isUsable(atUptime: Self.issued))
        #expect(d.isUsable(atUptime: .seconds(154) + .milliseconds(999)))
        #expect(!d.isUsable(atUptime: .seconds(155)))
        #expect(!d.isUsable(atUptime: .seconds(159)))
        #expect(!d.isUsable(atUptime: .seconds(160)))
        #expect(!d.isUsable(atUptime: .seconds(1000)))
    }

    @Test("TC-TIME-027 기본 마진은 AppConstants.uploadURLSafetyMargin(5초)이다")
    func defaultMarginIsFiveSeconds() {
        let d = ExpiringDeadline(issuedAtUptime: .zero, expiresIn: .seconds(10))
        #expect(d.isUsable(atUptime: .seconds(4)))
        #expect(!d.isUsable(atUptime: .seconds(5)))
    }

    @Test("TC-TIME-027 expiresIn이 마진 이하이면 발급 직후에도 사용 불가다")
    func shortLivedIsNeverUsable() {
        let d = ExpiringDeadline(issuedAtUptime: .zero, expiresIn: .seconds(5))
        #expect(!d.isUsable(atUptime: .zero))
    }

    @Test("TC-TIME-027 기기 시계를 앞뒤로 조정해도 단조 시계 기준이라 판정이 바뀌지 않는다")
    func wallClockChangesDoNotAffect() {
        let clock = TestClock(now: utc(2026, 10, 27, 12, 0), uptime: Self.issued)
        let d = ExpiringDeadline(clock: clock, expiresIn: .seconds(60))
        clock.advance(by: .seconds(50))
        #expect(d.isUsable(clock: clock))

        clock.setNow(utc(2030, 1, 1))     // 시스템 시각을 크게 앞으로
        #expect(d.isUsable(clock: clock))
        clock.setNow(utc(2000, 1, 1))     // 크게 뒤로
        #expect(d.isUsable(clock: clock))

        clock.advance(by: .seconds(5))    // uptime 155초
        clock.setNow(utc(2000, 1, 1))
        #expect(!d.isUsable(clock: clock))
    }
}
