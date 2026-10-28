import Foundation
import ChalkakCore
import ChalkakNetwork

/// `GET /users/me/signature` 응답.
public struct UserSignature: Sendable, Equatable {
    public let originalImageURL: URL
    public let thumbnailImageURL: URL?
    public init(originalImageURL: URL, thumbnailImageURL: URL?) {
        self.originalImageURL = originalImageURL
        self.thumbnailImageURL = thumbnailImageURL
    }
    /// 사인 카드에 쓸 URL: 썸네일, 없으면(null) 원본(D-18).
    public var displayURL: URL { thumbnailImageURL ?? originalImageURL }
}

public enum SignatureLookup: Sendable, Equatable {
    case registered(UserSignature)
    /// `400 SIGNATURE_REGISTRATION_REQUIRED`: 오류가 아니라 "빈 사인 + 변경하기" 상태(REQ-SIGN-016).
    case registrationRequired
}

public enum SignatureChangeError: Error, Sendable, Equatable {
    /// presigned `PUT`이 (D-21 재시도 뒤에도) 2xx가 아니었다. 확정 호출은 하지 않았다.
    case uploadRejected(status: Int)
}

public protocol SignatureRepository: Sendable {
    /// `GET users/me/signature`(멱등 재시도). `400 SIGNATURE_REGISTRATION_REQUIRED`는 `.registrationRequired`, 그 밖의 오류는 `APIError`.
    func currentSignature() async throws -> SignatureLookup

    /// 변경 시퀀스(REQ-SIGN-020). 항상 새 업로드 발급부터 시작한다(이전 uploadId 재사용 금지, SIGN-004).
    /// 1. `POST users/me/signature/uploads`(본문 없음). 업로드 정책 발급이므로 멱등 재시도(D-21)를 **명시**한다(POST 기본은 재시도 없음).
    /// 2. 받은 `uploadUrl`로 `PUT`(`image/png`, 인증 헤더 없음). 2xx가 아니면 `SignatureChangeError.uploadRejected`, 네트워크 오류는 `APIError.network`.
    /// 3. `PUT users/me/signature {signatureOriginalUploadId}`(멱등 재시도). 응답의 URL은 쓰지 않는다(그래서 반환값이 없다, D-18).
    /// 앞 단계가 실패하면 다음 단계는 호출하지 않는다. 확정 응답이 도착했을 때 세션의 userId가 시작 때와 다르거나 세션이 없으면(로그아웃·계정 전환)
    /// 결과를 버리고 `CancellationError`를 던진다. 취소되면 확정을 부르지 않는다.
    func changeSignature(png: Data) async throws
}

public struct APISignatureRepository: SignatureRepository {
    private let client: APIClient
    private let sessionStore: any SessionStore

    public init(client: APIClient, sessionStore: any SessionStore) {
        self.client = client
        self.sessionStore = sessionStore
    }

    public func currentSignature() async throws -> SignatureLookup {
        do {
            let response = try await client.send(HTTPRequest(method: .get, path: "users/me/signature"), as: SignatureResponse.self)
            return .registered(UserSignature(originalImageURL: response.signatureOriginalImageUrl, thumbnailImageURL: response.signatureThumbnailImageUrl))
        } catch APIError.http(status: 400, code: .signatureRegistrationRequired, _) {
            return .registrationRequired
        }
    }

    public func changeSignature(png: Data) async throws {
        let startUserId = await sessionStore.currentSession()?.userId
        // 발급은 POST지만 멱등이라 재시도를 명시한다(D-21).
        let issue = HTTPRequest(method: .post, path: "users/me/signature/uploads", retryPolicy: .idempotent)
        let issued = try await client.send(issue, as: UploadIssue.self)
        do {
            try await client.uploadToPresignedURL(issued.uploadUrl, data: png, contentType: "image/png")
        } catch APIError.http(let status, _, _) {
            throw SignatureChangeError.uploadRejected(status: status)
        }
        try Task.checkCancellation()
        // PUT 동안 계정이 바뀌었다면 이전 계정의 uploadId를 새 계정 토큰으로 확정하지 않는다.
        guard await sessionStore.currentSession()?.userId == startUserId else { throw CancellationError() }
        let body = try APIJSON.makeEncoder().encode(ConfirmRequest(signatureOriginalUploadId: issued.uploadId))
        try await client.sendEmpty(HTTPRequest(method: .put, path: "users/me/signature", body: body))
        // 응답 도착 시점에 로그아웃·계정 전환이 있었으면 결과를 버린다.
        try Task.checkCancellation()
        guard let startUserId, await sessionStore.currentSession()?.userId == startUserId else { throw CancellationError() }
    }
}

private struct SignatureResponse: Decodable, Sendable {
    let signatureOriginalImageUrl: URL
    let signatureThumbnailImageUrl: URL?
}

private struct UploadIssue: Decodable, Sendable {
    let uploadId: String
    let uploadUrl: URL
}

private struct ConfirmRequest: Encodable {
    let signatureOriginalUploadId: String
}
