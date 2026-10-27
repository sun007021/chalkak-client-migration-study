import Foundation
import ChalkakCore

/// UTC 달력으로 만든 순간(테스트 입력용). Instant 파서에 의존하지 않는다.
func utc(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 0, _ mi: Int = 0, _ s: Int = 0) -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "UTC")!
    let comps = DateComponents(year: y, month: mo, day: d, hour: h, minute: mi, second: s)
    return cal.date(from: comps)!
}

func kst(_ y: Int, _ m: Int, _ d: Int) -> KSTDate { KSTDate(year: y, month: m, day: d)! }
