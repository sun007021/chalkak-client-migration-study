import Foundation

public protocol NetworkLogger: Sendable {
    func log(_ line: String)
}

public struct NoopNetworkLogger: NetworkLogger {
    public init() {}
    public func log(_ line: String) {}
}

/// 로그에 남기기 전 민감값을 가린다.
public enum LogRedactor {
    /// 쿼리 문자열을 제거한 URL 문자열(presigned URL 서명 보호).
    public static func redactedURL(_ url: URL) -> String {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return "<invalid url>" }
        components.query = nil
        components.fragment = nil
        return components.string ?? "<invalid url>"
    }
    /// 오류 응답에서 `errorCode`·`message`만 뽑는다. 그 밖의 필드와 JSON이 아닌 본문은 남기지 않는다.
    public static func errorSummary(of body: Data) -> String {
        guard case .http(_, let code, let message) = ErrorResponseParser.parse(status: 0, body: body), code != nil || message != nil else { return "" }
        return "errorCode=\(code?.rawValue ?? "-") message=\(message ?? "-")"
    }

    /// JSON 본문에서 민감 키의 값을 가린다. 키는 소문자로 바꾸고 `_`·`-`를 뺀 뒤 비교한다(access_token, AccessToken 모두 해당).
    public static func redactedBody(_ data: Data) -> String {
        guard !data.isEmpty else { return "" }
        guard let json = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]),
              let redacted = try? JSONSerialization.data(withJSONObject: redact(json), options: [.sortedKeys, .fragmentsAllowed])
        else { return "<non-JSON body, \(data.count) bytes>" }
        return String(decoding: redacted, as: UTF8.self)
    }

    private static let sensitiveKeys: Set<String> = ["accesstoken", "refreshtoken", "idtoken", "rawnonce", "fcmtoken", "signuptoken", "authorizationcode"]

    private static func normalized(_ key: String) -> String {
        key.lowercased().filter { $0 != "_" && $0 != "-" }
    }

    private static func redact(_ value: Any) -> Any {
        if let object = value as? [String: Any] {
            return object.reduce(into: [String: Any]()) { result, pair in
                result[pair.key] = sensitiveKeys.contains(normalized(pair.key)) ? "***" : redact(pair.value)
            }
        }
        if let array = value as? [Any] { return array.map(redact) }
        return value
    }
}
