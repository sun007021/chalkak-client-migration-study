import Foundation
import Testing
import ChalkakTestSupport

@Suite("Fixture 로더")
struct FixtureLoaderTests {
    struct Tokens: Decodable, Equatable {
        let accessToken: String
        let expiresIn: Int
        let refreshToken: String
    }

    @Test("레포 루트와 fixture 폴더를 찾는다")
    func findsRoot() {
        #expect(FileManager.default.fileExists(atPath: RepoLayout.shared.appendingPathComponent("fixtures/manifest.json").path))
        #expect(!RepoLayout.swiftFiles(inTarget: "ChalkakCore").isEmpty)
    }

    @Test("일반 JSON 응답은 manifest의 상태·메서드·경로와 함께 읽힌다")
    func jsonResponse() throws {
        let f = try Fixture.load("auth/refresh__success.json")
        #expect(f.status == 200)
        #expect(f.method == "POST")
        #expect(f.path.hasSuffix("/auth/refresh"))
        #expect(f.contentType == "application/json")
        #expect(f.fault == nil && f.kind == nil)
        #expect(f.isHTTPResponse)
        let tokens = try f.decode(Tokens.self)
        #expect(tokens == Tokens(accessToken: "fixture-access-token-2", expiresIn: 900, refreshToken: "fixture-refresh-token-2"))
    }

    @Test("_raw 빈 문자열은 본문 없음이고 content-type이 없다")
    func emptyRaw() throws {
        let f = try Fixture.load("common/ok__empty-body.json")
        #expect(f.body.isEmpty)
        #expect(f.contentType == nil)
        #expect(f.isHTTPResponse)
    }

    @Test("_raw와 _contentType은 응답 묘사로 풀린다")
    func rawWithContentType() throws {
        let f = try Fixture.load("common/error__rate-limited-429.json")
        #expect(f.status == 429)
        #expect(String(decoding: f.body, as: UTF8.self) == "Too Many Requests")
        #expect(f.contentType == "text/plain")
    }

    @Test("manifest의 headers가 전달된다")
    func headers() throws {
        let f = try Fixture.load("common/error__service-unavailable-503.json")
        #expect(f.status == 503)
        #expect(f.headers["Retry-After"] != nil)
    }

    @Test("_fault는 응답이 아니라 연결 오류다")
    func fault() throws {
        let f = try Fixture.load("upload/posts-create__timeout.json")
        #expect(f.fault == .timeout)
        #expect(f.body.isEmpty)
        #expect(!f.isHTTPResponse)
    }

    @Test("_kind 파일은 HTTP 응답이 아니며 cases를 읽을 수 있다")
    func caseKind() throws {
        let f = try Fixture.load("time/instants__invalid.json")
        #expect(f.kind == "case")
        #expect(f.method == "NONE")
        #expect(!f.isHTTPResponse)
        #expect(f.stringCases.contains("not-a-date"))
    }

    @Test("없는 파일과 manifest에 없는 이름은 오류다")
    func errors() {
        #expect(throws: FixtureError.notFound("auth/nope.json")) { try Fixture.load("auth/nope.json") }
    }

    @Test("모든 fixture 파일이 manifest에 있고 로드된다")
    func everyFixtureLoads() throws {
        let areas = try FileManager.default.contentsOfDirectory(atPath: RepoLayout.shared.appendingPathComponent("fixtures").path)
            .filter { !$0.hasSuffix(".json") && !$0.hasSuffix(".md") }
        var loaded = 0
        for area in areas.sorted() {
            for name in Fixture.names(inArea: area) {
                _ = try Fixture.load(name)
                loaded += 1
            }
        }
        #expect(loaded == Fixture.allNames.count)
    }

    @Test("공용 문구는 키로 읽는다")
    func sharedCopy() throws {
        #expect(SharedCopy.value(for: "ai.card.retry") == "재요청")
        #expect(SharedCopy.value(for: "no.such.key") == nil)
        #expect(throws: FixtureError.self) { try SharedCopy.require("no.such.key") }
        #expect(!SharedCopy.allKeys.isEmpty)
    }
}
