import Foundation
import ChalkakCore

public struct APIClient: Sendable {
    private let runner: AuthenticatedRunner
    private let configuration: APIConfiguration

    public init(
        configuration: APIConfiguration,
        transport: any HTTPTransport,
        store: any SessionStore,
        refresher: AuthRefresher,
        clock: any AppClock,
        logger: any NetworkLogger = NoopNetworkLogger()
    ) {
        self.configuration = configuration
        runner = AuthenticatedRunner(
            factory: RequestFactory(configuration: configuration, clock: clock),
            caller: TransportCaller(transport: transport, clock: clock, logger: logger),
            store: store,
            refresher: refresher
        )
    }

    /// 2xx면 응답을 돌려준다. 그 밖은 `APIError`(설정 문제는 `ConfigurationError`), 취소·갱신 중 계정 전환은 `CancellationError`.
    public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        try await runner.run(request)
    }

    /// 본문이 필요한 API. 빈 본문·깨진 JSON·JSON 아닌 Content-Type·필수 필드 누락은 `APIError.invalidResponse`.
    public func send<T: Decodable & Sendable>(_ request: HTTPRequest, as type: T.Type) async throws -> T {
        try ResponseDecoding.decode(type, from: try await runner.run(request))
    }

    /// 204 등 본문이 필요 없는 API. 본문 디코딩을 시도하지 않는다.
    public func sendEmpty(_ request: HTTPRequest) async throws {
        _ = try await runner.run(request)
    }

    /// presigned PUT. Authorization·공통 헤더 없이 Content-Type만, 응답 타임아웃 60초.
    /// URL이 https(또는 플래그가 켜진 loopback http)가 아니면 전송 전에 `ConfigurationError.invalidUploadURL`.
    public func uploadToPresignedURL(_ url: URL, data: Data, contentType: String) async throws {
        let url = try configuration.validatedUploadURL(url)
        let request = runner.factory.makePresignedUpload(url: url, data: data, contentType: contentType)
        let response = try await runner.caller.call(request, retryPolicy: .idempotent)
        guard ResponseDecoding.isSuccess(response) else { throw ResponseDecoding.failure(for: response) }
    }
}
