import Foundation

/// iTunes lookup(D-15) URL 구성과 응답 파싱. 실제 호출은 앱 타깃의 `StoreVersionLookup` 구현이 한다.
public enum ITunesLookup {
    public static let defaultCountryCode = "kr"

    /// `https://itunes.apple.com/lookup?bundleId=…&country=…&entity=software`. 국가 코드를 못 읽으면(nil·빈 값·2글자 아님) 기본 국가.
    /// URL을 만들 수 없으면 nil이며, 호출자는 조회 없이 게이트를 통과시킨다.
    public static func url(bundleId: String, storefrontCountryCode: String?) -> URL? {
        var components = URLComponents()
        components.scheme = "https"
        components.host = "itunes.apple.com"
        components.path = "/lookup"
        components.queryItems = [
            URLQueryItem(name: "bundleId", value: bundleId),
            URLQueryItem(name: "country", value: country(from: storefrontCountryCode)),
            URLQueryItem(name: "entity", value: "software"),
        ]
        return components.url
    }

    /// `results[0].version`. results가 비었거나 version이 없으면 nil. JSON이 깨졌으면 throw.
    public static func parseVersion(from data: Data) throws -> String? {
        try JSONDecoder().decode(Response.self, from: data).results?.first?.version
    }

    private static func country(from code: String?) -> String {
        guard let code, code.count == 2, code.allSatisfy({ $0.isASCII && $0.isLetter }) else { return defaultCountryCode }
        return code.lowercased()
    }

    private struct Response: Decodable {
        let results: [Item]?
        struct Item: Decodable { let version: String? }
    }
}
