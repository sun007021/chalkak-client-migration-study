import Foundation
import ChalkakData

/// 게스트 플래그를 UserDefaults에 저장한다. 저장 뒤 다시 읽어 값이 다르면 실패로 던진다(REQ-AUTH-020).
struct UserDefaultsGuestFlagStore: GuestFlagStore {
    struct WriteFailed: Error {}

    private let suiteName: String?
    private let key: String

    /// `suiteName`이 nil이면 표준 UserDefaults. UserDefaults 인스턴스를 들고 있지 않고 호출마다 연다(Sendable 보장).
    init(suiteName: String? = nil, key: String = "chalkak.guest-mode") {
        self.suiteName = suiteName
        self.key = key
    }

    func isGuest() async -> Bool {
        defaults.bool(forKey: key)
    }

    func setGuest(_ isGuest: Bool) async throws {
        let store = defaults
        store.set(isGuest, forKey: key)
        guard store.bool(forKey: key) == isGuest else { throw WriteFailed() }
    }

    private var defaults: UserDefaults {
        suiteName.flatMap { UserDefaults(suiteName: $0) } ?? .standard
    }
}
