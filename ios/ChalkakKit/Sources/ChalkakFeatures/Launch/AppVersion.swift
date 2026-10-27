import Foundation

/// `major.minor[.patch]` 버전. 두 구성이면 patch=0. 그 밖(1, 1.2.3.4, 1.two.3, 1.2.-1, "")은 파싱 실패.
public struct AppVersion: Sendable, Equatable {
    public let major: Int
    public let minor: Int
    public let patch: Int

    public init(major: Int, minor: Int, patch: Int) {
        self.major = major
        self.minor = minor
        self.patch = patch
    }

    public init?(parsing text: String) {
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 2 || parts.count == 3 else { return nil }
        let numbers = parts.compactMap { part -> Int? in
            guard !part.isEmpty, part.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
            return Int(part)
        }
        guard numbers.count == parts.count else { return nil }
        self.init(major: numbers[0], minor: numbers[1], patch: numbers.count == 3 ? numbers[2] : 0)
    }

    /// 스토어 버전의 major 또는 minor가 설치 버전보다 높을 때만 true. patch 차이는 무시한다.
    public static func requiresUpdate(installed: AppVersion, store: AppVersion) -> Bool {
        (store.major, store.minor) > (installed.major, installed.minor)
    }
}
