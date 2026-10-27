import Foundation

// 공용 fixture(`shared/fixtures`)와 공용 문구(`shared/copy/ko.json`)를 테스트에서 읽는 헬퍼.
// 테스트 전용이다. 앱 타깃에는 넣지 않는다. Linux(Docker, 레포가 /repo에 마운트)와 macOS(Xcode 포함) 모두에서 동작한다.

/// 레포 안의 경로를 찾는다. 이 파일의 `#filePath`에서 위로 올라가며 `shared/fixtures/manifest.json`이 있는 폴더를 레포 루트로 본다.
/// 환경 변수 `CHALKAK_REPO_ROOT`가 있으면 그것을 먼저 쓴다.
public enum RepoLayout {
    public static let root: URL = {
        let marker = "shared/fixtures/manifest.json"
        var candidates: [URL] = []
        if let override = ProcessInfo.processInfo.environment["CHALKAK_REPO_ROOT"], !override.isEmpty {
            candidates.append(URL(fileURLWithPath: override))
        }
        candidates.append(URL(fileURLWithPath: #filePath).deletingLastPathComponent())
        for start in candidates {
            var dir = start
            for _ in 0..<12 {
                if FileManager.default.fileExists(atPath: dir.appendingPathComponent(marker).path) { return dir }
                let parent = dir.deletingLastPathComponent()
                if parent == dir { break }
                dir = parent
            }
        }
        fatalError("레포 루트를 찾지 못했다(\(marker)). CHALKAK_REPO_ROOT를 지정하라.")
    }()

    public static var shared: URL { root.appendingPathComponent("shared") }
    public static var kitSources: URL { root.appendingPathComponent("ios/ChalkakKit/Sources") }

    /// 한 SwiftPM 타깃 소스 폴더 아래의 모든 .swift 파일(경로 정렬).
    public static func swiftFiles(inTarget target: String) -> [URL] {
        let dir = kitSources.appendingPathComponent(target)
        guard let enumerator = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return enumerator.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.path < $1.path }
    }
}

public enum FixtureError: Error, Equatable, CustomStringConvertible {
    case notFound(String)
    case notInManifest(String)
    case malformed(String)

    public var description: String {
        switch self {
        case let .notFound(name): "fixture 파일 없음: \(name)"
        case let .notInManifest(name): "manifest.json에 없는 fixture: \(name)"
        case let .malformed(message): "fixture 형식 오류: \(message)"
        }
    }
}

/// `shared/fixtures/<영역>/<이름>.json` 한 개 + manifest 항목.
public struct Fixture: Sendable {
    public enum Fault: Sendable, Equatable {
        case timeout, disconnect
        case other(String)
    }

    /// 로드에 쓴 이름. 예: `auth/refresh__success.json`
    public let name: String
    /// manifest의 method(`GET`, `POST`, ..., `PUSH`, `NONE`).
    public let method: String
    /// manifest의 path(`-`이면 HTTP 아님).
    public let path: String
    public let query: [String: String]
    /// HTTP 상태 코드. 오류 응답이 아닌 요청 예시·표·푸시·`_fault` 파일은 nil.
    public let status: Int?
    public let headers: [String: String]
    public let delayMs: Int
    public let testCaseIDs: [String]
    /// 응답 본문 바이트. `_raw`가 있으면 그 문자열, 아니면 파일 JSON 그대로, `_fault`면 빈 Data.
    public let body: Data
    /// `_contentType`이 있으면 그 값, `_raw`만 있으면 nil, 일반 JSON 본문이면 `application/json`.
    public let contentType: String?
    public let fault: Fault?
    /// `_kind`(`push`, `request`, `case`, `storage`, `native`). HTTP 응답 묘사면 nil.
    public let kind: String?
    /// 파일 원본 바이트(예약 키 포함).
    public let fileData: Data

    /// HTTP 응답으로 흘려보낼 수 있는 fixture인가(`_kind`·`_fault`가 없고 status가 있음).
    public var isHTTPResponse: Bool { kind == nil && fault == nil && status != nil }

    /// 본문을 `Decodable`로 디코딩한다.
    public func decode<T: Decodable>(_ type: T.Type = T.self, using decoder: JSONDecoder = JSONDecoder()) throws -> T {
        try decoder.decode(type, from: body)
    }

    /// `_kind: "case"` 파일의 `cases` 문자열 배열(없거나 문자열이 아니면 빈 배열).
    public var stringCases: [String] { (try? object()["cases"] as? [String]) ?? [] }

