package kr.chalkak.core.common

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kr.chalkak.core.common.testing.Fixtures
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals

/** `AppConstants` must equal `shared/constants.json` (overview §6). FIXTURE_NOW is test-only and not a constant. */
class AppConstantsTest {
    private val json: JsonObject = Fixtures.constants()

    private fun str(key: String) = json.getValue(key).jsonPrimitive.content
    private fun int(key: String) = json.getValue(key).jsonPrimitive.int
    private fun long(key: String) = json.getValue(key).jsonPrimitive.long
    private fun strings(key: String) = json.getValue(key).jsonArray.map { it.jsonPrimitive.content }
    private fun longs(key: String) = json.getValue(key).jsonArray.map { it.jsonPrimitive.long }

    /** Every JSON key except FIXTURE_NOW, mapped to the value exposed by AppConstants. */
    private fun actual(): Map<String, Any> = mapOf(
        "SERVICE_TIME_ZONE" to AppConstants.SERVICE_TIME_ZONE,
        "FIRST_TOPIC_DATE" to AppConstants.FIRST_TOPIC_DATE,
        "POST_TITLE_MAX" to AppConstants.POST_TITLE_MAX,
        "FEEDBACK_MIN" to AppConstants.FEEDBACK_MIN,
        "FEEDBACK_MAX" to AppConstants.FEEDBACK_MAX,
        "POST_IMAGE_CONTENT_TYPE" to AppConstants.POST_IMAGE_CONTENT_TYPE,
        "POST_IMAGE_MAX_BYTES" to AppConstants.POST_IMAGE_MAX_BYTES,
        "POST_IMAGE_MAX_LONG_EDGE" to AppConstants.POST_IMAGE_MAX_LONG_EDGE,
        "WEBP_QUALITY_LADDER" to AppConstants.WEBP_QUALITY_LADDER,
        "WEBP_DOWNSCALE_FACTOR" to AppConstants.WEBP_DOWNSCALE_FACTOR,
        "WEBP_DOWNSCALE_MAX_ATTEMPTS" to AppConstants.WEBP_DOWNSCALE_MAX_ATTEMPTS,
        "UPLOAD_URL_SAFETY_MARGIN_MS" to AppConstants.UPLOAD_URL_SAFETY_MARGIN_MS,
        "UPLOAD_ID_CLAIM_TTL_MS" to AppConstants.UPLOAD_ID_CLAIM_TTL_MS,
        "SIGNATURE_PNG_SIZE" to AppConstants.SIGNATURE_PNG_SIZE,
        "SIGNATURE_CONTENT_TYPE" to AppConstants.SIGNATURE_CONTENT_TYPE,
        "SIGNATURE_MAX_BYTES" to AppConstants.SIGNATURE_MAX_BYTES,
        "SIGNUP_PENDING_RETRY_INTERVAL_MS" to AppConstants.SIGNUP_PENDING_RETRY_INTERVAL_MS,
        "SIGNUP_PENDING_RETRY_MAX" to AppConstants.SIGNUP_PENDING_RETRY_MAX,
        "AI_REVIEW_POLL_INTERVAL_MS" to AppConstants.AI_REVIEW_POLL_INTERVAL_MS,
        "AI_REVIEW_POLL_WINDOW_MS" to AppConstants.AI_REVIEW_POLL_WINDOW_MS,
        "PAGE_SIZE" to AppConstants.PAGE_SIZE,
        "BANNER_PAGE_SIZE" to AppConstants.BANNER_PAGE_SIZE,
        "TOAST_DURATION_MS" to AppConstants.TOAST_DURATION_MS,
        "SPLASH_PRELOAD_MAX_MS" to AppConstants.SPLASH_PRELOAD_MAX_MS,
        "HTTP_CONNECT_TIMEOUT_MS" to AppConstants.HTTP_CONNECT_TIMEOUT_MS,
        "HTTP_RESPONSE_TIMEOUT_MS" to AppConstants.HTTP_RESPONSE_TIMEOUT_MS,
        "UPLOAD_PUT_TIMEOUT_MS" to AppConstants.UPLOAD_PUT_TIMEOUT_MS,
        "RETRY_BACKOFF_MS" to AppConstants.RETRY_BACKOFF_MS,
        "RETRY_MAX" to AppConstants.RETRY_MAX,
        "RETRY_AFTER_MAX_MS" to AppConstants.RETRY_AFTER_MAX_MS,
        "VERSION_LOOKUP_TIMEOUT_MS" to AppConstants.VERSION_LOOKUP_TIMEOUT_MS,
        "TERMS_ALLOWED_HOSTS" to AppConstants.TERMS_ALLOWED_HOSTS,
        "TERMS_URLS" to AppConstants.TERMS_URLS,
        "ANALYTICS_SCREEN_NAMES" to AppConstants.ANALYTICS_SCREEN_NAMES,
        "ANALYTICS_TAB_DESTINATIONS" to AppConstants.ANALYTICS_TAB_DESTINATIONS,
    )

    @Test
    fun `AppConstants는 constants json의 모든 키를 빠짐없이 가진다`() {
        assertEquals(json.keys - "FIXTURE_NOW", actual().keys)
    }

