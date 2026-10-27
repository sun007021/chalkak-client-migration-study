import Foundation
import ChalkakNetwork

/// `HTTPTransport`의 URLSession 구현. 4xx·5xx는 `HTTPResponse`로 돌려주고 전송 실패만 `TransportError`로 던진다.
///
/// 타임아웃: URLSession에는 "연결 타임아웃"과 "응답 타임아웃"을 따로 거는 API가 없다.
/// `timeoutIntervalForRequest`(데이터가 오가지 않는 최대 시간)를 둘 중 큰 값으로, `timeoutIntervalForResource`(요청 전체 상한)를 둘의 합으로 둔다.
struct URLSessionTransport: HTTPTransport {
    func send(_ request: TransportRequest) async throws -> HTTPResponse {
        let session = URLSession(configuration: Self.configuration(for: request.timeouts))
        defer { session.finishTasksAndInvalidate() }
        do {
            let (data, response) = try await session.data(for: Self.makeURLRequest(from: request), delegate: RedirectGuard())
            guard let http = response as? HTTPURLResponse else { throw TransportError.other("non-HTTP response") }
            return HTTPResponse(status: http.statusCode, headers: Self.headers(of: http), body: data)
        } catch let error as URLError {
            throw URLErrorMapping.transportError(for: error.code)
        } catch is CancellationError {
            throw TransportError.cancelled
        }
    }

    static func makeURLRequest(from request: TransportRequest) -> URLRequest {
        var urlRequest = URLRequest(url: request.url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.httpBody = request.body
        for (name, value) in request.headers { urlRequest.setValue(value, forHTTPHeaderField: name) }
        urlRequest.timeoutInterval = max(seconds(request.timeouts.connect), seconds(request.timeouts.response))
        return urlRequest
    }

    static func configuration(for timeouts: NetworkTimeouts) -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = max(seconds(timeouts.connect), seconds(timeouts.response))
        configuration.timeoutIntervalForResource = seconds(timeouts.connect) + seconds(timeouts.response)
        configuration.waitsForConnectivity = false
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        return configuration
    }

    private static func headers(of response: HTTPURLResponse) -> [String: String] {
        var result: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            if let key = key as? String, let value = value as? String { result[key] = value }
        }
        return result
    }

    private static func seconds(_ duration: Duration) -> TimeInterval {
        let parts = duration.components
        return TimeInterval(parts.seconds) + TimeInterval(parts.attoseconds) / 1e18
    }
}

/// URLError → 플랫폼 중립 `TransportError`.
enum URLErrorMapping {
    static func transportError(for code: URLError.Code) -> TransportError {
        switch code {
        case .timedOut:
            .timeout
        case .notConnectedToInternet, .networkConnectionLost:
            .notConnected
        case .cannotFindHost, .dnsLookupFailed:
            .dnsFailure
        case .secureConnectionFailed, .serverCertificateHasBadDate, .serverCertificateUntrusted,
             .serverCertificateHasUnknownRoot, .serverCertificateNotYetValid:
            .tls
        case .cancelled:
            .cancelled
        default:
            .other("URLError \(code.rawValue)")
        }
    }
}

/// https → http 리다이렉트를 따르지 않는다(`RedirectPolicy`). 따르지 않으면 3xx 응답이 그대로 돌아온다.
private final class RedirectGuard: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest
    ) async -> URLRequest? {
        guard let from = task.currentRequest?.url ?? response.url, let to = request.url else { return nil }
        return RedirectPolicy.shouldFollow(from: from, to: to) ? request : nil
    }
}
