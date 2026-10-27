import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport

@Suite("KST 날짜 계산")
struct KSTTests {
    // MARK: TC-TIME-001, 002

    @Test("TC-TIME-001 UTC 2026-10-26T15:00:00Z의 KST 오늘은 2026-10-27이다")
    func kstTodayAtMidnightBoundary() {
        #expect(KST.date(of: utc(2026, 10, 26, 15, 0, 0)).string == "2026-10-27")
    }

    @Test("TC-TIME-002 UTC 2026-10-26T14:59:59Z의 KST 오늘은 2026-10-26이다")
    func kstTodayOneSecondBeforeMidnight() {
        #expect(KST.date(of: utc(2026, 10, 26, 14, 59, 59)).string == "2026-10-26")
    }

    @Test("TC-TIME-001 AppClock 주입으로 오늘을 계산한다")
    func todayUsesInjectedClock() {
        let clock = TestClock(now: utc(2026, 10, 26, 15, 0, 0))
        #expect(KST.today(clock: clock) == kst(2026, 10, 27))
        clock.setNow(utc(2026, 10, 26, 14, 59, 59))
        #expect(KST.today(clock: clock) == kst(2026, 10, 26))
    }

    // MARK: TC-TIME-003, 004, 005

    // 기기 설정 독립성은 (a) 대표 순간의 값 검증 + (b) DeviceIndependenceTests의 정적 검사(기기 시간대·로캘 API 사용 0)로 보장한다.
    // 값은 미국·유럽·날짜변경선 근처 기기에서도 KST 규칙 하나뿐이라는 점을 드러내는 순간들이다.
    @Test("TC-TIME-003 경계 순간의 KST 날짜는 기기 설정과 무관한 하나의 값이다")
    func representativeInstants() {
        #expect(KST.date(of: utc(2026, 10, 26, 15, 0, 0)).string == "2026-10-27")
        #expect(KST.date(of: utc(2026, 10, 26, 14, 59, 59)).string == "2026-10-26")
        #expect(KST.date(of: utc(2026, 10, 27, 0, 0, 0)).string == "2026-10-27")   // UTC 자정 = KST 09:00
        #expect(KST.date(of: utc(2026, 10, 27, 14, 59, 59)).string == "2026-10-27")
    }

    struct DSTCase: Sendable, CustomTestStringConvertible {
        let zone: String
        let instant: Date
        let expected: String
        var testDescription: String { "\(zone) \(expected)" }
    }

    // KST = UTC+9, 서머타임 없음. 전환일 앞뒤 순간.
    static let dstCases: [DSTCase] = [
        // 미국 봄 전환(2026-03-08), 가을 전환(2026-11-01), 유럽 전환(2026-03-29, 2026-10-25)
        DSTCase(zone: "America/New_York", instant: utc(2026, 3, 8, 6, 30), expected: "2026-03-08"),
        DSTCase(zone: "America/New_York", instant: utc(2026, 3, 8, 15, 0), expected: "2026-03-09"),
        DSTCase(zone: "America/New_York", instant: utc(2026, 11, 1, 5, 30), expected: "2026-11-01"),
        DSTCase(zone: "America/New_York", instant: utc(2026, 11, 1, 15, 0), expected: "2026-11-02"),
        DSTCase(zone: "Europe/London", instant: utc(2026, 3, 29, 0, 59), expected: "2026-03-29"),
        DSTCase(zone: "Europe/London", instant: utc(2026, 3, 29, 15, 0), expected: "2026-03-30"),
        DSTCase(zone: "Europe/London", instant: utc(2026, 10, 25, 0, 59), expected: "2026-10-25"),
        DSTCase(zone: "Europe/London", instant: utc(2026, 10, 25, 15, 0), expected: "2026-10-26"),
    ]

    @Test("TC-TIME-004 서머타임 전환일에도 KST 규칙으로 계산한다", arguments: dstCases)
    func daylightSavingDoesNotMatter(c: DSTCase) {
        #expect(KST.date(of: c.instant).string == c.expected)
    }

    @Test("TC-TIME-005 날짜 문자열은 그레고리력 ASCII yyyy-MM-dd다(로캘 API를 쓰지 않으므로 불교력·아랍 숫자가 끼어들지 않는다)")
    func asciiGregorianDateString() {
        let text = KST.date(of: utc(2026, 10, 26, 15, 0, 0)).string
        #expect(text == "2026-10-27")
        #expect(text.unicodeScalars.allSatisfy { $0.isASCII })
    }

