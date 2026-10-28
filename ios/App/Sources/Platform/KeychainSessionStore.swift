import Foundation
import Security
import ChalkakNetwork

/// Keychain(kSecClassGenericPassword)에 세션을 JSON 한 항목으로 저장하는 `SessionStore`.
/// actor로 직렬화하므로 비교-교체(CAS)는 프로세스 안에서 원자적이다.
/// 계약: 항목을 읽을 수 없거나(손상·디코딩 실패·Keychain 오류) 해석할 수 없으면 항목을 지우고 nil을 돌려준다.
/// 예외: 기기 잠금 때문에 일시적으로 접근할 수 없는 경우(`errSecInteractionNotAllowed`)는 항목을 지우지 않고 nil만 돌려준다.
actor KeychainSessionStore: SessionStore {
    private let service: String
    private let account: String

    init(service: String = "com.study.chalkak.ios.session", account: String = "auth-session") {
        self.service = service
        self.account = account
    }

    func currentSession() async -> AuthSession? {
        readStoredSession()
    }

    func save(_ session: AuthSession) async {
        write(session)
    }

    func replaceTokens(of expected: AuthSession, with refreshed: AuthSession) async -> Bool {
        guard let current = readStoredSession(), Self.isSameSession(current, expected) else { return false }
        write(refreshed)
        return true
    }

    func clearSession(ifMatching expected: AuthSession) async -> Bool {
        guard let current = readStoredSession(), Self.isSameSession(current, expected) else { return false }
        deleteItem()
        return true
    }

    func clearSession() async {
        deleteItem()
    }

    /// 저장된 세션의 userId만 동기로 읽는다(`ViewerContext`가 동기 조회를 요구한다). 항목을 지우거나 고치지 않는다.
    nonisolated func storedUserId() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let stored = try? JSONDecoder().decode(StoredSession.self, from: data),
              !stored.userId.isEmpty
        else { return nil }
        return stored.userId
    }

    // MARK: - Keychain

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    private func readStoredSession() -> AuthSession? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            if let data = result as? Data, let stored = try? JSONDecoder().decode(StoredSession.self, from: data) {
                return stored.makeSession()
            }
            deleteItem()
            return nil
        case errSecItemNotFound, errSecInteractionNotAllowed:
            return nil
        default:
            deleteItem()
            return nil
        }
    }

    private func write(_ session: AuthSession) {
        guard let data = try? JSONEncoder().encode(StoredSession(session)) else { return }
        deleteItem()
        var attributes = baseQuery
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(attributes as CFDictionary, nil)
    }

    private func deleteItem() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    private static func isSameSession(_ lhs: AuthSession, _ rhs: AuthSession) -> Bool {
        lhs.userId == rhs.userId && lhs.refreshToken == rhs.refreshToken
    }
}

/// Keychain에 들어가는 JSON 모양. 날짜는 epoch 초.
private struct StoredSession: Codable {
    var userId: String
    var accessToken: String
    var accessTokenExpiresAt: Double
    var refreshToken: String
    var refreshTokenExpiresAt: Double

    init(_ session: AuthSession) {
        userId = session.userId
        accessToken = session.accessToken
        accessTokenExpiresAt = session.accessTokenExpiresAt.timeIntervalSince1970
        refreshToken = session.refreshToken
        refreshTokenExpiresAt = session.refreshTokenExpiresAt.timeIntervalSince1970
    }

    func makeSession() -> AuthSession {
        AuthSession(
            userId: userId,
            accessToken: accessToken,
            accessTokenExpiresAt: Date(timeIntervalSince1970: accessTokenExpiresAt),
            refreshToken: refreshToken,
            refreshTokenExpiresAt: Date(timeIntervalSince1970: refreshTokenExpiresAt)
        )
    }
}
