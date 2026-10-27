import Foundation
import Testing
@testable import ChalkakData

@Suite("BOOT iTunes lookup")
struct ITunesLookupTests {
    private func items(_ url: URL) -> [String: String] {
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        return Dictionary(uniqueKeysWithValues: (components?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
    }

    @Test("TC-BOOT-021 URL에 bundleId, 소문자 국가 코드, entity=software가 들어간다")
    func urlShape() throws {
        let url = try #require(ITunesLookup.url(bundleId: "kr.pysun.chalkak", storefrontCountryCode: "US"))
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        #expect(components?.scheme == "https")
        #expect(components?.host == "itunes.apple.com")
        #expect(components?.path == "/lookup")
        #expect(items(url) == ["bundleId": "kr.pysun.chalkak", "country": "us", "entity": "software"])
    }

    @Test("TC-BOOT-021 국가 코드를 못 읽으면 기본 국가", arguments: [nil, "", "K", "KRXX"] as [String?])
    func defaultCountry(code: String?) throws {
        let url = try #require(ITunesLookup.url(bundleId: "b", storefrontCountryCode: code))
        #expect(items(url)["country"] == ITunesLookup.defaultCountryCode)
    }

    @Test("TC-BOOT-021 번들 ID에 특수문자가 있어도 크래시 없이 URL(퍼센트 인코딩)을 만든다")
    func specialCharactersEncoded() throws {
        let url = try #require(ITunesLookup.url(bundleId: "a b&c=d", storefrontCountryCode: "kr"))
        #expect(items(url)["bundleId"] == "a b&c=d")
    }

    @Test("TC-BOOT-022 results[0].version을 읽는다")
    func parsesVersion() throws {
        let json = #"{"resultCount":1,"results":[{"version":"2.0.0","trackName":"찰칵"}]}"#
        #expect(try ITunesLookup.parseVersion(from: Data(json.utf8)) == "2.0.0")
    }

    @Test("TC-BOOT-022 results가 비었거나 version이 없으면 nil", arguments: [
        #"{"resultCount":0,"results":[]}"#,
        #"{"resultCount":1,"results":[{"trackName":"찰칵"}]}"#,
    ])
    func missingVersion(json: String) throws {
        #expect(try ITunesLookup.parseVersion(from: Data(json.utf8)) == nil)
    }

    @Test("TC-BOOT-020 JSON이 깨졌으면 throw(호출자는 통과로 처리)")
    func malformed() {
        #expect(throws: (any Error).self) { try ITunesLookup.parseVersion(from: Data("<html>".utf8)) }
    }
}
