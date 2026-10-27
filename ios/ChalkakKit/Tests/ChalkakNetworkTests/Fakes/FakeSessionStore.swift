import Foundation
import Synchronization
import ChalkakNetwork

actor InMemorySessionStore: SessionStore {
    private var session: AuthSession?
    private(set) var saveCount = 0
    private(set) var replaceCount = 0
    private(set) var clearCount = 0

    init(_ session: AuthSession? = nil) { self.session = session }

    func currentSession() async -> AuthSession? { session }
    func save(_ session: AuthSession) async { self.session = session; saveCount += 1 }
    func replaceTokens(of expected: AuthSession, with refreshed: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = refreshed
        replaceCount += 1
        return true
    }
    func clearSession(ifMatching expected: AuthSession) async -> Bool {
        guard let s = session, s.userId == expected.userId, s.refreshToken == expected.refreshToken else { return false }
        session = nil
        clearCount += 1
        return true
    }
    func clearSession() async { session = nil; clearCount += 1 }
}

actor RecordingAuthEvents: AuthEvents {
    private(set) var count = 0
    func reauthenticationRequired() async { count += 1 }
}

final class RecordingLogger: NetworkLogger, Sendable {
    private let storage = Mutex<[String]>([])
    func log(_ line: String) { storage.withLock { $0.append(line) } }
    var lines: [String] { storage.withLock { $0 } }
}
