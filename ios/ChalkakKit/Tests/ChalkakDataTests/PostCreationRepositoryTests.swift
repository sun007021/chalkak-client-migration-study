import Foundation
import Testing
import ChalkakCore
import ChalkakNetwork
import ChalkakTestSupport
@testable import ChalkakData

@Suite("UPL 게시물 작성 저장소", .timeLimit(.minutes(1)))
struct PostCreationRepositoryTests {
    private static let topicDate = KSTDate(year: 2026, month: 10, day: 27)!

    // MARK: GET /posts/today (HOME의 APITodayPostRepository를 게이트·복구·판정에 쓴다)
    // 상태 매핑·404/403/500·모순 응답·401 갱신은 TodayPostRepositoryTests(TC-HOME-*)가 맡고, 여기에는 UPL 고유 단언만 둔다.

    @Test("TC-UPL-002 GET /posts/today를 1회 보내고 isPosted=false면 topicDate만 있으며 Authorization이 붙는다")
    func todayNotPosted() async throws {
        let sut = try UploadSUT(script: RouteScript().on(todayRoute, fixture: "home/posts-today__not-posted.json"))
        let status = try await sut.today.todayStatus()
        #expect(status == TodayPostStatus(topicDate: Self.topicDate, isPosted: false, postId: nil, moderationStatus: nil))
        #expect(await sut.transport.sequence() == [todayRoute])
        let request = try #require(await sut.transport.requests(key: todayRoute).first)
        #expect(request.header("Authorization") == "Bearer old-access")
        #expect(request.body == nil)
    }

    @Test("TC-UPL-006 today의 refresh가 REAUTHENTICATION_REQUIRED면 재인증 이벤트를 한 번 보내고 unauthorized를 던진다")
    func todayReauthenticationRequired() async throws {
        let script = try RouteScript()
            .on(todayRoute, fixture: "home/posts-today__401-unauthorized.json")
            .on(refreshRoute, fixture: "auth/refresh__reauthentication-required.json")
        let sut = try UploadSUT(script: script)
        await #expect(throws: FeedFailure.unauthorized) { try await sut.today.todayStatus() }
        #expect(await sut.events.count == 1)
        #expect(await sut.transport.count(of: todayRoute) == 1)
    }

    // MARK: POST /posts/uploads (정책 발급)

