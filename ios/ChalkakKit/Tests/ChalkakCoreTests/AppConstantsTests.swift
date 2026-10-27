import Testing
import ChalkakCore

@Suite("AppConstants (overview §6)")
struct AppConstantsTests {
    @Test("서비스 시간대와 최초 전시일")
    func timeConstants() {
        #expect(AppConstants.serviceTimeZoneIdentifier == "Asia/Seoul")
        #expect(AppConstants.firstTopicDate == KSTDate(year: 2026, month: 9, day: 17))
        #expect(AppConstants.firstTopicDate.string == "2026-09-17")
    }

    @Test("입력 길이 제한")
    func lengthLimits() {
        #expect(AppConstants.postTitleMax == 10)
        #expect(AppConstants.feedbackMin == 1)
        #expect(AppConstants.feedbackMax == 1000)
    }

    @Test("게시 이미지 정책")
    func imagePolicy() {
        #expect(AppConstants.postImageContentType == "image/webp")
        #expect(AppConstants.postImageMaxBytes == 5_242_880)
        #expect(AppConstants.postImageMaxLongEdge == 4096)
        #expect(AppConstants.webpQualityLadder == [90, 80, 60, 40])
        #expect(AppConstants.webpDownscaleFactor == 0.85)
        #expect(AppConstants.webpMaxDownscaleAttempts == 3)
        #expect(AppConstants.uploadURLSafetyMargin == .seconds(5))
    }

    @Test("사인 PNG")
    func signature() {
        #expect(AppConstants.signatureWidth == 1024)
        #expect(AppConstants.signatureHeight == 512)
        #expect(AppConstants.signaturePadding == 48)
        #expect(AppConstants.signatureStrokeWidth == 14)
        #expect(AppConstants.signatureMaxBytes == 1_048_576)
    }

    @Test("재시도·폴링 간격")
    func retryAndPolling() {
        #expect(AppConstants.signupPendingRetryInterval == .seconds(1))
        #expect(AppConstants.signupPendingRetryMaxAttempts == 10)
        #expect(AppConstants.aiReviewPollInterval == .seconds(3))
        #expect(AppConstants.aiReviewPollWindow == .seconds(300))
    }

    @Test("페이지 크기와 UI 시간")
    func pagingAndUI() {
        #expect(AppConstants.pageSize == 20)
        #expect(AppConstants.bannerPageSize == 10)
        #expect(AppConstants.toastDuration == .milliseconds(2500))
        #expect(AppConstants.splashPreloadMax == .milliseconds(700))
    }
}
