import Foundation

public enum ErrorCode: String, Sendable, Equatable, CaseIterable {
    case businessError = "BUSINESS_ERROR"
    case signatureRegistrationRequired = "SIGNATURE_REGISTRATION_REQUIRED"
    case signatureReuploadRequired = "SIGNATURE_REUPLOAD_REQUIRED"
    case signatureProcessingPending = "SIGNATURE_PROCESSING_PENDING"
    case unauthorized = "UNAUTHORIZED"
    case reauthenticationRequired = "REAUTHENTICATION_REQUIRED"
    case forbidden = "FORBIDDEN"
    case internalError = "INTERNAL_ERROR"

    /// 서버 문자열 → 코드. 알 수 없는 값(RESOURCE_STATE_CHANGED 포함)은 `.businessError`. nil/빈 값은 nil.
    public static func from(serverValue: String?) -> ErrorCode? {
        guard let serverValue, !serverValue.isEmpty else { return nil }
        return ErrorCode(rawValue: serverValue) ?? .businessError
    }
}

/// 요청 실패를 나타내는 네트워크 계층 오류. 이 밖에 APIClient는 설정 문제에 `ConfigurationError`, 취소(갱신 중 계정 전환 포함)에 `CancellationError`를 던진다(여기에 case 없음).
public enum APIError: Error, Sendable, Equatable {
    /// `code`가 nil이면 errorCode 없는 본문(HTML 게이트웨이, 빈 본문 등) — status로만 분류.
    case http(status: Int, code: ErrorCode?, message: String?)
    case network
    case invalidResponse
}

public enum AuthError: Error, Sendable, Equatable {
    /// 갱신·요청 도중 로그아웃/계정 전환이 일어나 결과를 버렸다. `AuthRefresher` 내부 신호이며
    /// `APIClient` 밖으로는 나가지 않고 `CancellationError`로 바뀐다(D-20).
    case sessionChanged
}

public enum ErrorResponseParser {
    /// 비 2xx 응답을 `APIError.http`로 변환한다. 본문 파싱 실패 시에도 status는 보존한다.
    public static func parse(status: Int, body: Data) -> APIError {
        let payload = try? JSONDecoder().decode(ErrorPayload.self, from: body)
        return .http(status: status, code: ErrorCode.from(serverValue: payload?.errorCode), message: payload?.message)
    }

    private struct ErrorPayload: Decodable {
        let errorCode: String?
        let message: String?
    }
}
