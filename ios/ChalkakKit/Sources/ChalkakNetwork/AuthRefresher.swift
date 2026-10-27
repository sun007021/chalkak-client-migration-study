import Foundation
import ChalkakCore

/// single-flight 토큰 갱신(D-17). 동시 401은 하나의 refresh를 공유한다.
public actor AuthRefresher {
    private let configuration: APIConfiguration
    private let transport: any HTTPTransport
    private let store: any SessionStore
    private let clock: any AppClock
    private let events: any AuthEvents

    private struct InFlight {
        let id: Int
        let refreshToken: String
        let task: Task<AuthSession, any Error>
    }
    private var inFlight: InFlight?
    private var nextID = 0

    public init(configuration: APIConfiguration, transport: any HTTPTransport, store: any SessionStore, clock: any AppClock, events: any AuthEvents) {
        self.configuration = configuration
        self.transport = transport
        self.store = store
        self.clock = clock
        self.events = events
    }

    /// `rejected`: 401을 받은 요청이 쓰던 세션 스냅샷.
    /// 이미 다른 요청이 같은 계정의 토큰을 갱신했으면 refresh 없이 현재 세션을 돌려준다.
    /// 계정이 바뀌었거나 세션이 사라졌으면 `AuthError.sessionChanged`.
    /// refresh가 REAUTHENTICATION_REQUIRED면 세션을 지우고 events를 호출한 뒤 `APIError.http(401, .reauthenticationRequired)`.
    public func refreshSession(rejected: AuthSession) async throws -> AuthSession {
        guard let current = await store.currentSession(), current.userId == rejected.userId else {
            throw AuthError.sessionChanged
        }
        if current.refreshToken != rejected.refreshToken { return current }
        if let inFlight, inFlight.refreshToken == current.refreshToken {
            return try await inFlight.task.value
        }
        // 대기자가 취소돼도 refresh는 다른 대기자를 위해 끝까지 간다(구조화되지 않은 Task).
        nextID += 1
        let id = nextID
        let task = Task { try await self.performRefresh(current, id: id) }
        inFlight = InFlight(id: id, refreshToken: current.refreshToken, task: task)
        return try await task.value
    }

    /// 일반 API가 401 REAUTHENTICATION_REQUIRED를 받았을 때. 그 사이 토큰이 갱신됐으면 새 세션을 돌려주고(세션 유지),
    /// 아니면 세션을 지우고 events를 호출한 뒤 nil.
    public func handleReauthenticationRequired(rejected: AuthSession) async -> AuthSession? {
        guard let current = await store.currentSession(), current.userId == rejected.userId else { return nil }
        if current.refreshToken != rejected.refreshToken { return current }
        await clearAndNotify(rejected)
        return nil
    }

    // MARK: - 실제 갱신

    private func performRefresh(_ current: AuthSession, id: Int) async throws -> AuthSession {
        // 이미 끝난 갱신이 뒤늦게 정리되면서 그 사이 시작된 더 새로운 갱신을 지우지 않도록 자기 것만 지운다.
        defer { if inFlight?.id == id { inFlight = nil } }
        // inFlight 등록 뒤에 저장소를 다시 읽는다: 호출자가 읽은 세션은 await 사이에 낡았을 수 있다
        // (그 사이 다른 갱신이 끝났다면 저장소는 이미 새 토큰이다). 옛 refresh token을 두 번째로 보내면 서버가 세션을 폐기한다.
        guard let latest = await store.currentSession(), latest.userId == current.userId else { throw AuthError.sessionChanged }
        if latest.refreshToken != current.refreshToken { return latest }
        let requestedAt = clock.now // 만료 시각은 요청 직전 기준(응답이 늦어도 더 길게 잡지 않는다).
        let response = try await sendRefreshRequest(refreshToken: current.refreshToken)
        guard ResponseDecoding.isSuccess(response) else {
            let error = ResponseDecoding.failure(for: response)
            if case .http(401, .reauthenticationRequired, _) = error { // 401일 때만 세션을 지운다.
                guard await clearAndNotify(current) else { throw AuthError.sessionChanged }
            }
            throw error
        }
        let tokens = try ResponseDecoding.decode(RefreshResponse.self, from: response)
        guard tokens.isUsable else { throw APIError.invalidResponse }
        let refreshed = tokens.makeSession(userId: current.userId, now: requestedAt)
        guard await store.replaceTokens(of: current, with: refreshed) else { throw AuthError.sessionChanged }
        return refreshed
    }

    /// 지웠으면 true. 그 사이 다른 세션으로 바뀌었으면 건드리지 않고 false.
    @discardableResult
    private func clearAndNotify(_ session: AuthSession) async -> Bool {
        guard await store.clearSession(ifMatching: session) else { return false }
        await events.reauthenticationRequired()
        return true
    }

    /// refresh는 자동 재시도하지 않는다(같은 refresh token 재전송은 재사용 감지를 유발한다).
    private func sendRefreshRequest(refreshToken: String) async throws -> HTTPResponse {
        let url = configuration.baseURL.appendingPathComponent("auth/refresh")
        let body = try JSONEncoder().encode(RefreshRequest(refreshToken: refreshToken))
        let request = TransportRequest(
            method: .post, url: url,
            headers: ["Accept": "application/json", "Content-Type": "application/json"],
            body: body, timeouts: .standard
        )
        do {
            return try await transport.send(request)
        } catch is CancellationError {
            throw CancellationError()
        } catch TransportError.cancelled {
            throw CancellationError()
        } catch {
            throw APIError.network
        }
    }
}

private struct RefreshRequest: Encodable {
    let refreshToken: String
}

private struct RefreshResponse: Decodable {
    let accessToken: String
    let expiresIn: Double
    let refreshToken: String
    let refreshTokenExpiresIn: Double

    /// 토큰이 비었거나 만료 초가 양의 유한수가 아니면 쓸 수 없는 응답이다.
    var isUsable: Bool {
        !accessToken.trimmingCharacters(in: .whitespaces).isEmpty
            && !refreshToken.trimmingCharacters(in: .whitespaces).isEmpty
            && expiresIn.isFinite && expiresIn > 0
            && refreshTokenExpiresIn.isFinite && refreshTokenExpiresIn > 0
    }

    func makeSession(userId: String, now: Date) -> AuthSession {
        AuthSession(
            userId: userId,
            accessToken: accessToken,
            accessTokenExpiresAt: now.addingTimeInterval(expiresIn),
            refreshToken: refreshToken,
            refreshTokenExpiresAt: now.addingTimeInterval(refreshTokenExpiresIn)
        )
    }
}
