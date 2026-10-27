import Foundation
import Testing
import ChalkakCore
import ChalkakTestSupport

/// `shared/`의 공용 자산과 Core 구현이 같은 값인지 대조한다. 값이 어긋나면 어느 쪽이 맞는지는 shared가 기준이다.
@Suite("공용 자산 대조")
struct SharedContractTests {
    static func constants() throws -> [String: Any] { try SharedConstants.object() }

    static func int(_ c: [String: Any], _ key: String) throws -> Int {
        try #require(c[key] as? Int, "constants.json에 정수 \(key) 없음")
    }

    static func string(_ c: [String: Any], _ key: String) throws -> String {
        try #require(c[key] as? String, "constants.json에 문자열 \(key) 없음")
    }

    static func millis(_ d: Duration) -> Int {
        let parts = d.components
        return Int(parts.seconds) * 1000 + Int(parts.attoseconds / 1_000_000_000_000_000)
    }

    // MARK: AppConstants

    @Test("서비스 시간대·최초 전시일·입력 제한이 constants.json과 같다")
    func timeAndLimits() throws {
        let c = try Self.constants()
        #expect(AppConstants.serviceTimeZoneIdentifier == (try Self.string(c, "SERVICE_TIME_ZONE")))
        #expect(AppConstants.firstTopicDate.string == (try Self.string(c, "FIRST_TOPIC_DATE")))
        #expect(AppConstants.postTitleMax == (try Self.int(c, "POST_TITLE_MAX")))
        #expect(AppConstants.feedbackMin == (try Self.int(c, "FEEDBACK_MIN")))
        #expect(AppConstants.feedbackMax == (try Self.int(c, "FEEDBACK_MAX")))
    }

    @Test("게시 이미지·사인 정책이 constants.json과 같다")
    func imageAndSignature() throws {
        let c = try Self.constants()
        #expect(AppConstants.postImageContentType == (try Self.string(c, "POST_IMAGE_CONTENT_TYPE")))
        #expect(AppConstants.postImageMaxBytes == (try Self.int(c, "POST_IMAGE_MAX_BYTES")))
        #expect(AppConstants.postImageMaxLongEdge == (try Self.int(c, "POST_IMAGE_MAX_LONG_EDGE")))
        #expect(AppConstants.webpQualityLadder == (try #require(c["WEBP_QUALITY_LADDER"] as? [Int])))
        #expect(AppConstants.webpDownscaleFactor == (try #require(c["WEBP_DOWNSCALE_FACTOR"] as? Double)))
        #expect(AppConstants.webpMaxDownscaleAttempts == (try Self.int(c, "WEBP_DOWNSCALE_MAX_ATTEMPTS")))
        #expect(Self.millis(AppConstants.uploadURLSafetyMargin) == (try Self.int(c, "UPLOAD_URL_SAFETY_MARGIN_MS")))
        #expect(Self.millis(AppConstants.uploadIdClaimTTL) == (try Self.int(c, "UPLOAD_ID_CLAIM_TTL_MS")))

        let size = try #require(c["SIGNATURE_PNG_SIZE"] as? [String: Int])
        #expect(AppConstants.signatureWidth == size["width"])
        #expect(AppConstants.signatureHeight == size["height"])
        #expect(AppConstants.signaturePadding == size["padding"])
        #expect(AppConstants.signatureStrokeWidth == size["strokeWidth"])
        #expect(AppConstants.signatureMaxBytes == (try Self.int(c, "SIGNATURE_MAX_BYTES")))
        #expect(try Self.string(c, "SIGNATURE_CONTENT_TYPE") == "image/png")
    }

    @Test("재시도·폴링·페이지·UI·네트워크 시간이 constants.json과 같다")
    func timingAndPaging() throws {
        let c = try Self.constants()
        #expect(Self.millis(AppConstants.signupPendingRetryInterval) == (try Self.int(c, "SIGNUP_PENDING_RETRY_INTERVAL_MS")))
        #expect(AppConstants.signupPendingRetryMaxAttempts == (try Self.int(c, "SIGNUP_PENDING_RETRY_MAX")))
        #expect(Self.millis(AppConstants.aiReviewPollInterval) == (try Self.int(c, "AI_REVIEW_POLL_INTERVAL_MS")))
        #expect(Self.millis(AppConstants.aiReviewPollWindow) == (try Self.int(c, "AI_REVIEW_POLL_WINDOW_MS")))
        #expect(AppConstants.pageSize == (try Self.int(c, "PAGE_SIZE")))
        #expect(AppConstants.bannerPageSize == (try Self.int(c, "BANNER_PAGE_SIZE")))
        #expect(Self.millis(AppConstants.toastDuration) == (try Self.int(c, "TOAST_DURATION_MS")))
        #expect(Self.millis(AppConstants.splashPreloadMax) == (try Self.int(c, "SPLASH_PRELOAD_MAX_MS")))
        #expect(Self.millis(AppConstants.httpConnectTimeout) == (try Self.int(c, "HTTP_CONNECT_TIMEOUT_MS")))
        #expect(Self.millis(AppConstants.httpResponseTimeout) == (try Self.int(c, "HTTP_RESPONSE_TIMEOUT_MS")))
        #expect(Self.millis(AppConstants.uploadPutTimeout) == (try Self.int(c, "UPLOAD_PUT_TIMEOUT_MS")))
        #expect(AppConstants.retryBackoff.map(Self.millis) == (try #require(c["RETRY_BACKOFF_MS"] as? [Int])))
        #expect(AppConstants.retryMax == (try Self.int(c, "RETRY_MAX")))
        #expect(Self.millis(AppConstants.versionLookupTimeout) == (try Self.int(c, "VERSION_LOOKUP_TIMEOUT_MS")))
    }