    @Test("TC-TIME-005 월·일·연도가 한 자리/네 자리여도 0 패딩된 ASCII다")
    func stringIsZeroPadded() {
        #expect(kst(2026, 1, 5).string == "2026-01-05")
        #expect(KSTDate(string: "2026-01-05") == kst(2026, 1, 5))
        #expect(KSTDate(string: "2026-1-5") == nil)
        #expect(KSTDate(string: "2026-02-30") == nil)
        #expect(KSTDate(string: "") == nil)
    }

    // MARK: TC-TIME-009 (+ 007의 상한)

    @Test("TC-TIME-009 FIRST_TOPIC_DATE 2026-09-17 하한: 09-17은 가능, 09-16은 막힌다")
    func firstTopicDateLowerBound() {
        let today = kst(2026, 10, 27)
        #expect(TopicDateBounds.contains(kst(2026, 9, 17), today: today))
        #expect(!TopicDateBounds.contains(kst(2026, 9, 16), today: today))
        #expect(!TopicDateBounds.contains(kst(2025, 12, 31), today: today))
    }

    @Test("TC-TIME-007 상한: 오늘은 가능, 내일은 막힌다")
    func todayUpperBound() {
        let today = kst(2026, 10, 27)
        #expect(TopicDateBounds.contains(today, today: today))
        #expect(!TopicDateBounds.contains(kst(2026, 10, 28), today: today))
    }

    @Test("TC-TIME-009 오늘이 하한과 같은 날이면 그 하루만 가능하다")
    func boundsWhenTodayIsFirstDate() {
        let first = AppConstants.firstTopicDate
        #expect(TopicDateBounds.contains(first, today: first))
        #expect(!TopicDateBounds.contains(kst(2026, 9, 18), today: first))
    }

    // MARK: TC-TIME-011

    struct MonthCase: Sendable, CustomTestStringConvertible {
        let from: KSTDate
        let months: Int
        let expected: KSTDate
        var testDescription: String { "\(from.string) \(months >= 0 ? "+" : "")\(months)개월" }
    }

    static let monthCases: [MonthCase] = [
        MonthCase(from: kst(2026, 1, 31), months: 1, expected: kst(2026, 2, 28)),
        MonthCase(from: kst(2026, 3, 31), months: 1, expected: kst(2026, 4, 30)),
        MonthCase(from: kst(2026, 3, 31), months: -1, expected: kst(2026, 2, 28)),
        MonthCase(from: kst(2028, 1, 31), months: 1, expected: kst(2028, 2, 29)),
        MonthCase(from: kst(2027, 1, 31), months: 1, expected: kst(2027, 2, 28)),
        MonthCase(from: kst(2028, 2, 29), months: 12, expected: kst(2029, 2, 28)),
        MonthCase(from: kst(2026, 12, 15), months: 1, expected: kst(2027, 1, 15)),
        MonthCase(from: kst(2026, 1, 15), months: -1, expected: kst(2025, 12, 15)),
        MonthCase(from: kst(2026, 10, 27), months: 0, expected: kst(2026, 10, 27)),
    ]

    @Test("TC-TIME-011 월 이동 시 말일로 보정한다", arguments: monthCases)
    func monthShiftClampsToEndOfMonth(c: MonthCase) {
        #expect(KST.adding(months: c.months, to: c.from) == c.expected)
    }

    @Test("TC-TIME-011 윤년 2028-02-29는 유효하고 2027-02-29는 02-28로 보정된다")
    func leapDayValidityAndClamp() {
        #expect(KSTDate(year: 2028, month: 2, day: 29) != nil)
        #expect(KSTDate(year: 2027, month: 2, day: 29) == nil)
        #expect(KSTDate.clamped(year: 2028, month: 2, day: 29) == kst(2028, 2, 29))
        #expect(KSTDate.clamped(year: 2027, month: 2, day: 29) == kst(2027, 2, 28))
        #expect(KSTDate.clamped(year: 2026, month: 4, day: 31) == kst(2026, 4, 30))
        #expect(KSTDate.clamped(year: 2026, month: 13, day: 1) == nil)
    }

    // MARK: TC-TIME-012

    @Test("TC-TIME-012 2026-10-25(일)~10-31(토) 주는 일요일 시작 7일이다", arguments: [25, 26, 28, 31])
    func weekStartsOnSunday(day: Int) {
        let week = KST.week(containing: kst(2026, 10, day))
        #expect(week.first == kst(2026, 10, 25))
        #expect(week.last == kst(2026, 10, 31))
        #expect(week.count == 7)
        #expect(KST.months(spannedBy: week) == [YearMonth(year: 2026, month: 10)])
    }

