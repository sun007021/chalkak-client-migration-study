import Foundation

/// 다섯 클라이언트 공통 상수(overview §6). 코드에 값을 직접 쓰지 말고 여기서 읽는다.
public enum AppConstants {
    public static let serviceTimeZoneIdentifier = "Asia/Seoul"
    public static let firstTopicDate = KSTDate(year: 2026, month: 9, day: 17)!

    public static let postTitleMax = 10
    public static let feedbackMin = 1
    public static let feedbackMax = 1000

    public static let postImageContentType = "image/webp"
    public static let postImageMaxBytes = 5_242_880
    public static let postImageMaxLongEdge = 4096
    public static let webpQualityLadder: [Int] = [90, 80, 60, 40]
    public static let webpDownscaleFactor = 0.85
    public static let webpMaxDownscaleAttempts = 3
    public static let uploadURLSafetyMargin = Duration.seconds(5)

    public static let signatureWidth = 1024
    public static let signatureHeight = 512
    public static let signaturePadding = 48
    public static let signatureStrokeWidth = 14
    public static let signatureMaxBytes = 1_048_576

    public static let signupPendingRetryInterval = Duration.seconds(1)
    public static let signupPendingRetryMaxAttempts = 10
    public static let aiReviewPollInterval = Duration.seconds(3)
    public static let aiReviewPollWindow = Duration.seconds(300)

    public static let pageSize = 20
    public static let bannerPageSize = 10
    public static let toastDuration = Duration.milliseconds(2500)
    public static let splashPreloadMax = Duration.milliseconds(700)

    // 네트워크·재시도·약관(shared/constants.json과 값이 같아야 한다 — SharedContractTests가 대조한다)
    public static let httpConnectTimeout = Duration.seconds(10)
    public static let httpResponseTimeout = Duration.seconds(15)
    public static let uploadPutTimeout = Duration.seconds(60)
    public static let retryBackoff: [Duration] = [.milliseconds(500), .milliseconds(1000)]
    public static let retryMax = 2
    public static let versionLookupTimeout = Duration.seconds(3)
    public static let uploadIdClaimTTL = Duration.seconds(3600)
    public static let termsAllowedHosts: [String] = ["notion.com", "notion.so", "notion.site"]
    public static let termsServiceURLString = "https://app.notion.com/p/3c66b8e8e3678064b543c26b5c0f932d?source=copy_link"
    public static let termsPrivacyURLString = "https://app.notion.com/p/3b56b8e8e36780af8ec8ea0bf92b97a9?source=copy_link"
}
