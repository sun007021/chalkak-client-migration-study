import Foundation

/// KST 기준 달력 날짜(시각 없음). API의 `yyyy-MM-dd` 문자열과 1:1 대응한다.
public struct KSTDate: Sendable, Hashable, Comparable {
    public let year: Int
    public let month: Int
    public let day: Int

    /// 유효한 날짜가 아니면 `nil`(예: 2027-02-29).
    public init?(year: Int, month: Int, day: Int) {
        guard (1...9999).contains(year), (1...12).contains(month),
              (1...CivilCalendar.daysInMonth(year: year, month: month)).contains(day) else { return nil }
        self.year = year
        self.month = month
        self.day = day
    }

    /// 말일을 넘는 day는 그 달 말일로 보정한 날짜(예: 2027-02-29 → 2027-02-28). month는 1...12여야 하며 아니면 `nil`.
    public static func clamped(year: Int, month: Int, day: Int) -> KSTDate? {
        guard (1...12).contains(month), day >= 1 else { return nil }
        return KSTDate(year: year, month: month, day: min(day, CivilCalendar.daysInMonth(year: year, month: month)))
    }

    /// `yyyy-MM-dd` ASCII 문자열을 파싱한다. 형식·달력이 틀리면 `nil`.
    public init?(string: String) {
        let bytes = Array(string.utf8)
        guard bytes.count == 10, bytes[4] == UInt8(ascii: "-"), bytes[7] == UInt8(ascii: "-"),
              let year = Self.number(bytes[0..<4]),
              let month = Self.number(bytes[5..<7]),
              let day = Self.number(bytes[8..<10]) else { return nil }
        self.init(year: year, month: month, day: day)
    }

    /// API 쿼리용 `yyyy-MM-dd`(ASCII 숫자, 그레고리력).
    public var string: String {
        "\(Self.pad(year, 4))-\(Self.pad(month, 2))-\(Self.pad(day, 2))"
    }

    public static func < (lhs: KSTDate, rhs: KSTDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    // MARK: 내부 변환(KST 계산 전용)

    init(daysSinceEpoch days: Int) {
        let civil = CivilCalendar.civil(fromDaysSinceEpoch: days)
        self.year = civil.year
        self.month = civil.month
        self.day = civil.day
    }

    var daysSinceEpoch: Int {
        CivilCalendar.daysSinceEpoch(year: year, month: month, day: day)
    }

    private static func number(_ digits: ArraySlice<UInt8>) -> Int? {
        var value = 0
        for byte in digits {
            guard (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(byte) else { return nil }
            value = value * 10 + Int(byte - UInt8(ascii: "0"))
        }
        return value
    }

    static func pad(_ value: Int, _ width: Int) -> String {
        let text = String(value)
        return String(repeating: "0", count: max(0, width - text.count)) + text
    }
}

/// 연-월(주간 기록의 캘린더 요청 단위).
public struct YearMonth: Sendable, Hashable, Comparable {
    public let year: Int
    public let month: Int
    public init(year: Int, month: Int) {
        self.year = year
        self.month = month
    }
    public static func < (lhs: YearMonth, rhs: YearMonth) -> Bool {
        (lhs.year, lhs.month) < (rhs.year, rhs.month)
    }
}
