import Foundation
import ChalkakNetwork

/// 액세스 토큰(JWT) 클레임 읽기. 서명은 검증하지 않는다.
public enum AccessTokenClaims {
    /// payload에 `session_id`(비어 있지 않은 문자열)가 있으면 true. 형식 오류(세그먼트 3개 아님, base64 오류, payload가 JSON 객체 아님)는 예외 없이 false.
    public static func hasSessionId(_ token: String) -> Bool {
        let segments = token.split(separator: ".", omittingEmptySubsequences: false)
        guard segments.count == 3, let payload = decodeBase64URL(String(segments[1])),
              let object = (try? JSONSerialization.jsonObject(with: payload)) as? [String: Any],
              let sessionId = object["session_id"] as? String
        else { return false }
        return !sessionId.isEmpty
    }

    /// base64url(패딩 없음)을 해석한다. 알 수 없는 문자는 건너뛰지 않고 실패로 본다.
    private static func decodeBase64URL(_ text: String) -> Data? {
        var base64 = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        base64.append(String(repeating: "=", count: (4 - base64.count % 4) % 4))
        return Data(base64Encoded: base64)
    }
}

public protocol FCMTokenProviding: Sendable {
    /// SDK가 지금 가진 FCM 토큰. 없으면 nil.
    func currentToken() async -> String?
}

public enum PushRegistrationResult: Sendable, Equatable {
    case registered
    /// 같은 프로세스에서 이미 성공한 (userId, 토큰) 쌍
    case alreadyRegistered
    case skippedNoToken
    case skippedEmptyToken
    /// 게스트·로그아웃(세션 없음)
    case skippedNoSession
    /// 갱신한 토큰에도 `session_id`가 없음
    case skippedNoSessionId
    /// 연결 실패·5xx·400 등. 로그인은 유지하고 다음 트리거에 다시 시도한다.
    case failed
    /// 갱신도 REAUTHENTICATION_REQUIRED(세션이 지워지고 `AuthEvents`가 호출됨)
    case loginRequired
}

