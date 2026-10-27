import Foundation

/// 서버 Instant(ISO-8601) 파싱. `Z`/`±hh:mm` 오프셋, 소수초 0~9자리를 모두 받는다.
/// Linux의 ISO8601DateFormatter는 소수초 처리가 달라 쓰지 않고 직접 파싱한다.
public enum Instant {
    /// 파싱할 수 없으면 `nil`(크래시·throw 없음). 호출 측이 InvalidResponse 또는 null 처리를 정한다.
    public static func parse(_ text: String) -> Date? {
        var reader = Reader(bytes: Array(text.utf8))
        guard let year = reader.digits(4), reader.expect("-"),
              let month = reader.digits(2), reader.expect("-"),
              let day = reader.digits(2), reader.expect("T"),
              let hour = reader.digits(2), reader.expect(":"),
              let minute = reader.digits(2), reader.expect(":"),
              let second = reader.digits(2),
              let fraction = reader.fraction(),
              let offset = reader.offsetSeconds(), reader.isAtEnd,
              let date = KSTDate(year: year, month: month, day: day),
              hour < 24, minute < 60, second < 60 else { return nil }

        let local = date.daysSinceEpoch * 86_400 + hour * 3600 + minute * 60 + second
        return Date(timeIntervalSince1970: Double(local - offset) + fraction)
    }

    private struct Reader {
        let bytes: [UInt8]
        var index = 0

        var isAtEnd: Bool { index == bytes.count }

        mutating func expect(_ char: Unicode.Scalar) -> Bool {
            guard index < bytes.count, bytes[index] == UInt8(ascii: char) else { return false }
            index += 1
            return true
        }

        mutating func digits(_ count: Int) -> Int? {
            guard index + count <= bytes.count else { return nil }
            var value = 0
            for byte in bytes[index..<index + count] {
                guard let digit = Self.digit(byte) else { return nil }
                value = value * 10 + digit
            }
            index += count
            return value
        }

        /// 소수초가 없으면 0. `.` 뒤에는 1~9자리 숫자가 있어야 한다.
        mutating func fraction() -> Double? {
            guard index < bytes.count, bytes[index] == UInt8(ascii: ".") else { return 0 }
            index += 1
            var value = 0.0, scale = 1.0, count = 0
            while index < bytes.count, let digit = Self.digit(bytes[index]) {
                count += 1
                scale /= 10
                value += Double(digit) * scale
                index += 1
            }
            return (1...9).contains(count) ? value : nil
        }

        /// `Z` 또는 `±hh:mm`(시 0~23, 분 0~59). UTC 대비 초.
        mutating func offsetSeconds() -> Int? {
            if expect("Z") { return 0 }
            let sign: Int
            if expect("+") { sign = 1 } else if expect("-") { sign = -1 } else { return nil }
            guard let hours = digits(2), expect(":"), let minutes = digits(2),
                  hours < 24, minutes < 60 else { return nil }
            return sign * (hours * 3600 + minutes * 60)
        }

        private static func digit(_ byte: UInt8) -> Int? {
            (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(byte) ? Int(byte - UInt8(ascii: "0")) : nil
        }
    }
}
