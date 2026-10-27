import Foundation

/// 서비스 시간대(Asia/Seoul) 날짜 계산·표시. 화면과 무관한 순수 함수만 둔다.
/// KST는 UTC+9 고정(서머타임 없음)이라 정수 산술로 계산하며, Calendar·Locale·기기 시간대를 읽지 않는다.
public enum KST {
    private static let utcOffsetSeconds = 9 * 3600
    private static let secondsPerDay = 86_400
    private static let daysPerWeek = 7

    /// 순간 → KST 날짜.
    public static func date(of instant: Date) -> KSTDate {
        KSTDate(daysSinceEpoch: localSeconds(of: instant).days)
    }

    /// 시계의 현재 순간 → KST 오늘.
    public static func today(clock: some AppClock) -> KSTDate {
        date(of: clock.now)
    }

    /// 게시물 `topicDate`가 지금(KST) 기준 오늘인지(D-23).
    public static func isToday(_ topicDate: KSTDate, now: Date) -> Bool {
        date(of: now) == topicDate
    }

    /// 날짜에 개월 수를 더한다. 대상 달에 같은 day가 없으면 말일로 보정(1/31 + 1개월 = 2/28 또는 2/29).
    public static func adding(months: Int, to date: KSTDate) -> KSTDate {
        let total = date.year * 12 + (date.month - 1) + months
        let (year, monthIndex) = (floorDiv(total, 12), floorMod(total, 12))
        return KSTDate.clamped(year: year, month: monthIndex + 1, day: date.day) ?? date
    }

    /// 일요일 시작 7일 주(일~토). 연말·월말을 넘으면 그대로 다음 해/달로 이어진다.
    public static func week(containing date: KSTDate) -> [KSTDate] {
        let days = date.daysSinceEpoch
        let sunday = days - CivilCalendar.weekday(daysSinceEpoch: days)
        return (0..<daysPerWeek).map { KSTDate(daysSinceEpoch: sunday + $0) }
    }

    /// 날짜들이 걸친 연-월(오름차순, 중복 없음). 캘린더 요청은 이 월마다 보낸다.
    public static func months(spannedBy dates: [KSTDate]) -> [YearMonth] {
        Set(dates.map { YearMonth(year: $0.year, month: $0.month) }).sorted()
    }

    /// "M월 d일"(0 패딩 없음).
    public static func monthDayLabel(_ date: KSTDate) -> String {
        "\(date.month)월 \(date.day)일"
    }

    /// 알림 시각 "M월 d일 HH:mm"(KST, 24시간제, 연도 없음, 로캘·기기 시간대 무관).
    public static func notificationTimestamp(_ instant: Date) -> String {
        let local = localSeconds(of: instant)
        let hour = local.secondOfDay / 3600
        let minute = local.secondOfDay % 3600 / 60
        let label = monthDayLabel(KSTDate(daysSinceEpoch: local.days))
        return "\(label) \(KSTDate.pad(hour, 2)):\(KSTDate.pad(minute, 2))"
    }

    // MARK: 내부

    private static func localSeconds(of instant: Date) -> (days: Int, secondOfDay: Int) {
        let seconds = Int(instant.timeIntervalSince1970.rounded(.down)) + utcOffsetSeconds
        return (floorDiv(seconds, secondsPerDay), floorMod(seconds, secondsPerDay))
    }

    private static func floorDiv(_ a: Int, _ b: Int) -> Int {
        let q = a / b
        return (a % b != 0 && (a < 0) != (b < 0)) ? q - 1 : q
    }

    private static func floorMod(_ a: Int, _ b: Int) -> Int {
        a - floorDiv(a, b) * b
    }
}

/// 전시 날짜 이동 범위: `FIRST_TOPIC_DATE` 이상, 오늘(KST) 이하.
public enum TopicDateBounds {
    public static func contains(_ date: KSTDate, today: KSTDate) -> Bool {
        date >= AppConstants.firstTopicDate && date <= today
    }
}
