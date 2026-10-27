import Foundation

/// Info.plist(xcconfig 치환 결과)에서 읽는 앱 설정. 값이 없거나 치환되지 않은 `$(...)`이면 누락으로 본다.
struct AppConfiguration: Equatable {
    enum Issue: Error, Equatable {
        case missingAPIBaseURL
    }

    let apiBaseURL: String
    let kakaoNativeAppKey: String?
    let forceUpdateEnabled: Bool
    let appStoreURL: URL?
    let installedVersion: String
    let bundleId: String

    init(info: [String: Any], bundleId: String) throws {
        guard let base = Self.value(info["API_BASE_URL"]) else { throw Issue.missingAPIBaseURL }
        apiBaseURL = base
        kakaoNativeAppKey = Self.value(info["KAKAO_NATIVE_APP_KEY"])
        forceUpdateEnabled = Self.value(info["FORCE_UPDATE_ENABLED"])?.uppercased() == "YES"
        appStoreURL = Self.value(info["APP_STORE_URL"]).flatMap(URL.init(string:))
        installedVersion = Self.value(info["CFBundleShortVersionString"]) ?? "0"
        self.bundleId = bundleId
    }

    init(bundle: Bundle = .main) throws {
        try self.init(info: bundle.infoDictionary ?? [:], bundleId: bundle.bundleIdentifier ?? "")
    }

    private static func value(_ raw: Any?) -> String? {
        guard let text = (raw as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty, !text.hasPrefix("$(")
        else { return nil }
        return text
    }
}