    @Test("TC-TIME-012 연말 경계 주 2026-12-27~2027-01-02는 두 해에 걸치고 캘린더 월 2개가 나온다",
          arguments: [kst(2026, 12, 27), kst(2026, 12, 31), kst(2027, 1, 1), kst(2027, 1, 2)])
    func weekAcrossYearBoundary(date: KSTDate) {
        let week = KST.week(containing: date)
        #expect(week.first == kst(2026, 12, 27))
        #expect(week.last == kst(2027, 1, 2))
        #expect(week.count == 7)
        #expect(week.map(\.string) == ["2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"])
        #expect(KST.months(spannedBy: week) == [YearMonth(year: 2026, month: 12), YearMonth(year: 2027, month: 1)])
    }

    @Test("TC-TIME-012 월 경계 주 2026-05-31~06-06은 두 달에 걸친다")
    func weekAcrossMonthBoundary() {
        let week = KST.week(containing: kst(2026, 6, 3))
        #expect(week.first == kst(2026, 5, 31))
        #expect(KST.months(spannedBy: week) == [YearMonth(year: 2026, month: 5), YearMonth(year: 2026, month: 6)])
    }

    @Test("TC-TIME-012 months(spannedBy:)는 중복 없이 오름차순이고 빈 입력은 빈 배열이다")
    func monthsAreSortedAndUnique() {
        let dates = [kst(2026, 11, 2), kst(2026, 10, 30), kst(2026, 11, 1), kst(2026, 10, 31)]
        #expect(KST.months(spannedBy: dates) == [YearMonth(year: 2026, month: 10), YearMonth(year: 2026, month: 11)])
        #expect(KST.months(spannedBy: []).isEmpty)
    }

    // MARK: TC-TIME-022

    @Test("TC-TIME-022 topicDate가 KST 오늘일 때만 true다 (자정 직전·직후 포함)")
    func isTodayBoundaries() {
        let justBeforeMidnight = utc(2026, 10, 26, 14, 59, 59)   // KST 10-26 23:59:59
        let justAfterMidnight = utc(2026, 10, 26, 15, 0, 0)      // KST 10-27 00:00:00
        #expect(KST.isToday(kst(2026, 10, 26), now: justBeforeMidnight))
        #expect(!KST.isToday(kst(2026, 10, 27), now: justBeforeMidnight))
        #expect(KST.isToday(kst(2026, 10, 27), now: justAfterMidnight))
        #expect(!KST.isToday(kst(2026, 10, 26), now: justAfterMidnight))   // 어제
    }

    // MARK: TC-TIME-023

    @Test("TC-TIME-023 날짜 라벨은 월·일 0 패딩이 없다",
          arguments: [(kst(2026, 1, 5), "1월 5일"), (kst(2026, 12, 31), "12월 31일"), (kst(2026, 10, 7), "10월 7일"), (kst(2026, 9, 17), "9월 17일")])
    func monthDayLabelHasNoZeroPadding(date: KSTDate, expected: String) {
        #expect(KST.monthDayLabel(date) == expected)
    }

    // MARK: TC-TIME-024

    struct TimestampCase: Sendable, CustomTestStringConvertible {
        let instant: Date
        let expected: String
        var testDescription: String { expected }
    }

    static let timestampCases: [TimestampCase] = [
        TimestampCase(instant: utc(2026, 10, 26, 15, 5), expected: "10월 27일 00:05"),
        TimestampCase(instant: utc(2026, 10, 27, 4, 30), expected: "10월 27일 13:30"),
        TimestampCase(instant: utc(2027, 1, 5, 3, 7), expected: "1월 5일 12:07"),
        TimestampCase(instant: utc(2026, 12, 31, 14, 59), expected: "12월 31일 23:59"),
        TimestampCase(instant: utc(2026, 12, 31, 15, 0), expected: "1월 1일 00:00"),
    ]

    @Test("TC-TIME-024 알림 시각은 'M월 d일 HH:mm' KST 24시간제이고 연도가 없다", arguments: timestampCases)
    func notificationTimestampFormat(c: TimestampCase) {
        #expect(KST.notificationTimestamp(c.instant) == c.expected)
    }

    @Test("TC-TIME-024 12시간제 로캘이 쓰는 오후 시각도 24시간제로 표시한다")
    func notificationTimestampIs24Hour() {
        #expect(KST.notificationTimestamp(utc(2026, 10, 27, 4, 30)) == "10월 27일 13:30")
        #expect(KST.notificationTimestamp(utc(2026, 10, 27, 14, 5)) == "10월 27일 23:05")
    }
}
