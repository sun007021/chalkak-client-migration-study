import Foundation
import ChalkakCore
import ChalkakNetwork

/// 가입 완료 결과. 토큰은 저장소에만 두고 노출하지 않는다.
public struct SignUpResult: Sendable, Equatable {
    public let userId: String
    /// 업로드 발급이 400(이미 가입된 소셜 계정)이라 `social-login`을 다시 불러 로그인된 경우 true(REQ-ONB-022).
    public let wasExistingAccount: Bool
    public init(userId: String, wasExistingAccount: Bool) {
        self.userId = userId
        self.wasExistingAccount = wasExistingAccount
    }
}

/// 가입 시퀀스가 `APIError` 말고 따로 던지는 오류.
public enum SignUpError: Error, Sendable, Equatable {
    /// presigned `PUT`이 (D-21 재시도 뒤에도) 2xx가 아니었다(S3 403·만료·5xx). 확정 호출은 하지 않았다.
    case uploadRejected(status: Int)
    /// `SIGNATURE_PROCESSING_PENDING`을 최초 요청 뒤 10회(총 11회)까지 받고도 끝나지 않았다.
    case processingTimeout
    /// 업로드 발급 400 뒤 `social-login`을 다시 불렀는데 `SIGN_UP_REQUIRED`가 나왔다.
    case existingAccountNeedsSignUp
    /// 업로드 발급 400 뒤 `social-login`이 401·403 외의 HTTP 오류로 실패했다. 가입 확정 단계 오류와 구분하려고 감싼다.
    case issueNotFound
    case existingAccountLoginFailed(status: Int)
}

public protocol SignUpRepository: Sendable {
    /// 가입 한 번분의 전체 시퀀스(REQ-ONB-013). 항상 (1) 업로드 발급부터 새로 시작한다.
    ///
    /// 1. `POST auth/social-signup/signature/uploads {provider:"KAKAO", idToken, rawNonce}` — anonymous, 재시도 없음.
    ///    400이면(메시지 비교 없이) `AuthRepository.socialLogin`을 같은 값으로 다시 불러 `.loggedIn`이면 `SignUpResult(wasExistingAccount: true)`,
    ///    `.signUpRequired`면 `SignUpError.existingAccountNeedsSignUp`.
    /// 2. 받은 `uploadUrl`로 `PUT`(`image/png`, 인증 헤더 없음, 멱등 재시도). 2xx가 아니면 `SignUpError.uploadRejected`(네트워크 오류는 `APIError.network` 그대로).
    /// 3. `POST auth/social-signup {signupToken}` — anonymous, 재시도 없음.
    ///    `400 SIGNATURE_PROCESSING_PENDING`이면 `AppConstants.signupPendingRetryInterval` 뒤 같은 `signupToken`으로 다시, 최대 `signupPendingRetryMaxAttempts`회.
    ///    소진하면 `SignUpError.processingTimeout`. 그 밖의 오류는 `APIError`로 그대로 던진다(스테이지 구분 없음).
    ///    200이면 토큰을 `SessionStore`에 저장(만료 = 받은 시각 + 응답 초)하고 게스트 플래그를 best-effort로 지운다. 추가 로그인 호출 없음.
    /// 취소되면 세션을 저장하지 않고 `CancellationError`를 던진다(응답이 취소 뒤에 도착해도 같다).
    func signUp(idToken: String, rawNonce: String, signaturePNG: Data) async throws -> SignUpResult
}

public struct APISignUpRepository: SignUpRepository {
    private let client: APIClient
    private let sessionStore: any SessionStore
    private let guestFlags: any GuestFlagStore
    private let authRepository: any AuthRepository
    private let clock: any AppClock

    public init(
        client: APIClient,
        sessionStore: any SessionStore,
        guestFlags: any GuestFlagStore,
        authRepository: any AuthRepository,
        clock: any AppClock
    ) {
        self.client = client
        self.sessionStore = sessionStore
        self.guestFlags = guestFlags
        self.authRepository = authRepository
        self.clock = clock
    }