/// 푸시 기기 등록(REQ-PUSH-007~016). `PUT /push-devices/current` `{fcmToken}`.
/// - 트리거: 로그인·가입 직후, 인증 상태 앱 시작, 포그라운드 → `register()`, FCM 토큰 변경 → `tokenChanged(_:)`.
/// - 세션이 없으면 요청하지 않는다. 토큰은 `tokenChanged`로 받은 마지막 값, 없으면 `FCMTokenProviding.currentToken()`. 비었으면 보내지 않는다.
/// - 액세스 토큰에 `session_id`가 없으면 먼저 `AuthRefresher.refreshSession`으로 갱신하고 새 토큰으로 등록한다(그래도 없으면 요청 0건).
/// - 성공한 (userId, 토큰) 쌍은 다시 보내지 않고, 동시에 하나만 실행한다(동시 호출은 직렬화되어 중복 제거된다).
/// - 401은 `APIClient`가 갱신 후 1회 재전송한다. 로그아웃·탈퇴는 `sessionEnded()`로 중복 제거 기록만 비운다(해제 API 없음).
public actor PushDeviceRegistrar {
    private struct Registration: Equatable {
        let userId: String
        let token: String
    }

    private struct RequestBody: Encodable {
        let fcmToken: String
    }

    private let client: APIClient
    private let store: any SessionStore
    private let refresher: AuthRefresher
    private let tokens: any FCMTokenProviding

    /// `tokenChanged`로 받은 마지막 비어 있지 않은 토큰.
    private var latestToken: String?
    /// 마지막으로 성공한 (userId, 토큰) 쌍. 실패는 남기지 않는다.
    private var lastRegistered: Registration?
    /// 동시에 하나만 실행하기 위한 순번 잠금(actor 재진입 때문에 await 사이에 다른 호출이 끼어든다).
    private var isBusy = false
    private var waiters: [CheckedContinuation<Void, Never>] = []
    /// `sessionEnded()`마다 올라간다. 요청 도중 세션이 끝났으면 성공해도 중복 제거 기록을 남기지 않는다.
    private var epoch = 0
    /// 테스트 관찰용: 호출이 잠금 대기열에 들어간 직후 불린다.
    private var queueObserver: (@Sendable () -> Void)?

    public init(client: APIClient, store: any SessionStore, refresher: AuthRefresher, tokens: any FCMTokenProviding) {
        self.client = client
        self.store = store
        self.refresher = refresher
        self.tokens = tokens
    }

    @discardableResult
    public func register() async -> PushRegistrationResult {
        await serialized { await self.attempt(explicitToken: nil) }
    }

    @discardableResult
    public func tokenChanged(_ token: String) async -> PushRegistrationResult {
        if !Self.isEmpty(token) { latestToken = token }
        return await serialized { await self.attempt(explicitToken: token) }
    }

    /// 로그아웃·탈퇴: 중복 제거 기록만 비운다(기기 해제 API는 없다, REQ-PUSH-015).
    public func sessionEnded() async {
        epoch += 1
        lastRegistered = nil
    }

    func setQueueObserver(_ observer: @escaping @Sendable () -> Void) { queueObserver = observer }

    // MARK: - 실행

    private func attempt(explicitToken: String?) async -> PushRegistrationResult {
        let startEpoch = epoch
        guard var session = await store.currentSession() else { return .skippedNoSession }
        let candidate: String?
        if let explicitToken {
            candidate = explicitToken
        } else if let latestToken {
            candidate = latestToken
        } else {
            candidate = await tokens.currentToken()
        }
        guard let token = candidate else { return .skippedNoToken }
        guard !Self.isEmpty(token) else { return .skippedEmptyToken }

        // 이미 등록한 쌍이면 갱신·요청 모두 필요 없다.
        if lastRegistered == Registration(userId: session.userId, token: token) { return .alreadyRegistered }

        // session_id가 없는 액세스 토큰으로는 서버가 기기를 세션에 묶지 못한다. 먼저 갱신해 새 토큰으로 등록한다(REQ-PUSH-010).
        if !AccessTokenClaims.hasSessionId(session.accessToken) {
            do {
                session = try await refresher.refreshSession(rejected: session)
            } catch APIError.http(401, .reauthenticationRequired, _) {
                return .loginRequired // 갱신기가 세션을 지우고 AuthEvents를 이미 호출했다.
            } catch {
                return .failed // 연결 실패·취소·계정 전환. 다음 트리거에 다시 시도한다.
            }
            guard AccessTokenClaims.hasSessionId(session.accessToken) else { return .skippedNoSessionId }
        }

        let registration = Registration(userId: session.userId, token: token)

        do {
            // 토큰 원문은 로그·오류에 남기지 않는다(REQ-PUSH-018).
            let body = try APIJSON.makeEncoder().encode(RequestBody(fcmToken: token))
            let request = HTTPRequest(method: .put, path: "/push-devices/current", body: body)
            let client = client
            try await perform(.registerPushDevice) { try await client.sendEmpty(request) }
            // 요청 도중 로그아웃·탈퇴가 있었으면 기록하지 않는다(다음 로그인에서 다시 등록해야 한다).
            guard epoch == startEpoch else { return .skippedNoSession }
            lastRegistered = registration
            return .registered
        } catch FeedFailure.unauthorized {
            return .loginRequired
        } catch {
            // 400(빈 토큰은 클라이언트 버그), 연결 실패, 5xx, 취소. 로그인은 유지하고 재시도하지 않는다(REQ-PUSH-012).
            return .failed
        }
    }

    private static func isEmpty(_ token: String) -> Bool {
        token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func serialized(_ body: () async -> PushRegistrationResult) async -> PushRegistrationResult {
        if isBusy {
            await withCheckedContinuation { waiters.append($0); queueObserver?() }
        } else {
            isBusy = true
        }
        let result = await body()
        if waiters.isEmpty {
            isBusy = false
        } else {
            waiters.removeFirst().resume() // 잠금을 다음 대기자에게 그대로 넘긴다.
        }
        return result
    }
}
