import Foundation
import ChalkakCore

public enum HTTPMethod: String, Sendable, Equatable, CaseIterable {
    case get = "GET", post = "POST", put = "PUT", patch = "PATCH", delete = "DELETE"
}

/// 인증 정책. `.session`은 세션이 있으면 Authorization을 붙이고 401에서 갱신 경로를 탄다.
/// `.anonymous`는 어떤 경우에도 Authorization을 붙이지 않고 401에서 갱신하지 않는다(/auth/*, /banners).
public enum AuthPolicy: Sendable, Equatable {
    case session
    case anonymous
}

public enum RetryPolicy: Sendable, Equatable {
    /// 네트워크 오류·5xx에 지수 백오프로 최대 `AppConstants.retryMax`회 재시도(D-21).
    case idempotent
    /// 자동 재시도 없음.
    case none

    /// 메서드별 기본값: GET/PUT/PATCH/DELETE = idempotent, POST = none.
    public static func `default`(for method: HTTPMethod) -> RetryPolicy {
        switch method {
        case .get, .put, .patch, .delete: .idempotent
        case .post: .none
        }
    }
}

public struct NetworkTimeouts: Sendable, Equatable {
    public var connect: Duration
    public var response: Duration
    public init(connect: Duration, response: Duration) {
        self.connect = connect
        self.response = response
    }
    /// 일반 API: 연결 10초, 응답 15초.
    public static let standard = NetworkTimeouts(connect: AppConstants.httpConnectTimeout, response: AppConstants.httpResponseTimeout)
    /// presigned PUT: 응답 60초(`UPLOAD_PUT_TIMEOUT_MS`), 연결은 일반 API와 같은 10초.
    public static let presignedUpload = NetworkTimeouts(connect: AppConstants.httpConnectTimeout, response: AppConstants.uploadPutTimeout)
}

public struct QueryItem: Sendable, Equatable {
    public var name: String
    public var value: String
    public init(name: String, value: String) {
        self.name = name
        self.value = value
    }
    /// 정수는 로캘과 무관한 ASCII 10진수.
    public static func int(_ name: String, _ value: Int) -> QueryItem { QueryItem(name: name, value: String(value)) }
    /// `yyyy-MM-dd` ASCII.
    public static func date(_ name: String, _ day: KSTDate) -> QueryItem { QueryItem(name: name, value: day.string) }
    /// sort 값은 소문자.
    public static func sort(_ name: String, _ raw: String) -> QueryItem { QueryItem(name: name, value: raw.lowercased()) }
    /// UUID는 소문자 정규형.
    public static func uuid(_ name: String, _ value: UUID) -> QueryItem { QueryItem(name: name, value: value.apiString) }
}

public struct HTTPRequest: Sendable, Equatable {
    public var method: HTTPMethod
    /// base URL 뒤에 붙는 경로. 앞의 `/` 유무는 상관없다. 예: `/posts`.
    public var path: String
    public var query: [QueryItem]
    public var headers: [String: String]
    public var body: Data?
    public var authPolicy: AuthPolicy
    public var retryPolicy: RetryPolicy
    public var timeouts: NetworkTimeouts

    /// `retryPolicy`를 생략하면 `RetryPolicy.default(for: method)`.
    public init(
        method: HTTPMethod,
        path: String,
        query: [QueryItem] = [],
        headers: [String: String] = [:],
        body: Data? = nil,
        authPolicy: AuthPolicy = .session,
        retryPolicy: RetryPolicy? = nil,
        timeouts: NetworkTimeouts = .standard
    ) {
        self.method = method
        self.path = path
        self.query = query
        self.headers = headers
        self.body = body
        self.authPolicy = authPolicy
        self.retryPolicy = retryPolicy ?? RetryPolicy.default(for: method)
        self.timeouts = timeouts
    }
}

public struct HTTPResponse: Sendable, Equatable {
    public var status: Int
    public var headers: [String: String]
    public var body: Data
    public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }
    /// 대소문자를 구분하지 않는 헤더 조회.
    public func header(_ name: String) -> String? { HeaderLookup.value(of: name, in: headers) }
}

/// 트랜스포트로 나가는 최종 요청(URL 확정, 헤더 부착 완료).
public struct TransportRequest: Sendable, Equatable {
    public var method: HTTPMethod
    public var url: URL
    public var headers: [String: String]
    public var body: Data?
    public var timeouts: NetworkTimeouts
    public init(method: HTTPMethod, url: URL, headers: [String: String] = [:], body: Data? = nil, timeouts: NetworkTimeouts) {
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body
        self.timeouts = timeouts
    }
    /// 대소문자를 구분하지 않는 헤더 조회.
    public func header(_ name: String) -> String? { HeaderLookup.value(of: name, in: headers) }
}

/// 플랫폼 중립 전송 오류. 앱 타깃의 URLSessionTransport가 URLError를 여기로 옮긴다.
public enum TransportError: Error, Sendable, Equatable {
    case timeout
    case notConnected
    case dnsFailure
    case tls
    case cancelled
    case other(String)
}

public protocol HTTPTransport: Sendable {
    /// 4xx·5xx도 `HTTPResponse`로 돌려준다. 전송 실패만 `TransportError`(또는 `CancellationError`)를 던진다.
    func send(_ request: TransportRequest) async throws -> HTTPResponse
}

/// 대소문자를 구분하지 않는 헤더 조회.
enum HeaderLookup {
    static func value(of name: String, in headers: [String: String]) -> String? {
        let wanted = name.lowercased()
        return headers.first { $0.key.lowercased() == wanted }?.value
    }
}

extension TransportError {
    /// 로그용 케이스명. `.other`의 연관값(URL·서명이 섞일 수 있음)은 버린다.
    var caseName: String {
        switch self {
        case .timeout: "timeout"
        case .notConnected: "notConnected"
        case .dnsFailure: "dnsFailure"
        case .tls: "tls"
        case .cancelled: "cancelled"
        case .other: "other"
        }
    }
}