    @Test
    fun `AppConstants 시간 관련 값이 constants json과 같다`() {
        assertEquals(ZoneId.of(str("SERVICE_TIME_ZONE")), AppConstants.SERVICE_TIME_ZONE)
        assertEquals(LocalDate.parse(str("FIRST_TOPIC_DATE")), AppConstants.FIRST_TOPIC_DATE)
        assertEquals(LocalDate.of(2026, 9, 17), AppConstants.FIRST_TOPIC_DATE)
        assertEquals(long("UPLOAD_URL_SAFETY_MARGIN_MS"), AppConstants.UPLOAD_URL_SAFETY_MARGIN_MS)
        assertEquals(long("UPLOAD_ID_CLAIM_TTL_MS"), AppConstants.UPLOAD_ID_CLAIM_TTL_MS)
        assertEquals(long("TOAST_DURATION_MS"), AppConstants.TOAST_DURATION_MS)
        assertEquals(long("SPLASH_PRELOAD_MAX_MS"), AppConstants.SPLASH_PRELOAD_MAX_MS)
        assertEquals(long("AI_REVIEW_POLL_INTERVAL_MS"), AppConstants.AI_REVIEW_POLL_INTERVAL_MS)
        assertEquals(long("AI_REVIEW_POLL_WINDOW_MS"), AppConstants.AI_REVIEW_POLL_WINDOW_MS)
        assertEquals(long("SIGNUP_PENDING_RETRY_INTERVAL_MS"), AppConstants.SIGNUP_PENDING_RETRY_INTERVAL_MS)
    }

    @Test
    fun `AppConstants 입력 제한과 이미지 정책 값이 constants json과 같다`() {
        assertEquals(int("POST_TITLE_MAX"), AppConstants.POST_TITLE_MAX)
        assertEquals(10, AppConstants.POST_TITLE_MAX)
        assertEquals(int("FEEDBACK_MIN"), AppConstants.FEEDBACK_MIN)
        assertEquals(int("FEEDBACK_MAX"), AppConstants.FEEDBACK_MAX)
        assertEquals(str("POST_IMAGE_CONTENT_TYPE"), AppConstants.POST_IMAGE_CONTENT_TYPE)
        assertEquals(long("POST_IMAGE_MAX_BYTES"), AppConstants.POST_IMAGE_MAX_BYTES)
        assertEquals(int("POST_IMAGE_MAX_LONG_EDGE"), AppConstants.POST_IMAGE_MAX_LONG_EDGE)
        assertEquals(json.getValue("WEBP_QUALITY_LADDER").jsonArray.map { it.jsonPrimitive.int }, AppConstants.WEBP_QUALITY_LADDER)
        assertEquals(json.getValue("WEBP_DOWNSCALE_FACTOR").jsonPrimitive.double, AppConstants.WEBP_DOWNSCALE_FACTOR)
        assertEquals(int("WEBP_DOWNSCALE_MAX_ATTEMPTS"), AppConstants.WEBP_DOWNSCALE_MAX_ATTEMPTS)
        assertEquals(str("SIGNATURE_CONTENT_TYPE"), AppConstants.SIGNATURE_CONTENT_TYPE)
        assertEquals(long("SIGNATURE_MAX_BYTES"), AppConstants.SIGNATURE_MAX_BYTES)
        val size = json.getValue("SIGNATURE_PNG_SIZE").jsonObject
        assertEquals(
            SignaturePngSize(
                width = size.getValue("width").jsonPrimitive.int,
                height = size.getValue("height").jsonPrimitive.int,
                padding = size.getValue("padding").jsonPrimitive.int,
                strokeWidth = size.getValue("strokeWidth").jsonPrimitive.int,
            ),
            AppConstants.SIGNATURE_PNG_SIZE,
        )
        assertEquals(int("SIGNUP_PENDING_RETRY_MAX"), AppConstants.SIGNUP_PENDING_RETRY_MAX)
        assertEquals(int("PAGE_SIZE"), AppConstants.PAGE_SIZE)
        assertEquals(int("BANNER_PAGE_SIZE"), AppConstants.BANNER_PAGE_SIZE)
    }

    @Test
    fun `AppConstants 네트워크 정책 값이 constants json과 같다`() {
        assertEquals(long("HTTP_CONNECT_TIMEOUT_MS"), AppConstants.HTTP_CONNECT_TIMEOUT_MS)
        assertEquals(long("HTTP_RESPONSE_TIMEOUT_MS"), AppConstants.HTTP_RESPONSE_TIMEOUT_MS)
        assertEquals(long("UPLOAD_PUT_TIMEOUT_MS"), AppConstants.UPLOAD_PUT_TIMEOUT_MS)
        assertEquals(longs("RETRY_BACKOFF_MS"), AppConstants.RETRY_BACKOFF_MS)
        assertEquals(int("RETRY_MAX"), AppConstants.RETRY_MAX)
        assertEquals(long("RETRY_AFTER_MAX_MS"), AppConstants.RETRY_AFTER_MAX_MS)
        assertEquals(long("VERSION_LOOKUP_TIMEOUT_MS"), AppConstants.VERSION_LOOKUP_TIMEOUT_MS)
    }

    @Test
    fun `AppConstants 약관과 분석 상수가 constants json과 같다`() {
        assertEquals(strings("TERMS_ALLOWED_HOSTS"), AppConstants.TERMS_ALLOWED_HOSTS)
        val urls = json.getValue("TERMS_URLS").jsonObject.mapValues { (_, v: JsonElement) -> (v as JsonPrimitive).content }
        assertEquals(urls, AppConstants.TERMS_URLS)
        assertEquals(strings("ANALYTICS_SCREEN_NAMES"), AppConstants.ANALYTICS_SCREEN_NAMES)
        assertEquals(strings("ANALYTICS_TAB_DESTINATIONS"), AppConstants.ANALYTICS_TAB_DESTINATIONS)
        assertEquals(19, (json.getValue("ANALYTICS_SCREEN_NAMES") as JsonArray).size)
    }
}
