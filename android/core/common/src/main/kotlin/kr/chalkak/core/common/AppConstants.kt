package kr.chalkak.core.common

import java.time.LocalDate
import java.time.ZoneId

data class SignaturePngSize(val width: Int, val height: Int, val padding: Int, val strokeWidth: Int)

/** Mirrors `shared/constants.json` (verified by a test). The only place constants live. */
object AppConstants {
    val SERVICE_TIME_ZONE: ZoneId = ZoneId.of("Asia/Seoul")
    val FIRST_TOPIC_DATE: LocalDate = LocalDate.of(2026, 9, 17)
    const val POST_TITLE_MAX: Int = 10
    const val FEEDBACK_MIN: Int = 1
    const val FEEDBACK_MAX: Int = 1000
    const val POST_IMAGE_CONTENT_TYPE: String = "image/webp"
    const val POST_IMAGE_MAX_BYTES: Long = 5_242_880L
    const val POST_IMAGE_MAX_LONG_EDGE: Int = 4096
    val WEBP_QUALITY_LADDER: List<Int> = listOf(90, 80, 60, 40)
    const val WEBP_DOWNSCALE_FACTOR: Double = 0.85
    const val WEBP_DOWNSCALE_MAX_ATTEMPTS: Int = 3
    const val UPLOAD_URL_SAFETY_MARGIN_MS: Long = 5_000L
    const val UPLOAD_ID_CLAIM_TTL_MS: Long = 3_600_000L
    val SIGNATURE_PNG_SIZE: SignaturePngSize = SignaturePngSize(width = 1024, height = 512, padding = 48, strokeWidth = 14)
    const val SIGNATURE_CONTENT_TYPE: String = "image/png"
    const val SIGNATURE_MAX_BYTES: Long = 1_048_576L
    const val SIGNUP_PENDING_RETRY_INTERVAL_MS: Long = 1_000L
    const val SIGNUP_PENDING_RETRY_MAX: Int = 10
    const val AI_REVIEW_POLL_INTERVAL_MS: Long = 3_000L
    const val AI_REVIEW_POLL_WINDOW_MS: Long = 300_000L
    const val PAGE_SIZE: Int = 20
    const val BANNER_PAGE_SIZE: Int = 10
    const val TOAST_DURATION_MS: Long = 2_500L
    const val SPLASH_PRELOAD_MAX_MS: Long = 700L
    const val HTTP_CONNECT_TIMEOUT_MS: Long = 10_000L
    const val HTTP_RESPONSE_TIMEOUT_MS: Long = 15_000L
    const val UPLOAD_PUT_TIMEOUT_MS: Long = 60_000L
    val RETRY_BACKOFF_MS: List<Long> = listOf(500L, 1_000L)
    const val RETRY_MAX: Int = 2
    /** D-21 temporary cap for a server `Retry-After`. */
    const val RETRY_AFTER_MAX_MS: Long = 30_000L
    const val VERSION_LOOKUP_TIMEOUT_MS: Long = 3_000L
    val TERMS_ALLOWED_HOSTS: List<String> = listOf("notion.com", "notion.so", "notion.site")
    val TERMS_URLS: Map<String, String> = mapOf(
        "service" to "https://app.notion.com/p/3c66b8e8e3678064b543c26b5c0f932d?source=copy_link",
        "privacy" to "https://app.notion.com/p/3b56b8e8e36780af8ec8ea0bf92b97a9?source=copy_link",
    )
    val ANALYTICS_SCREEN_NAMES: List<String> = listOf(
        "login", "terms", "terms_of_service", "privacy_policy", "onboarding_signature", "onboarding_signature_preview",
        "change_signature", "change_signature_preview", "home", "issue", "notifications", "notification_detail",
        "display", "feed", "record", "settings", "feedback", "photo_upload", "photo_upload_success",
    )
    val ANALYTICS_TAB_DESTINATIONS: List<String> = listOf("home", "display", "record", "settings")
}
