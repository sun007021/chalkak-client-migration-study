import Foundation
import ChalkakCore

/// 인증 정책(D-17)을 적용해 요청을 실행한다: 헤더 부착 → 401이면 갱신 후 원 요청을 정확히 1회만 재전송.
struct AuthenticatedRunner: Sendable {
    let factory: RequestFactory
    let caller: TransportCaller
    let store: any SessionStore
    let refresher: AuthRefresher

    /// 2xx 응답을 돌려주고, 그 밖은 `APIError`·`ConfigurationError`를 던진다.
    /// 취소와 갱신 중 계정 전환(`AuthError.sessionChanged`)은 모두 `CancellationError`로 나간다(D-20: 오류로 보이지 않는다).
    func run(_ request: HTTPRequest) async throws -> HTTPResponse {
        do {
            return try await runWithAuth(request)
        } catch AuthError.sessionChanged {
            throw CancellationError()
        }
    }

    private func runWithAuth(_ request: HTTPRequest) async throws -> HTTPResponse {
        let session = request.authPolicy == .session ? await store.currentSession() : nil
        let response = try await execute(request, session: session)
        if ResponseDecoding.isSuccess(response) { return response }
        let error = ResponseDecoding.failure(for: response)
        guard let session, case .http(401, let code, _) = error else { throw error }

        switch code {
        case .unauthorized:
            let refreshed = try await refresher.refreshSession(rejected: session)
            return try await resendOnce(request, with: refreshed, afterReauth: false)
        case .reauthenticationRequired:
            guard let current = await refresher.handleReauthenticationRequired(rejected: session) else { throw error }
            return try await resendOnce(request, with: current, afterReauth: true)
        default:
            throw error
        }
    }

    /// 재전송은 한 번뿐이다. 다시 401 REAUTHENTICATION_REQUIRED면 세션을 정리한다.
    private func resendOnce(_ request: HTTPRequest, with session: AuthSession, afterReauth: Bool) async throws -> HTTPResponse {
        try Task.checkCancellation() // 갱신을 기다리는 사이 이 요청의 화면이 사라졌으면 재전송하지 않는다.
        let response = try await execute(request, session: session)
        if ResponseDecoding.isSuccess(response) { return response }
        let error = ResponseDecoding.failure(for: response)
        if case .http(401, .reauthenticationRequired, _) = error {
            _ = await refresher.handleReauthenticationRequired(rejected: session)
        }
        throw error
    }

    private func execute(_ request: HTTPRequest, session: AuthSession?) async throws -> HTTPResponse {
        let transportRequest = try factory.make(request, session: session)
        return try await caller.call(transportRequest, retryPolicy: request.retryPolicy)
    }
}
