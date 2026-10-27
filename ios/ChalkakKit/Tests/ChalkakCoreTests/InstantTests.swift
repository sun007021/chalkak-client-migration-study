import Foundation
import Testing
import ChalkakCore

@Suite("Instant 파싱")
struct InstantTests {
    static let base = utc(2026, 10, 27, 1, 2, 3)

    struct Variant: Sendable, CustomTestStringConvertible {
        let text: String
        let fraction: Double
        var testDescription: String { text }
    }

    static let variants: [Variant] = [
        Variant(text: "2026-10-27T01:02:03Z", fraction: 0),
        Variant(text: "2026-10-27T01:02:03+00:00", fraction: 0),
        Variant(text: "2026-10-27T01:02:03.123Z", fraction: 0.123),
        Variant(text: "2026-10-27T01:02:03.123+00:00", fraction: 0.123),
        Variant(text: "2026-10-27T01:02:03.123456Z", fraction: 0.123456),
        Variant(text: "2026-10-27T01:02:03.123456+00:00", fraction: 0.123456),
        Variant(text: "2026-10-27T01:02:03.123456789Z", fraction: 0.123456789),
        Variant(text: "2026-10-27T01:02:03.5Z", fraction: 0.5),
        Variant(text: "2026-10-27T01:02:03.000Z", fraction: 0),
    ]

    @Test("TC-TIME-025 Z/+00:00, 소수초 없음·3·6·9자리 모두 같은 순간으로 파싱된다", arguments: variants)
    func parsesVariants(v: Variant) throws {
        let parsed = try #require(Instant.parse(v.text))
        #expect(abs(parsed.timeIntervalSince(Self.base) - v.fraction) < 1e-5)
    }

    @Test("TC-TIME-025 오프셋 +09:00은 UTC보다 9시간 이른 순간이다")
    func parsesNonUTCOffset() throws {
        let parsed = try #require(Instant.parse("2026-10-27T10:02:03+09:00"))
        #expect(abs(parsed.timeIntervalSince(Self.base)) < 1e-5)
        let fractional = try #require(Instant.parse("2026-10-27T10:02:03.250+09:00"))
        #expect(abs(fractional.timeIntervalSince(Self.base) - 0.25) < 1e-5)
    }

    @Test("TC-TIME-025 변형 문자열들은 서로 같은 순간(소수초 제외)이다")
    func variantsAgree() throws {
        let a = try #require(Instant.parse("2026-10-27T01:02:03Z"))
        let b = try #require(Instant.parse("2026-10-27T01:02:03+00:00"))
        #expect(a == b)
    }

    static let invalid: [String] = [
        "", " ", "not-a-date", "2026-10-27", "2026-13-01T00:00:00Z", "2026-10-27T25:00:00Z",
        "2026-02-30T00:00:00Z", "2026-10-27T01:02:03.Z", "2026-10-27T01:02:03.12ab34Z",
        "2026-10-27T01:02:03+25:00", "0000-00-00T00:00:00Z", "😀", "null",
        String(repeating: "9", count: 10_000),
    ]

    @Test("TC-TIME-026 파싱할 수 없는 문자열은 크래시 없이 nil이다", arguments: invalid)
    func invalidReturnsNil(text: String) {
        #expect(Instant.parse(text) == nil)
    }
}
