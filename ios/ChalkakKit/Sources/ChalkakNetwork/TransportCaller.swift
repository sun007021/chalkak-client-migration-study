import Foundation
import ChalkakCore

/// 트랜스포트 호출 한 건과 재시도 루프(D-21). 대기는 `clock.sleep`만 쓴다.
/// 전송 오류는 `APIError.network`로, 취소는 `CancellationError`로 바꾼다. HTTP 오류 응답은 그대로 돌려준다.
struct TransportCaller: Sendable {
    let transport: any HTTPTransport
    let clock: any AppClock
    let logger: any NetworkLogger

    func call(_ request: TransportRequest, retryPolicy: RetryPolicy) async throws -> HTTPResponse {
        let maxRetries = retryPolicy == .idempotent ? NetworkConstants.maxRetries : 0
        var retryIndex = 0
        while true {
            try Task.checkCancellation()
            let plan: RetryPlan
            switch await attempt(request) {
            case .response(let response):
                guard retryIndex < maxRetries, Self.isRetryable(response.status) else { return response }
                plan = RetryBackoff.plan(retryIndex: retryIndex, status: response.status, retryAfter: response.header("Retry-After"), now: clock.now)
                if plan == .stop { return response }
            case .failure(let error):
                guard retryIndex < maxRetries, !(error is CancellationError) else { throw error }
                plan = RetryBackoff.plan(retryIndex: retryIndex, status: nil, retryAfter: nil, now: clock.now)
            }
            if case .wait(let delay) = plan { try await clock.sleep(for: delay) }
            retryIndex += 1
        }
    }

    private enum Outcome {
        case response(HTTPResponse)
        case failure(any Error)
    }

    private func attempt(_ request: TransportRequest) async -> Outcome {
        log("--> \(request.method.rawValue) \(LogRedactor.redactedURL(request.url)) \(request.body.map(LogRedactor.redactedBody) ?? "")")
        do {
            let response = try await transport.send(request)
            log("<-- \(response.status) \(LogRedactor.redactedURL(request.url)) \(ResponseDecoding.isSuccess(response) ? "" : LogRedactor.errorSummary(of: response.body))")
            return .response(response)
        } catch is CancellationError {
            return .failure(CancellationError())
        } catch TransportError.cancelled {
            return .failure(CancellationError())
        } catch {
            let name = (error as? TransportError)?.caseName ?? "unknown"
            log("<-- failed \(LogRedactor.redactedURL(request.url)) \(name)")
            return .failure(APIError.network)
        }
    }

    private static func isRetryable(_ status: Int) -> Bool { status == 429 || (500..<600).contains(status) }

    private func log(_ line: String) { logger.log(line) }
}