    /// 파일의 최상위 JSON 객체(예약 키 포함). 표 형태(`_kind: case` 등)를 직접 읽을 때 쓴다.
    public func object() throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: fileData) as? [String: Any] else {
            throw FixtureError.malformed("\(name): 최상위가 객체가 아님")
        }
        return object
    }

    // MARK: 로드

    public static func load(_ name: String) throws -> Fixture {
        let url = RepoLayout.shared.appendingPathComponent("fixtures").appendingPathComponent(name)
        guard let data = try? Data(contentsOf: url) else { throw FixtureError.notFound(name) }
        guard let entry = try Manifest.shared.entry(for: name) else { throw FixtureError.notInManifest(name) }
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw FixtureError.malformed("\(name): 최상위가 객체가 아님")
        }
        return try Fixture(name: name, entry: entry, data: data, object: object)
    }

    /// 영역 폴더(예: `auth`)의 fixture 이름 전체(`_routes.json`·README 제외, 정렬).
    public static func names(inArea area: String) -> [String] {
        let dir = RepoLayout.shared.appendingPathComponent("fixtures").appendingPathComponent(area)
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        return files.filter { $0.hasSuffix(".json") && !$0.hasPrefix("_") }.sorted().map { "\(area)/\($0)" }
    }

    /// manifest에 등록된 모든 fixture 이름(정렬).
    public static var allNames: [String] { Manifest.shared.names }

    private init(name: String, entry: Manifest.Entry, data: Data, object: [String: Any]) throws {
        self.name = name
        method = entry.method
        path = entry.path
        query = entry.query
        status = entry.status
        headers = entry.headers
        delayMs = entry.delayMs
        testCaseIDs = entry.tc
        fileData = data
        kind = object["_kind"] as? String
        if let faultText = object["_fault"] as? String {
            fault = switch faultText {
            case "timeout": .timeout
            case "disconnect": .disconnect
            default: .other(faultText)
            }
        } else {
            fault = nil
        }
        if let raw = object["_raw"] as? String {
            body = Data(raw.utf8)
            contentType = object["_contentType"] as? String
        } else if fault != nil {
            body = Data()
            contentType = nil
        } else {
            body = data
            contentType = (object["_contentType"] as? String) ?? "application/json"
        }
    }
}

/// `shared/fixtures/manifest.json`.
final class Manifest: Sendable {
    struct Entry: Sendable {
        let method: String
        let path: String
        let query: [String: String]
        let status: Int?
        let headers: [String: String]
        let delayMs: Int
        let tc: [String]
    }

    static let shared: Manifest = {
        do { return try Manifest() } catch { fatalError("manifest.json을 읽지 못했다: \(error)") }
    }()

    private let entries: [String: Entry]
    var names: [String] { entries.keys.sorted() }

    private init() throws {
        let url = RepoLayout.shared.appendingPathComponent("fixtures/manifest.json")
        guard let list = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [[String: Any]] else {
            throw FixtureError.malformed("manifest.json 최상위가 배열이 아님")
        }
        var result: [String: Entry] = [:]
        for item in list {
            guard let fixture = item["fixture"] as? String, let method = item["method"] as? String, let path = item["path"] as? String else {
                throw FixtureError.malformed("manifest 항목에 fixture/method/path 없음: \(item)")
            }
            let query = (item["query"] as? [String: Any])?.mapValues { "\($0)" } ?? [:]
            let headers = (item["headers"] as? [String: Any])?.mapValues { "\($0)" } ?? [:]
            result[fixture] = Entry(
                method: method, path: path, query: query,
                status: item["status"] as? Int, headers: headers,
                delayMs: item["delayMs"] as? Int ?? 0, tc: item["tc"] as? [String] ?? []
            )
        }
        entries = result
    }

    func entry(for name: String) throws -> Entry? { entries[name] }
}

/// 루트의 공용 JSON(`shared/constants.json`) 읽기.
public enum SharedConstants {
    public static func object() throws -> [String: Any] {
        let url = RepoLayout.shared.appendingPathComponent("constants.json")
        guard let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any] else {
            throw FixtureError.malformed("constants.json 최상위가 객체가 아님")
        }
        return object
    }
}

/// `shared/copy/ko.json`의 평평한 키-문구 표.
public enum SharedCopy {
    private static let table: [String: String] = {
        let url = RepoLayout.shared.appendingPathComponent("copy/ko.json")
        guard let data = try? Data(contentsOf: url),
              let table = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] else {
            fatalError("shared/copy/ko.json을 읽지 못했다")
        }
        return table
    }()

    public static var allKeys: [String] { table.keys.sorted() }

    /// 키의 문구. 없으면 nil.
    public static func value(for key: String) -> String? { table[key] }

    /// 키의 문구. 없으면 테스트가 바로 알 수 있게 오류를 던진다.
    public static func require(_ key: String) throws -> String {
        guard let text = table[key] else { throw FixtureError.malformed("copy 키 없음: \(key)") }
        return text
    }
}