    @Test("약관 허용 호스트와 URL이 constants.json과 같다")
    func terms() throws {
        let c = try Self.constants()
        #expect(AppConstants.termsAllowedHosts == (try #require(c["TERMS_ALLOWED_HOSTS"] as? [String])))
        let urls = try #require(c["TERMS_URLS"] as? [String: String])
        #expect(AppConstants.termsServiceURLString == urls["service"])
        #expect(AppConstants.termsPrivacyURLString == urls["privacy"])
        for text in urls.values {
            let host = try #require(URL(string: text)?.host)
            #expect(AppConstants.termsAllowedHosts.contains { host == $0 || host.hasSuffix("." + $0) })
        }
    }

    @Test("constants.json의 모든 키는 대조 대상이다(새 키가 생기면 이 목록과 위 테스트를 함께 고친다)")
    func noUncoveredKeys() throws {
        let covered: Set<String> = [
            "SERVICE_TIME_ZONE", "FIRST_TOPIC_DATE", "POST_TITLE_MAX", "FEEDBACK_MIN", "FEEDBACK_MAX",
            "POST_IMAGE_CONTENT_TYPE", "POST_IMAGE_MAX_BYTES", "POST_IMAGE_MAX_LONG_EDGE", "WEBP_QUALITY_LADDER",
            "WEBP_DOWNSCALE_FACTOR", "WEBP_DOWNSCALE_MAX_ATTEMPTS", "UPLOAD_URL_SAFETY_MARGIN_MS", "UPLOAD_ID_CLAIM_TTL_MS",
            "SIGNATURE_PNG_SIZE", "SIGNATURE_CONTENT_TYPE", "SIGNATURE_MAX_BYTES",
            "SIGNUP_PENDING_RETRY_INTERVAL_MS", "SIGNUP_PENDING_RETRY_MAX", "AI_REVIEW_POLL_INTERVAL_MS", "AI_REVIEW_POLL_WINDOW_MS",
            "PAGE_SIZE", "BANNER_PAGE_SIZE", "TOAST_DURATION_MS", "SPLASH_PRELOAD_MAX_MS",
            "HTTP_CONNECT_TIMEOUT_MS", "HTTP_RESPONSE_TIMEOUT_MS", "UPLOAD_PUT_TIMEOUT_MS", "RETRY_BACKOFF_MS", "RETRY_MAX",
            "VERSION_LOOKUP_TIMEOUT_MS", "TERMS_ALLOWED_HOSTS", "TERMS_URLS",
            "ANALYTICS_SCREEN_NAMES", "ANALYTICS_TAB_DESTINATIONS", "FIXTURE_NOW",
        ]
        #expect(Set(try Self.constants().keys).subtracting(covered).isEmpty)
    }

    // MARK: 분석 화면 이름 (TC-ANL-002, TC-ANL-023)

    @Test("TC-ANL-002 AnalyticsScreen이 constants.json의 화면 이름 19종과 순서까지 같다")
    func screenNamesMatchConstants() throws {
        let expected = try #require(try Self.constants()["ANALYTICS_SCREEN_NAMES"] as? [String])
        #expect(expected.count == 19)
        #expect(AnalyticsScreen.allCases.map(\.rawValue) == expected)
    }

    @Test("TC-ANL-002 TC-ANL-023 anl/events__expected-screen-names fixture와 constants.json·AnalyticsScreen이 같다")
    func screenNamesMatchFixture() throws {
        let fixture = try Fixture.load("anl/events__expected-screen-names.json")
        #expect(fixture.kind == "case")
        #expect(fixture.stringCases == AnalyticsScreen.allCases.map(\.rawValue))
        #expect(fixture.stringCases == (try #require(try Self.constants()["ANALYTICS_SCREEN_NAMES"] as? [String])))
    }

    @Test("TC-ANL-013 탭 destination이 constants.json과 같다")
    func tabDestinationsMatchConstants() throws {
        let expected = try #require(try Self.constants()["ANALYTICS_TAB_DESTINATIONS"] as? [String])
        #expect(AnalyticsDestination.allCases.map(\.rawValue) == expected)
    }

    // MARK: 시각 (TC-TIME-025/026 fixture 버전)

    @Test("TC-TIME-025 instants__variants 모든 변형이 같은 순간으로 파싱된다")
    func instantVariantsFromFixture() throws {
        let fixture = try Fixture.load("time/instants__variants.json")
        let object = try fixture.object()
        let expected = try #require(object["expectedInstant"] as? String)
        let epochMillis = try #require((object["expectedEpochMillis"] as? NSNumber)?.int64Value)
        let base = try #require(Instant.parse(expected))
        #expect(Int64((base.timeIntervalSince1970 * 1000).rounded()) == epochMillis)
        #expect(!fixture.stringCases.isEmpty)
        for text in fixture.stringCases {
            let parsed = try #require(Instant.parse(text), "파싱 실패: \(text)")
            #expect(parsed == base, "\(text)")
        }
    }

    @Test("TC-TIME-026 instants__invalid 입력은 모두 크래시 없이 nil이다")
    func invalidInstantsFromFixture() throws {
        let fixture = try Fixture.load("time/instants__invalid.json")
        #expect(!fixture.stringCases.isEmpty)
        for text in fixture.stringCases {
            #expect(Instant.parse(text) == nil, "nil이어야 함: \(text)")
        }
    }

    @Test("FIXTURE_NOW는 KST 2026-10-27 정오다")
    func fixtureNow() throws {
        let text = try Self.string(try Self.constants(), "FIXTURE_NOW")
        let now = try #require(Instant.parse(text))
        #expect(KST.date(of: now).string == "2026-10-27")
        #expect(KST.notificationTimestamp(now) == "10월 27일 12:00")
    }
}
