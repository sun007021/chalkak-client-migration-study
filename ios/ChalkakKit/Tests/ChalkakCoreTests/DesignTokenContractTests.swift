import Foundation
import Testing
import ChalkakTestSupport

/// `shared/design/tokens.json`과 앱 타깃의 `ChalkakTheme.swift` 값이 같은지 대조한다.
/// 앱 타깃은 SwiftPM 밖이라 소스 텍스트의 선언을 읽어 비교한다. 어긋나면 tokens.json이 기준이다.
@Suite("디자인 토큰 대조")
struct DesignTokenContractTests {
    static func tokens() throws -> [String: Any] {
        let url = RepoLayout.shared.appendingPathComponent("design/tokens.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url))
        return try #require(object as? [String: Any])
    }

    static func themeSource() throws -> String {
        let url = RepoLayout.root.appendingPathComponent("ios/App/Sources/DesignSystem/ChalkakTheme.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// `static let <name> = <rhs>` 한 줄의 우변을 이름별로 모은다.
    static func declarations(_ source: String) -> [String: String] {
        var result: [String: String] = [:]
        let pattern = #"static let (\w+)(?::\s*[\w.]+)?\s*=\s*(.+)"#
        let regex = try! NSRegularExpression(pattern: pattern)
        for line in source.split(separator: "\n") {
            let text = String(line)
            let range = NSRange(text.startIndex..., in: text)
            guard let m = regex.firstMatch(in: text, range: range),
                  let n = Range(m.range(at: 1), in: text), let r = Range(m.range(at: 2), in: text) else { continue }
            result[String(text[n])] = String(text[r])
        }
        return result
    }

    /// "#RRGGBB" / "rgba(r,g,b,a)" → (RRGGBB, 불투명도)
    static func parseToken(_ value: String) -> (hex: UInt32, alpha: Double)? {
        if value.hasPrefix("#"), let hex = UInt32(value.dropFirst(), radix: 16) { return (hex, 1) }
        guard value.hasPrefix("rgba(") else { return nil }
        let parts = value.dropFirst(5).dropLast().split(separator: ",").map { Double($0.trimmingCharacters(in: .whitespaces)) ?? -1 }
        guard parts.count == 4 else { return nil }
        let hex = (UInt32(parts[0]) << 16) | (UInt32(parts[1]) << 8) | UInt32(parts[2])
        return (hex, parts[3])
    }

    /// `Color(hex: 0x..)(.opacity(a))?`, `Color.white`, `Color.black`(.opacity(a))? 를 해석한다.
    static func parseSwift(_ rhs: String) -> (hex: UInt32, alpha: Double)? {
        var base: UInt32
        if let r = rhs.range(of: #"Color\(hex: 0x([0-9A-Fa-f]{6})\)"#, options: .regularExpression) {
            let digits = rhs[r].dropFirst("Color(hex: 0x".count).dropLast()
            base = UInt32(digits, radix: 16) ?? 0
        } else if rhs.hasPrefix("Color.white") {
            base = 0xFFFFFF
        } else if rhs.hasPrefix("Color.black") {
            base = 0x000000
        } else {
            return nil
        }
        var alpha = 1.0
        if let r = rhs.range(of: #"\.opacity\(([0-9.]+)\)"#, options: .regularExpression) {
            let number = rhs[r].dropFirst(".opacity(".count).dropLast()
            alpha = Double(number) ?? 1
        }
        return (base, alpha)
    }

    @Test("색 토큰이 tokens.json과 같다")
    func colors() throws {
        let colors = try #require(try Self.tokens()["color"] as? [String: String])
        let declared = Self.declarations(try Self.themeSource())
        for (name, value) in colors {
            let expected = try #require(Self.parseToken(value), "tokens.json 색 형식 오류: \(name)")
            let rhs = try #require(declared[name], "ChalkakColor.\(name) 없음")
            let actual = try #require(Self.parseSwift(rhs), "ChalkakColor.\(name) 해석 불가: \(rhs)")
            #expect(actual.hex == expected.hex, "\(name) 색이 다르다")
            #expect(abs(actual.alpha - expected.alpha) < 0.001, "\(name) 불투명도가 다르다")
        }
    }

    @Test("간격·라운드 토큰이 tokens.json과 같다")
    func spacingAndRadius() throws {
        let tokens = try Self.tokens()
        let declared = Self.declarations(try Self.themeSource())
        let spacing = try #require(tokens["spacing"] as? [String: NSNumber])
        for (name, number) in spacing {
            let value = number.doubleValue
            let rhs = try #require(declared[name], "ChalkakSpacing.\(name) 없음")
            #expect(Double(rhs.trimmingCharacters(in: .whitespaces)) == value, "spacing \(name) 값이 다르다")
        }
        let radius = try #require(tokens["radius"] as? [String: NSNumber])
        for (name, number) in radius where name != "pill" {
            let value = number.doubleValue
            let rhs = try #require(declared[name], "ChalkakRadius.\(name) 없음")
            #expect(Double(rhs.trimmingCharacters(in: .whitespaces)) == value, "radius \(name) 값이 다르다")
        }
    }

    @Test("글꼴 스타일의 서체와 크기가 tokens.json과 같다")
    func typography() throws {
        let font = try #require(try Self.tokens()["font"] as? [String: Any])
        let families = try #require(font["families"] as? [String: Any])
        let styles = try #require(font["styles"] as? [String: [String: Any]])
        let pretendard = try #require(families["pretendard"] as? [String: String])
        let declared = Self.declarations(try Self.themeSource())
        for (name, style) in styles {
            let rhs = try #require(declared[name], "ChalkakFont.\(name) 없음")
            let size = try #require((style["size"] as? NSNumber)?.doubleValue)
            let weight = (style["weight"] as? NSNumber)?.intValue ?? 400
            let family = try #require(style["family"] as? String)
            let expectedName: String
            switch family {
            case "pretendard":
                let key = weight >= 700 ? "bold" : (weight >= 600 ? "semibold" : "regular")
                expectedName = try #require(pretendard[key]).replacingOccurrences(of: ".otf", with: "")
            case "brand": expectedName = "Continuous"
            default: expectedName = "GriunXHangeulBanguri-Regular"
            }
            #expect(rhs.contains("\"\(expectedName)\""), "\(name) 서체가 다르다: \(rhs)")
            #expect(rhs.contains("size: \(Int(size))"), "\(name) 크기가 다르다: \(rhs)")
        }
    }
}
