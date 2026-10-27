import Foundation
import Testing
import ChalkakTestSupport

/// 기기 시간대·로캘·시스템 시각을 직접 읽는 코드가 소스에 없음을 정적으로 검사한다(TC-TIME-003/004/005/029).
/// 값 검증만으로는 "어떤 기기 설정에서도 같다"를 보장할 수 없어서, 의존 자체를 막는다.
@Suite("기기 설정 독립성 정적 검사")
struct DeviceIndependenceTests {
    /// 금지 패턴. `Date()`는 SystemClock 정의 파일에서만 허용한다.
    static let forbidden: [(label: String, pattern: String)] = [
        ("Calendar.current", #"\bCalendar\s*\.\s*(autoupdatingCurrent|current)\b"#),
        ("TimeZone.current", #"\bTimeZone\s*\.\s*(autoupdatingCurrent|current)\b"#),
        ("Locale.current", #"\bLocale\s*\.\s*(autoupdatingCurrent|current)\b"#),
        ("Date()", #"\bDate\s*\(\s*\)"#),
        ("Date.now", #"\bDate\s*\.\s*now\b"#),
    ]

    static let scannedTargets = ["ChalkakCore", "ChalkakNetwork", "ChalkakData", "ChalkakFeatures"]

    /// 주석(`//` 줄 끝, `/* */`)을 비운 소스.
    static func stripComments(_ source: String) -> String {
        var result = source
        result = result.replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
        result = result.replacingOccurrences(of: #"//[^\n]*"#, with: "", options: .regularExpression)
        return result
    }

    /// 위반 라벨 목록. `allowsDate`가 true면 `Date()`·`Date.now`는 허용한다.
    static func violations(in source: String, allowsDate: Bool) -> [String] {
        let code = stripComments(source)
        return forbidden.compactMap { entry in
            if allowsDate, entry.label.hasPrefix("Date") { return nil }
            return code.range(of: entry.pattern, options: .regularExpression) != nil ? entry.label : nil
        }
    }

    static func definesSystemClock(_ source: String) -> Bool {
        stripComments(source).range(of: #"\b(struct|final class|class|enum)\s+SystemClock\b"#, options: .regularExpression) != nil
    }

    @Test("TC-TIME-003 TC-TIME-004 TC-TIME-005 TC-TIME-029 앱 소스는 기기 시간대·로캘·시스템 시각을 직접 읽지 않는다", arguments: scannedTargets)
    func sourcesDoNotReadDeviceSettings(target: String) throws {
        let files = RepoLayout.swiftFiles(inTarget: target)
        #expect(!files.isEmpty || target != "ChalkakCore", "\(target) 소스를 찾지 못했다")
        for file in files {
            let source = try String(contentsOf: file, encoding: .utf8)
            let found = Self.violations(in: source, allowsDate: Self.definesSystemClock(source))
            #expect(found.isEmpty, "\(file.lastPathComponent): \(found.joined(separator: ", ")) 사용 금지(AppClock·KST·KSTDate를 쓴다)")
        }
    }

    @Test("SystemClock 정의는 정확히 한 파일에 있다")
    func systemClockDefinedOnce() throws {
        var owners: [String] = []
        for target in Self.scannedTargets {
            for file in RepoLayout.swiftFiles(inTarget: target) {
                if Self.definesSystemClock(try String(contentsOf: file, encoding: .utf8)) { owners.append(file.lastPathComponent) }
            }
        }
        #expect(owners.count == 1, "SystemClock 정의 파일: \(owners)")
    }

    // MARK: 검사기 자체

    @Test("검사기는 금지 패턴을 잡는다", arguments: [
        "let c = Calendar.current", "TimeZone.current.identifier", "let l = Locale.current",
        "let now = Date()", "let now = Date.now", "Calendar . autoupdatingCurrent", "TimeZone.autoupdatingCurrent",
    ])
    func detectsForbidden(snippet: String) {
        #expect(!Self.violations(in: snippet, allowsDate: false).isEmpty)
    }

    @Test("검사기는 주석과 무해한 코드를 잡지 않는다", arguments: [
        "// Calendar.current 를 쓰지 않는다", "/* TimeZone.current */ let a = 1",
        "let d = Date(timeIntervalSince1970: 0)", "let z = TimeZone(identifier: \"GMT\")", "let currentDate = 1",
    ])
    func ignoresHarmless(snippet: String) {
        #expect(Self.violations(in: snippet, allowsDate: false).isEmpty)
    }

    @Test("SystemClock 정의 파일에서만 Date()를 허용한다")
    func allowsDateOnlyForClock() {
        #expect(Self.violations(in: "let n = Date()", allowsDate: true).isEmpty)
        #expect(Self.violations(in: "let l = Locale.current; let n = Date()", allowsDate: true) == ["Locale.current"])
    }
}