    public func signUp(idToken: String, rawNonce: String, signaturePNG: Data) async throws -> SignUpResult {
        let issued: UploadIssue
        do {
            issued = try await issueUpload(idToken: idToken, rawNonce: rawNonce)
        } catch APIError.http(status: 404, _, _) {
            // 404는 확정 단계(업로드 못 찾음)만의 의미라 발급 단계 404는 구분해 감싼다.
            throw SignUpError.issueNotFound
        } catch APIError.http(status: 400, _, _) {
            // 이미 가입된 소셜 계정: message와 무관하게 로그인으로 전환한다(D-02).
            return try await loginExistingAccount(idToken: idToken, rawNonce: rawNonce)
        }
        try await upload(signaturePNG, to: issued.uploadUrl)
        try Task.checkCancellation()
        let tokens = try await confirm(signupToken: issued.signupToken)
        // 응답이 취소 뒤에 도착했으면 저장하지 않는다.
        try Task.checkCancellation()
        await sessionStore.save(tokens.makeSession(now: clock.now))
        // 인증 세션이 게스트 플래그보다 우선이므로 지우기 실패가 가입 성공을 막지 않는다.
        try? await guestFlags.setGuest(false)
        return SignUpResult(userId: tokens.userId, wasExistingAccount: false)
    }

    private func issueUpload(idToken: String, rawNonce: String) async throws -> UploadIssue {
        let body = try APIJSON.makeEncoder().encode(SocialLoginRequest(idToken: idToken, rawNonce: rawNonce))
        let request = HTTPRequest(method: .post, path: "auth/social-signup/signature/uploads", body: body, authPolicy: .anonymous, retryPolicy: RetryPolicy.none)
        return try await client.send(request, as: UploadIssue.self)
    }

    private func loginExistingAccount(idToken: String, rawNonce: String) async throws -> SignUpResult {
        let outcome: SocialLoginOutcome
        do {
            outcome = try await authRepository.socialLogin(idToken: idToken, rawNonce: rawNonce)
        } catch APIError.http(let status, _, _) where ![401, 403].contains(status) {
            // 가입 확정 단계 오류로 오분류되지 않게 감싼다(400/404는 확정 단계 의미).
            throw SignUpError.existingAccountLoginFailed(status: status)
        }
        switch outcome {
        case .loggedIn(let userId): return SignUpResult(userId: userId, wasExistingAccount: true)
        case .signUpRequired: throw SignUpError.existingAccountNeedsSignUp
        }
    }

    private func upload(_ png: Data, to url: URL) async throws {
        do {
            try await client.uploadToPresignedURL(url, data: png, contentType: "image/png")
        } catch APIError.http(let status, _, _) {
            throw SignUpError.uploadRejected(status: status)
        }
    }

    /// PENDING이면 같은 `signupToken`으로 간격을 두고 다시 보낸다(최초 1회 + 재시도 최대 10회).
    private func confirm(signupToken: String) async throws -> SignUpTokens {
        let body = try APIJSON.makeEncoder().encode(ConfirmRequest(signupToken: signupToken))
        let request = HTTPRequest(method: .post, path: "auth/social-signup", body: body, authPolicy: .anonymous, retryPolicy: RetryPolicy.none)
        for attempt in 0...AppConstants.signupPendingRetryMaxAttempts {
            do {
                return try await client.send(request, as: SignUpTokens.self)
            } catch APIError.http(status: 400, code: .signatureProcessingPending, _) {
                if attempt < AppConstants.signupPendingRetryMaxAttempts {
                    try await clock.sleep(for: AppConstants.signupPendingRetryInterval)
                }
            }
        }
        throw SignUpError.processingTimeout
    }
}

private struct UploadIssue: Decodable, Sendable {
    let uploadUrl: URL
    let signupToken: String
}

private struct ConfirmRequest: Encodable {
    let signupToken: String
}

/// 가입 확정 200 응답. 빈 토큰을 저장하면 이후 요청이 모두 실패하므로 빈 문자열은 해석 불가로 본다.
private struct SignUpTokens: Decodable, Sendable {
    let userId: String
    let accessToken: String
    let expiresIn: TimeInterval
    let refreshToken: String
    let refreshTokenExpiresIn: TimeInterval

    init(from decoder: any Decoder) throws {
        enum Keys: String, CodingKey { case userId, accessToken, expiresIn, refreshToken, refreshTokenExpiresIn }
        let c = try decoder.container(keyedBy: Keys.self)
        userId = try c.decode(String.self, forKey: .userId)
        accessToken = try c.decode(String.self, forKey: .accessToken)
        expiresIn = try c.decode(TimeInterval.self, forKey: .expiresIn)
        refreshToken = try c.decode(String.self, forKey: .refreshToken)
        refreshTokenExpiresIn = try c.decode(TimeInterval.self, forKey: .refreshTokenExpiresIn)
        guard ![userId, accessToken, refreshToken].contains(where: \.isEmpty) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "빈 문자열"))
        }
    }

    func makeSession(now: Date) -> AuthSession {
        LoginTokens(userId: userId, accessToken: accessToken, expiresIn: expiresIn, refreshToken: refreshToken, refreshTokenExpiresIn: refreshTokenExpiresIn)
            .makeSession(now: now)
    }
}
