import Foundation
import ChalkakData
import ChalkakFeatures

/// iTunes lookup(D-15)으로 스토어 최신 버전을 조회한다. 이 레포의 앱은 스토어에 없으므로 기본은 게이트 비활성이다(`AppConfiguration.forceUpdateEnabled`).
struct ITunesStoreVersionLookup: StoreVersionLookup {
    let bundleId: String

    func latestVersion() async throws -> String? {
        // URL을 만들 수 없으면 조회하지 않고 게이트를 통과시킨다(D-15: 실패하면 통과).
        guard let url = ITunesLookup.url(bundleId: bundleId, storefrontCountryCode: nil) else { return nil }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
        return try ITunesLookup.parseVersion(from: data)
    }
}
