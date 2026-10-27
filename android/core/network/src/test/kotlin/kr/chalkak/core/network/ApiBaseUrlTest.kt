package kr.chalkak.core.network

import okhttp3.HttpUrl.Companion.toHttpUrl
import java.time.LocalDate
import java.util.Locale
import java.util.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

// Deferred (not unit/contract-testable in :core:network), target module:
//  TC-NET-046 (:feature:* StateHolder: keep content + toast on refresh failure)
//  TC-NET-047 (:feature:* StateHolder error state + retry; E2E part by mock server)
//  TC-NET-056 (:core:data or shared stale-response guard)
//  TC-NET-059, TC-NET-060 (E2E, mock server + emulator)
//  TC-NET-061 (agent scenario), TC-NET-062 (Web only)
//  TC-NET-036 copy mapping "common.error.generic" -> :feature:*; here only the 500 classification is asserted.

class ApiBaseUrlTest {
    private fun valid(raw: String?): ApiBaseUrl = assertIs<ApiBaseUrlResult.Valid>(ApiBaseUrl.parse(raw)).baseUrl
    private fun invalid(raw: String?): ConfigError = assertIs<ApiBaseUrlResult.Invalid>(ApiBaseUrl.parse(raw)).reason

    @Test
    fun `TC-NET-050 https origin is accepted`() {
        assertEquals("https://chalkak-dev.pysun.kr/", valid("https://chalkak-dev.pysun.kr").origin.toString())
    }

    @Test
    fun `TC-NET-050 http on a non loopback host is rejected as a config error`() {
        assertEquals(ConfigError.INSECURE_HTTP, invalid("http://chalkak-dev.pysun.kr"))
        assertEquals(ConfigError.INSECURE_HTTP, invalid("http://192.168.0.10:4010"))
    }

    @Test
    fun `TC-NET-050 http is allowed only for loopback hosts localhost 127-0-0-1 and 10-0-2-2`() {
        listOf("http://localhost:4010", "http://127.0.0.1:4010", "http://10.0.2.2:4010").forEach {
            assertIs<ApiBaseUrlResult.Valid>(ApiBaseUrl.parse(it), it)
        }
    }

    @Test
    fun `TC-NET-050 null blank or malformed values are config errors with no fallback`() {
        assertEquals(ConfigError.MISSING, invalid(null))
        assertEquals(ConfigError.MISSING, invalid(""))
        assertEquals(ConfigError.MISSING, invalid("   "))
        assertEquals(ConfigError.MALFORMED, invalid("not a url"))
        assertEquals(ConfigError.MALFORMED, invalid("ftp://chalkak-dev.pysun.kr"))
    }

    @Test
    fun `TC-NET-050 isAllowedUrl applies the same rule to presigned upload urls`() {
        fun url(s: String) = s.toHttpUrl()
        assertTrue(ApiBaseUrl.isAllowedUrl(url("https://bucket.s3.amazonaws.com/x?X-Amz-Expires=300")))
        assertTrue(ApiBaseUrl.isAllowedUrl(url("http://10.0.2.2:4010/__upload/1")))
        assertFalse(ApiBaseUrl.isAllowedUrl(url("http://bucket.example.com/x")))
    }

    @Test
    fun `REQ-NET-003 client appends api v1 to the origin`() {
        assertEquals("https://chalkak-dev.pysun.kr/api/v1/posts/today", valid("https://chalkak-dev.pysun.kr").apiUrl("/posts/today").toString())
        assertEquals("https://chalkak-dev.pysun.kr/api/v1/topics", valid("https://chalkak-dev.pysun.kr/").apiUrl("/topics").toString())
    }

    @Test
    fun `REQ-NET-003 an origin that already contains a path is rejected`() {
        assertEquals(ConfigError.UNEXPECTED_PATH, invalid("https://chalkak-dev.pysun.kr/api/v1/"))
    }

    @Test
    fun `TC-NET-053 apiUrl percent-encodes query values and keeps order`() {
        val url = valid("https://h.example").apiUrl("/posts", listOf("topicDate" to "2026-10-27", "sort" to "latest", "q" to "a b&c"))
        assertEquals("https://h.example/api/v1/posts?topicDate=2026-10-27&sort=latest&q=a%20b%26c", url.toString())
    }

    @Test
    fun `TC-NET-053 date and ints are ASCII even under an Arabic or Thai locale`() {
        val oldLocale = Locale.getDefault()
        val oldZone = TimeZone.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("ar-SA-u-nu-arab"))
            TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Kiritimati"))
            assertEquals("2026-10-27", QueryValues.date(LocalDate.of(2026, 10, 27)))
            assertEquals("1234567", QueryValues.int(1_234_567))
            Locale.setDefault(Locale.forLanguageTag("th-TH-u-ca-buddhist-nu-thai"))
            assertEquals("2026-10-27", QueryValues.date(LocalDate.of(2026, 10, 27)))
            assertEquals("20", QueryValues.int(20))
        } finally {
            Locale.setDefault(oldLocale)
            TimeZone.setDefault(oldZone)
        }
    }

    @Test
    fun `TC-NET-053 sort is lower case`() {
        assertEquals("latest", QueryValues.sort("LATEST"))
        assertEquals("popular", QueryValues.sort("Popular"))
    }

    @Test
    fun `TC-NET-052 uuid is sent in lower case canonical form`() {
        assertEquals("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", QueryValues.uuid("AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"))
        assertEquals("22222222-2222-4222-8222-222222222201", QueryValues.uuid("22222222-2222-4222-8222-222222222201"))
    }
}