    @Test("TC-UPL-023 정책 발급은 POST /posts/uploads 본문 없음 + Authorization이고 S3 PUT은 보내지 않는다")
    func issueRequestShape() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__issued.json"))
        _ = try await sut.repository.issueUpload()
        #expect(await sut.transport.sequence() == [issueRoute])
        let request = try #require(await sut.transport.requests(key: issueRoute).first)
        #expect(request.body == nil)
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-UPL-024 정책 응답의 uploadId·uploadUrl·expiresInSeconds·contentType·maxBytes를 읽는다")
    func issueParsesPolicy() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__issued.json"))
        let policy = try await sut.repository.issueUpload()
        #expect(policy == issuedPolicy)
        #expect(policy.expiresIn == .seconds(300))
        #expect(policy.isWebP)
    }

    @Test("TC-UPL-024 maxBytes는 32비트를 넘는 값도 64비트 정수로 보존한다")
    func issueKeepsInt64MaxBytes() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__issued-large-max.json"))
        let policy = try await sut.repository.issueUpload()
        #expect(policy.maxBytes == 5_000_000_000)
    }

    @Test("TC-UPL-025 contentType이 image/png인 정책도 읽히지만 isWebP는 false이다(호출 측이 준비 실패로 처리)")
    func issuePngPolicyIsNotWebP() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__content-type-png.json"))
        let policy = try await sut.repository.issueUpload()
        #expect(policy.contentType == "image/png")
        #expect(!policy.isWebP)
    }

    @Test("TC-UPL-026 필수 필드가 빠진 정책은 계약 위반(invalidResponse)이다")
    func issueMissingFields() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__missing-fields.json"))
        await #expect(throws: APIError.invalidResponse) { try await sut.repository.issueUpload() }
    }

    @Test("TC-UPL-027 정책 발급 500은 멱등이라 0.5초·1초 백오프로 최대 2회 재시도하고 오류를 던진다")
    func issueServerErrorRetries() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__500-server-error.json"))
        let expected = try apiError(fixture: "upload/posts-uploads__500-server-error.json")
        await #expect(throws: expected) { try await sut.repository.issueUpload() }
        #expect(await sut.transport.count(of: issueRoute) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-UPL-027 정책 발급이 한 번 500이어도 재시도로 성공하면 정책을 돌려준다")
    func issueRecoversAfterRetry() async throws {
        let script = try RouteScript().on(issueRoute, fixtures: ["upload/posts-uploads__500-server-error.json", "upload/posts-uploads__issued.json"])
        let sut = try UploadSUT(script: script)
        let policy = try await sut.repository.issueUpload()
        #expect(policy == issuedPolicy)
        #expect(await sut.transport.count(of: issueRoute) == 2)
    }

    @Test("TC-UPL-027 정책 발급 403(정지)은 재요청 없이 status 그대로 던진다")
    func issueBannedStops() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__403-banned.json"))
        let expected = try apiError(fixture: "upload/posts-uploads__403-banned.json")
        await #expect(throws: expected) { try await sut.repository.issueUpload() }
        #expect(await sut.transport.sequence() == [issueRoute])
    }

    @Test("TC-UPL-027 정책 발급 401이면 refresh 1회 뒤 1회만 재전송한다")
    func issueUnauthorizedRefreshesOnce() async throws {
        let script = try RouteScript()
            .on(issueRoute, fixtures: ["upload/posts-uploads__401-unauthorized.json", "upload/posts-uploads__issued.json"])
            .on(refreshRoute, fixture: "auth/refresh__success.json")
        let sut = try UploadSUT(script: script)
        _ = try await sut.repository.issueUpload()
        #expect(await sut.transport.count(of: refreshRoute) == 1)
        #expect(await sut.transport.count(of: issueRoute) == 2)
    }

    @Test("TC-UPL-027 정책 발급이 연결 실패면 재시도 뒤 APIError.network이다")
    func issueNetworkFailure() async throws {
        let sut = try UploadSUT(script: RouteScript().fail(issueRoute, .notConnected))
        await #expect(throws: APIError.network) { try await sut.repository.issueUpload() }
        #expect(await sut.transport.count(of: issueRoute) == 3)
    }

    // MARK: PUT presigned

    @Test("TC-UPL-054 PUT은 메서드 PUT, Authorization 없음(세션이 있어도), Content-Type은 정책 값, 본문은 WebP 바이트 그대로이다")
    func putShape() async throws {
        let sut = try UploadSUT(script: RouteScript().on(putRoute1, fixture: "upload/s3-put__200.json"))
        try await sut.repository.uploadImage(testWebP, policy: issuedPolicy)
        let put = try #require(await sut.transport.requests(key: putRoute1).first)
        #expect(put.method == .put)
        #expect(put.header("Authorization") == nil)
        #expect(put.header("Content-Type") == "image/webp")
        #expect(put.body == testWebP)
        #expect(put.url.absoluteString == issuedPolicy.uploadUrl.absoluteString)
    }

    @Test("TC-UPL-054 Content-Type은 정책 값을 그대로 쓴다(정책이 다른 값이면 그 값)")
    func putUsesPolicyContentType() async throws {
        let policy = PostUploadPolicy(uploadId: uploadId1, uploadUrl: issuedPolicy.uploadUrl, expiresInSeconds: 300, contentType: "image/webp; v=1", maxBytes: 5_242_880)
        let sut = try UploadSUT(script: RouteScript().on(putRoute1, fixture: "upload/s3-put__200.json"))
        try await sut.repository.uploadImage(testWebP, policy: policy)
        let put = try #require(await sut.transport.requests(key: putRoute1).first)
        #expect(put.header("Content-Type") == "image/webp; v=1")
    }

    @Test("TC-UPL-055 S3 403(서명 불일치·만료)은 재시도 없이 uploadRejected(403)이다")
    func putForbidden() async throws {
        let sut = try UploadSUT(script: RouteScript().on(putRoute1, fixture: "upload/s3-put__403-signature-mismatch.json"))
        await #expect(throws: PostUploadError.uploadRejected(status: 403)) { try await sut.repository.uploadImage(testWebP, policy: issuedPolicy) }
        #expect(await sut.transport.count(of: putRoute1) == 1)
    }

    @Test("TC-UPL-055 S3 5xx는 멱등 PUT이라 0.5초·1초로 최대 2회 재시도한 뒤 uploadRejected(500)이다")
    func putServerErrorRetries() async throws {
        let sut = try UploadSUT(script: RouteScript().on(putRoute1, fixture: "upload/s3-put__500-server-error.json"))
        await #expect(throws: PostUploadError.uploadRejected(status: 500)) { try await sut.repository.uploadImage(testWebP, policy: issuedPolicy) }
        #expect(await sut.transport.count(of: putRoute1) == 3)
        #expect(sut.clock.recordedSleeps == [.milliseconds(500), .milliseconds(1000)])
    }

    @Test("TC-UPL-055 PUT 연결 실패는 APIError.network이다")
    func putNetworkFailure() async throws {
        let sut = try UploadSUT(script: RouteScript().fail(putRoute1, .notConnected))
        await #expect(throws: APIError.network) { try await sut.repository.uploadImage(testWebP, policy: issuedPolicy) }
        #expect(await sut.transport.count(of: putRoute1) == 3)
    }

    @Test("TC-UPL-056 업로드 URL이 http(비 loopback)면 전송하지 않고 invalidUploadURL이다")
    func putInsecureURL() async throws {
        let sut = try UploadSUT(script: RouteScript().on(issueRoute, fixture: "upload/posts-uploads__insecure-upload-url.json"))
        let policy = try await sut.repository.issueUpload()
        #expect(policy.uploadUrl.scheme == "http")
        await #expect(throws: ConfigurationError.invalidUploadURL) { try await sut.repository.uploadImage(testWebP, policy: policy) }
        #expect(await sut.transport.sequence() == [issueRoute])
    }

    @Test("TC-UPL-057 PUT 응답 제한은 60초이다(일반 API는 15초)")
    func putTimeout() async throws {
        let sut = try UploadSUT(script: RouteScript().on(putRoute1, fixture: "upload/s3-put__200.json"))
        try await sut.repository.uploadImage(testWebP, policy: issuedPolicy)
        let put = try #require(await sut.transport.requests(key: putRoute1).first)
        #expect(put.timeouts.response == .seconds(60))
        #expect(put.timeouts.response == AppConstants.uploadPutTimeout)
    }

    @Test("TC-UPL-058 본문이 정책 maxBytes를 넘으면 PUT을 보내지 않고 payloadTooLarge이고, 정확히 maxBytes면 보낸다")
    func putSizeGuard() async throws {
        let policy = PostUploadPolicy(uploadId: uploadId1, uploadUrl: issuedPolicy.uploadUrl, expiresInSeconds: 300, contentType: "image/webp", maxBytes: 20)
        let sut = try UploadSUT(script: RouteScript().on(putRoute1, fixture: "upload/s3-put__200.json"))
        let exact = Data(repeating: 1, count: 20)
        try await sut.repository.uploadImage(exact, policy: policy)
        #expect(await sut.transport.count(of: putRoute1) == 1)
        let over = Data(repeating: 1, count: 21)
        await #expect(throws: PostUploadError.payloadTooLarge) { try await sut.repository.uploadImage(over, policy: policy) }
        #expect(await sut.transport.count(of: putRoute1) == 1)
    }

    // MARK: POST /posts (생성)

    @Test("TC-UPL-059 생성 요청은 POST /posts, 본문 {topicId, photoUploadId, title}, Authorization이다")
    func createRequestShape() async throws {
        let sut = try UploadSUT(script: RouteScript().on(createRoute, fixture: "upload/posts-create__201-pending.json"))
        _ = try await sut.create(rawTitle: "가을 하늘")
        #expect(await sut.transport.sequence() == [createRoute])
        let request = try #require(await sut.transport.requests(key: createRoute).first)
        #expect(request.bodyKeys == ["topicId", "photoUploadId", "title"])
        #expect(request.jsonBody?["topicId"] as? String == "11111111-1111-4111-8111-111111111127")
        #expect(request.jsonBody?["photoUploadId"] as? String == "55555555-5555-4555-8555-555555555501")
        #expect(request.jsonBody?["title"] as? String == "가을 하늘")
        #expect(request.header("Authorization") == "Bearer old-access")
    }

    @Test("TC-UPL-082 제목은 앞뒤 공백을 제거한 값으로 보낸다")
    func createTrimsTitle() async throws {
        let sut = try UploadSUT(script: RouteScript().on(createRoute, fixture: "upload/posts-create__201-pending.json"))
        _ = try await sut.create(rawTitle: " 가나다라마바사아자차 ")
        let request = try #require(await sut.transport.requests(key: createRoute).first)
        #expect(request.jsonBody?["title"] as? String == "가나다라마바사아자차")
    }

    @Test("TC-UPL-082 비었거나 공백뿐인 제목은 null(또는 키 생략)로 보낸다", arguments: ["", "   ", "\n\t \u{00A0}\u{3000}"])
    func createBlankTitleIsNull(raw: String) async throws {
        let sut = try UploadSUT(script: RouteScript().on(createRoute, fixture: "upload/posts-create__201-pending.json"))
        _ = try await sut.create(rawTitle: raw)
        let request = try #require(await sut.transport.requests(key: createRoute).first)
        let title = request.jsonBody?["title"]
        #expect(title == nil || title is NSNull)
    }

    @Test("TC-UPL-083 제목이 10 code point를 넘으면 요청 없이 titleTooLong이다")
    func createTitleTooLong() async throws {
        let sut = try UploadSUT(script: RouteScript().on(createRoute, fixture: "upload/posts-create__201-pending.json"))
        await #expect(throws: PostUploadError.titleTooLong) { try await sut.create(rawTitle: "가나다라마바사아자차카") }
        #expect(await sut.transport.count(of: createRoute) == 0)
    }

    @Test("TC-UPL-060 201 PENDING·VALIDATING을 postId와 함께 읽는다", arguments: [
        ("upload/posts-create__201-pending.json", ModerationStatus.pending),
        ("upload/posts-create__201-validating.json", .validating),
    ])
    func createSuccess(fixture: String, expected: ModerationStatus) async throws {
        let sut = try UploadSUT(script: RouteScript().on(createRoute, fixture: fixture))
        let created = try await sut.create()
        #expect(created.postId == postIdPending)
        #expect(created.status == expected)
    }

    @Test("TC-UPL-061 201인데 moderationStatus가 알 수 없는 값·APPROVED·누락이면 계약 위반이다", arguments: [
        "SOMETHING_NEW", "APPROVED", "",
    ])
    func createInvalidStatus(status: String) async throws {
        let body = status.isEmpty
            ? #"{"postId":"22222222-2222-4222-8222-222222222201"}"#
            : #"{"postId":"22222222-2222-4222-8222-222222222201","moderationStatus":"\#(status)"}"#
        let sut = try UploadSUT(script: RouteScript().on(createRoute, .json(201, body)))
        await #expect(throws: APIError.invalidResponse) { try await sut.create() }
        #expect(await sut.transport.count(of: createRoute) == 1)
    }

    @Test("TC-UPL-061 fixture의 알 수 없는 상태 201도 계약 위반이다")
    func createUnknownStatusFixture() async throws {
        let sut = try UploadSUT(script: RouteScript().on(createRoute, fixture: "upload/posts-create__201-unknown-status.json"))
        await #expect(throws: APIError.invalidResponse) { try await sut.create() }
    }

    @Test("TC-UPL-062 TC-UPL-063 TC-UPL-064 TC-UPL-065 TC-UPL-067 TC-UPL-068 TC-UPL-083 생성 오류는 status·errorCode·message를 담아 그대로 던지고 한 번만 요청하며 재시도하지 않는다", arguments: [
        "upload/posts-create__400-already-posted.json",
        "upload/posts-create__400-topic-not-open.json",
        "upload/posts-create__400-upload-expired.json",
        "upload/posts-create__400-upload-used.json",
        "upload/posts-create__400-rejected-unsupported-format.json",
        "upload/posts-create__400-rejected-too-large.json",
        "upload/posts-create__400-title-too-long.json",
        "upload/posts-create__404-upload-not-found.json",
        "upload/posts-create__404-topic-not-found.json",
        "upload/posts-create__403-banned.json",
        "upload/posts-create__500-server-error.json",
    ])
    func createErrorsPassThrough(fixture: String) async throws {
        let sut = try UploadSUT(script: RouteScript().on(createRoute, fixture: fixture))
        let expected = try apiError(fixture: fixture)
        await #expect(throws: expected) { try await sut.create() }
        #expect(await sut.transport.count(of: createRoute) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    @Test("TC-UPL-066 생성이 401이면 refresh 1회 뒤 원 요청을 1회만 재전송한다")
    func createUnauthorizedRefreshesOnce() async throws {
        let script = try RouteScript()
            .on(createRoute, fixtures: ["upload/posts-create__401-unauthorized.json", "upload/posts-create__201-pending.json"])
            .on(refreshRoute, fixture: "auth/refresh__success.json")
        let sut = try UploadSUT(script: script)
        let created = try await sut.create()
        #expect(created.postId == postIdPending)
        #expect(await sut.transport.count(of: refreshRoute) == 1)
        #expect(await sut.transport.count(of: createRoute) == 2)
    }

    @Test("TC-UPL-066 생성 401 뒤 refresh가 REAUTHENTICATION_REQUIRED면 재인증 이벤트 1회 + 401을 던진다")
    func createReauthenticationRequired() async throws {
        let script = try RouteScript()
            .on(createRoute, fixture: "upload/posts-create__401-unauthorized.json")
            .on(refreshRoute, fixture: "auth/refresh__reauthentication-required.json")
        let sut = try UploadSUT(script: script)
        do {
            _ = try await sut.create()
            Issue.record("401이 나야 한다")
        } catch APIError.http(let status, _, _) {
            #expect(status == 401)
        }
        #expect(await sut.events.count == 1)
    }

    @Test("TC-UPL-069 TC-UPL-070 TC-UPL-071 생성 타임아웃·연결 끊김은 자동 재전송 없이 APIError.network이다(복구는 호출 측의 today 확인)", arguments: [
        TransportError.timeout, .notConnected,
    ])
    func createTimeoutIsNotRetried(failure: TransportError) async throws {
        let sut = try UploadSUT(script: RouteScript().fail(createRoute, failure))
        await #expect(throws: APIError.network) { try await sut.create() }
        #expect(await sut.transport.count(of: createRoute) == 1)
        #expect(sut.clock.recordedSleeps.isEmpty)
    }

    // MARK: 토큰 만료와 인증 헤더

    @Test("TC-UPL-076 정책 발급 후 5분이 지나 액세스 토큰이 만료되면 만료 토큰은 붙이지 않고 갱신 뒤 재전송하며 PUT에는 Authorization이 없다")
    func expiredTokenAcrossSteps() async throws {
        let shortLived = makeSession()
        let expiringSession = AuthSession(
            userId: shortLived.userId, accessToken: "old-access", accessTokenExpiresAt: t0.addingTimeInterval(60),
            refreshToken: "old-refresh", refreshTokenExpiresAt: t0.addingTimeInterval(86_400)
        )
        let script = try RouteScript()
            .on(issueRoute, fixtures: ["upload/posts-uploads__401-unauthorized.json", "upload/posts-uploads__issued.json"])
            .on(putRoute1, fixture: "upload/s3-put__200.json")
            .on(createRoute, fixtures: ["upload/posts-create__401-unauthorized.json", "upload/posts-create__201-pending.json"])
            .on(refreshRoute, fixture: "auth/refresh__success.json")
        let sut = try UploadSUT(script: script, session: expiringSession)
        sut.clock.advance(by: .seconds(300))
        let policy = try await sut.repository.issueUpload()
        let firstIssue = try #require(await sut.transport.requests(key: issueRoute).first)
        #expect(firstIssue.header("Authorization") == nil)
        try await sut.repository.uploadImage(testWebP, policy: policy)
        let created = try await sut.create()
        #expect(created.postId == postIdPending)
        let put = try #require(await sut.transport.requests(key: putRoute1).first)
        #expect(put.header("Authorization") == nil)
        #expect(await sut.transport.count(of: issueRoute) == 2)
        #expect(await sut.transport.count(of: createRoute) == 2)
        let tokens = await sut.transport.requests(key: createRoute).map { $0.header("Authorization") }
        #expect(tokens.last == "Bearer fixture-access-token-2")
    }
}
