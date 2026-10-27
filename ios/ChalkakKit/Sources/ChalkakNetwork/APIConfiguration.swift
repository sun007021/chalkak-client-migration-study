import Foundation

public enum ConfigurationError: Error, Sendable, Equatable {
    /// 서버 origin이 올바르지 않다(REQ-NET-001·002).
    case invalidBaseURL
    /// 요청 경로가 올바르지 않다(`?`·`#`·`.`·`..`·빈 세그먼트 등). 쿼리는 `QueryItem`으로 넘긴다.
    case invalidPath
    /// presigned 업로드 URL이 안전하지 않다(https가 아니거나 loopback이 아닌 http, userinfo 포함 등).
    case invalidUploadURL
}

/// http를 예외로 허용하는 loopback 호스트. 다섯 플랫폼 공통 규칙이며 판정은 이곳 한 곳에서만 한다(shared/README).
public enum LoopbackHost {
    /// iOS 시뮬레이터·Android 에뮬레이터가 호스트의 mock 서버에 닿는 주소들.
    public static let hosts: Set<String> = ["localhost", "127.0.0.1", "10.0.2.2"]

    /// 호스트 문자열이 정확히 loopback 목록의 하나인지(대소문자 무시). 접미·접두 일치는 인정하지 않는다.
    public static func contains(_ host: String) -> Bool { hosts.contains(host.lowercased()) }
}

public struct APIConfiguration: Sendable, Equatable {
    /// 항상 `<origin>/api/v1/`(끝에 슬래시).
    public let baseURL: URL
    /// http를 loopback에 한해 허용할지(mock 서버용 DEBUG 빌드). presigned 업로드 URL 검증에도 같은 값을 쓴다.
    public let allowInsecureLoopback: Bool

    private static let apiPrefix = "/api/v1/"
    private static let acceptedPaths: Set<String> = ["", "/", "/api/v1", "/api/v1/"]

    /// `serverOrigin`은 서버 origin이다(REQ-NET-003). `https://h`, `https://h/`, `https://h/api/v1`, `https://h/api/v1/`은 같은 결과가 된다.
    /// 그 밖의 경로(`/api/v1/api/v1`, `/x` 등)와 query·fragment·userinfo가 있는 값은 거부한다.
    /// https만 허용하며, `allowInsecureLoopback`이 true일 때만 `LoopbackHost`의 http를 허용한다.
    public init(serverOrigin: String, allowInsecureLoopback: Bool = false) throws {
        let trimmed = serverOrigin.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(),
              let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil,
              components.query == nil, components.fragment == nil,
              Self.acceptedPaths.contains(components.path),
              Self.isPermitted(scheme: scheme, host: host, allowInsecureLoopback: allowInsecureLoopback)
        else { throw ConfigurationError.invalidBaseURL }
        components.scheme = scheme
        components.path = Self.apiPrefix
        guard let url = components.url else { throw ConfigurationError.invalidBaseURL }
        self.baseURL = url
        self.allowInsecureLoopback = allowInsecureLoopback
    }

    /// presigned 업로드 URL 검증. https이거나, 플래그가 켜진 loopback http만 통과한다. userinfo·호스트 없음은 거부한다.
    public func validatedUploadURL(_ url: URL) throws -> URL {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let scheme = components.scheme?.lowercased(),
              let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil,
              Self.isPermitted(scheme: scheme, host: host, allowInsecureLoopback: allowInsecureLoopback)
        else { throw ConfigurationError.invalidUploadURL }
        return url
    }

    private static func isPermitted(scheme: String, host: String, allowInsecureLoopback: Bool) -> Bool {
        switch scheme {
        case "https": true
        case "http": allowInsecureLoopback && LoopbackHost.contains(host)
        default: false
        }
    }
}

public enum RedirectPolicy {
    /// https에서 http로의 리다이렉트는 따르지 않는다. 앱 타깃 트랜스포트가 호출한다.
    public static func shouldFollow(from: URL, to: URL) -> Bool {
        !(from.scheme?.lowercased() == "https" && to.scheme?.lowercased() == "http")
    }
}
