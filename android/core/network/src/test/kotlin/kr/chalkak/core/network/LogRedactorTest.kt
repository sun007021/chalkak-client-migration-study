package kr.chalkak.core.network

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LogRedactorTest {
    @Test
    fun `TC-NET-055 bearer tokens are masked`() {
        val out = LogRedactor.redact("--> GET /posts/today Authorization: Bearer eyJhbGciOi.secret.sig")
        assertFalse(out.contains("eyJhbGciOi"))
        assertTrue(out.contains("/posts/today"))
    }

    @Test
    fun `TC-NET-055 json secret fields are masked`() {
        val body = """{"accessToken":"AT-123","refreshToken":"RT-456","idToken":"IDT-789","rawNonce":"NONCE-1","fcmToken":"FCM-2","signupToken":"SU-3","userId":"keep-me"}"""
        val out = LogRedactor.redact(body)
        listOf("AT-123", "RT-456", "IDT-789", "NONCE-1", "FCM-2", "SU-3").forEach { assertFalse(out.contains(it), it) }
        assertTrue(out.contains("keep-me"))
    }

    @Test
    fun `TC-NET-055 presigned url query strings are dropped but host and path remain`() {
        val out = LogRedactor.redact("PUT https://bucket.s3.amazonaws.com/posts/1/original.webp?X-Amz-Signature=SIG123&X-Amz-Credential=CRED")
        assertFalse(out.contains("SIG123"))
        assertFalse(out.contains("CRED"))
        assertTrue(out.contains("bucket.s3.amazonaws.com/posts/1/original.webp"))
    }

    @Test
    fun `TC-NET-055 text without secrets is unchanged`() {
        val text = "GET /api/v1/topics -> 200 (12 ms)"
        kotlin.test.assertEquals(text, LogRedactor.redact(text))
    }
}
