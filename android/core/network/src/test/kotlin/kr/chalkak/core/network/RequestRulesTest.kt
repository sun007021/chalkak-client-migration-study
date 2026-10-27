package kr.chalkak.core.network

import okhttp3.HttpUrl.Companion.toHttpUrl
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RequestRulesTest {
    @Test
    fun `TC-NET-031 GET banners never carries Authorization`() {
        assertTrue(RequestRules.neverSendsAuthorization(HttpMethod.GET, "/banners"))
    }

    @Test
    fun `REQ-NET-017 refresh logout and social endpoints never carry Authorization`() {
        listOf("/auth/refresh", "/auth/logout", "/auth/social-login", "/auth/social-signup", "/auth/social-signup/signature/uploads")
            .forEach { assertTrue(RequestRules.neverSendsAuthorization(HttpMethod.POST, it), it) }
    }

    @Test
    fun `REQ-NET-017 ordinary endpoints do carry Authorization when a valid session exists`() {
        listOf(HttpMethod.GET to "/posts/today", HttpMethod.GET to "/notifications", HttpMethod.PUT to "/posts/x/likes", HttpMethod.DELETE to "/users/me")
            .forEach { (m, p) -> assertFalse(RequestRules.neverSendsAuthorization(m, p), "$m $p") }
    }

    @Test
    fun `TC-NET-030 public GETs are posts list topics and banners only`() {
        assertTrue(RequestRules.isPublicGet(HttpMethod.GET, "/posts"))
        assertTrue(RequestRules.isPublicGet(HttpMethod.GET, "/topics"))
        assertTrue(RequestRules.isPublicGet(HttpMethod.GET, "/banners"))
        assertFalse(RequestRules.isPublicGet(HttpMethod.GET, "/posts/today"))
        assertFalse(RequestRules.isPublicGet(HttpMethod.GET, "/posts/22222222-2222-4222-8222-222222222201"))
        assertFalse(RequestRules.isPublicGet(HttpMethod.POST, "/posts"))
        assertFalse(RequestRules.isPublicGet(HttpMethod.GET, "/posts/calendar"))
    }

    @Test
    fun `TC-NET-051 plain http to a non loopback host never gets Authorization`() {
        assertFalse(RequestRules.canAttachAuthorization("http://chalkak-dev.pysun.kr/api/v1/posts".toHttpUrl()))
        assertFalse(RequestRules.canAttachAuthorization("http://192.168.0.5:8080/api/v1/posts".toHttpUrl()))
    }

    @Test
    fun `TC-NET-051 https and loopback http (mock server) may carry Authorization`() {
        assertTrue(RequestRules.canAttachAuthorization("https://chalkak-dev.pysun.kr/api/v1/posts".toHttpUrl()))
        assertTrue(RequestRules.canAttachAuthorization("http://localhost:4010/api/v1/posts".toHttpUrl()))
        assertTrue(RequestRules.canAttachAuthorization("http://10.0.2.2:4010/api/v1/posts".toHttpUrl()))
    }
}
