import Foundation
import ChalkakCore

/// `HTTPRequest` → 전송용 `TransportRequest`. URL 확정과 헤더 구성만 맡는다.
struct RequestFactory: Sendable {
    let configuration: APIConfiguration
    let clock: any AppClock

    /// `session`이 유효(미만료)하고 https일 때만 Authorization을 붙인다. `.anonymous`는 절대 붙이지 않는다.
    func make(_ request: HTTPRequest, session: AuthSession?) throws -> TransportRequest {
        TransportRequest(
            method: request.method,
            url: try makeURL(path: request.path, query: request.query),
            headers: makeHeaders(for: request, session: session),
            body: request.body,
            timeouts: request.timeouts
        )
    }

    /// presigned PUT: Authorization·공통 헤더 없이 Content-Type만.
    func makePresignedUpload(url: URL, data: Data, contentType: String) -> TransportRequest {
        TransportRequest(method: .put, url: url, headers: ["Content-Type": contentType], body: data, timeouts: .presignedUpload)
    }

    /// 경로는 세그먼트별로, 쿼리는 이름·값별로 비예약 문자(`A-Z a-z 0-9 - . _ ~`)만 남기고 퍼센트 인코딩한다.
    /// `?`·`#`·`.`·`..`·빈 세그먼트·끝 슬래시가 있으면 `ConfigurationError.invalidPath`.
    private func makeURL(path: String, query: [QueryItem]) throws -> URL {
        let segments = path.drop { $0 == "/" }.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        guard !segments.isEmpty, segments.allSatisfy(Self.isValidSegment) else { throw ConfigurationError.invalidPath }
        var text = configuration.baseURL.absoluteString + segments.map(PercentEncoding.encode).joined(separator: "/")
        if !query.isEmpty {
            text += "?" + query.map { PercentEncoding.encode($0.name) + "=" + PercentEncoding.encode($0.value) }.joined(separator: "&")
        }
        guard let url = URL(string: text), url.host?.lowercased() == configuration.baseURL.host?.lowercased() else {
            throw ConfigurationError.invalidPath
        }
        return url
    }

    private static func isValidSegment(_ segment: String) -> Bool {
        !segment.isEmpty && segment != "." && segment != ".." && !segment.contains("?") && !segment.contains("#")
    }

    private func makeHeaders(for request: HTTPRequest, session: AuthSession?) -> [String: String] {
        var headers = request.headers.filter { $0.key.lowercased() != "authorization" }
        headers["Accept"] = "application/json"
        if request.body != nil, HeaderLookup.value(of: "Content-Type", in: headers) == nil {
            headers["Content-Type"] = "application/json"
        }
        if let token = bearerToken(for: request, session: session) {
            headers["Authorization"] = "Bearer \(token)"
        }
        return headers
    }

    private func bearerToken(for request: HTTPRequest, session: AuthSession?) -> String? {
        guard request.authPolicy == .session,
              configuration.baseURL.scheme?.lowercased() == "https",
              let session, !session.isAccessTokenExpired(at: clock.now)
        else { return nil }
        return session.accessToken
    }
}
