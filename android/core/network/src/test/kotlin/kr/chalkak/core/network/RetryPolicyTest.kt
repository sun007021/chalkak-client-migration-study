package kr.chalkak.core.network

import kr.chalkak.core.common.testing.FakeClock
import java.time.Duration
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RetryPolicyTest {
    private val policy = RetryPolicy()
    private val clock = FakeClock()
    private val now = clock.now()

    private fun decide(method: HttpMethod, path: String, status: Int?, done: Int = 0, retryAfter: String? = null) =
        policy.decide(method, path, AttemptResult(status, retryAfter), done, now)

    private fun httpDate(plusSeconds: Long): String =
        DateTimeFormatter.RFC_1123_DATE_TIME.format(now.plusSeconds(plusSeconds).atZone(ZoneOffset.UTC))

    @Test
    fun `TC-NET-037 idempotent methods retry 5xx with 500ms then 1000ms then give up after two retries`() {
        listOf(HttpMethod.GET to "/notifications", HttpMethod.PUT to "/posts/x/likes", HttpMethod.DELETE to "/posts/x", HttpMethod.PATCH to "/notifications/x").forEach { (m, p) ->
            assertEquals(RetryDecision.RetryAfter(500), decide(m, p, 500, 0), "$m $p #1")
            assertEquals(RetryDecision.RetryAfter(1000), decide(m, p, 500, 1), "$m $p #2")
            assertEquals(RetryDecision.GiveUp, decide(m, p, 500, 2), "$m $p #3")
        }
    }

    @Test
    fun `TC-NET-037 upload policy issuing posts are retryable`() {
        assertEquals(RetryDecision.RetryAfter(500), decide(HttpMethod.POST, "/posts/uploads", 503))
        assertEquals(RetryDecision.RetryAfter(500), decide(HttpMethod.POST, "/users/me/signature/uploads", null))
    }

    @Test
    fun `TC-NET-037 transport failures retry like 5xx`() {
        assertEquals(RetryDecision.RetryAfter(500), decide(HttpMethod.GET, "/topics", null))
        assertEquals(RetryDecision.RetryAfter(1000), decide(HttpMethod.GET, "/topics", null, 1))
    }

    @Test
    fun `TC-NET-038 non idempotent POST list never retries on transport failure or 5xx`() {
        val posts = listOf(
            "/posts", "/auth/refresh", "/feedbacks", "/posts/22222222-2222-4222-8222-222222222201/ai-review",
            "/auth/social-login", "/auth/social-signup/signature/uploads", "/auth/social-signup", "/auth/social-anything-new", "/auth/logout",
        )
        for (p in posts) {
            assertFalse(policy.isRetryable(HttpMethod.POST, p), p)
            assertEquals(RetryDecision.GiveUp, decide(HttpMethod.POST, p, null), "$p transport")
            assertEquals(RetryDecision.GiveUp, decide(HttpMethod.POST, p, 500), "$p 500")
            assertEquals(RetryDecision.GiveUp, decide(HttpMethod.POST, p, 503, retryAfter = "1"), "$p 503")
        }
    }

    @Test
    fun `TC-NET-038 retryable table covers methods and paths`() {
        assertTrue(policy.isRetryable(HttpMethod.GET, "/posts/today"))
        assertTrue(policy.isRetryable(HttpMethod.PUT, "/users/me/signature"))
        assertTrue(policy.isRetryable(HttpMethod.DELETE, "/users/me"))
        assertTrue(policy.isRetryable(HttpMethod.PATCH, "/notification-settings"))
        assertFalse(policy.isRetryable(HttpMethod.POST, "/posts/uploads/extra"))
    }

    @Test
    fun `TC-NET-039 idempotent request does not retry 400 403 404`() {
        listOf(400, 401, 403, 404).forEach { assertEquals(RetryDecision.GiveUp, decide(HttpMethod.GET, "/posts", it), "status $it") }
    }

    @Test
    fun `TC-NET-040 Retry-After seconds replaces the backoff`() {
        assertEquals(RetryDecision.RetryAfter(2000), decide(HttpMethod.GET, "/notifications/unread-status", 503, retryAfter = "2"))
        assertEquals(RetryDecision.RetryAfter(2000), decide(HttpMethod.GET, "/notifications/unread-status", 429, retryAfter = "2"))
    }

    @Test
    fun `TC-NET-040 Retry-After as a future http date is converted using the clock`() {
        assertEquals(3000L, policy.parseRetryAfterMs(httpDate(3), now))
        assertEquals(RetryDecision.RetryAfter(3000), decide(HttpMethod.GET, "/topics", 503, retryAfter = httpDate(3)))
    }

    @Test
    fun `TC-NET-040 429 retries on idempotent requests but 4xx other than 429 do not`() {
        assertEquals(RetryDecision.RetryAfter(500), decide(HttpMethod.GET, "/topics", 429))
        assertEquals(RetryDecision.GiveUp, decide(HttpMethod.GET, "/topics", 418))
    }

    @Test
    fun `TC-NET-041 negative non numeric or past Retry-After falls back to default backoff`() {
        for (bad in listOf("-1", "abc", "", "1.5e3x", httpDate(-60))) {
            assertNull(policy.parseRetryAfterMs(bad, now), "'$bad'")
            assertEquals(RetryDecision.RetryAfter(500), decide(HttpMethod.GET, "/topics", 503, retryAfter = bad), "'$bad'")
            assertEquals(RetryDecision.RetryAfter(1000), decide(HttpMethod.GET, "/topics", 503, 1, retryAfter = bad), "'$bad' second")
        }
    }

    @Test
    fun `TC-NET-041 Retry-After above the cap fails immediately instead of waiting`() {
        val cap = kr.chalkak.core.common.AppConstants.RETRY_AFTER_MAX_MS
        assertEquals(RetryDecision.RetryAfter(cap), decide(HttpMethod.GET, "/topics", 503, retryAfter = (cap / 1000).toString()))
        assertEquals(RetryDecision.GiveUp, decide(HttpMethod.GET, "/topics", 503, retryAfter = (cap / 1000 + 1).toString()))
        assertEquals(RetryDecision.GiveUp, decide(HttpMethod.GET, "/topics", 503, retryAfter = "99999999999"))
        assertEquals(RetryDecision.GiveUp, decide(HttpMethod.GET, "/topics", 503, retryAfter = httpDate(Duration.ofHours(1).seconds)))
    }

    @Test
    fun `TC-NET-041 Retry-After counts against the same retry budget`() {
        assertEquals(RetryDecision.GiveUp, decide(HttpMethod.GET, "/topics", 503, 2, retryAfter = "1"))
    }

    @Test
    fun `TC-NET-042 429 on a non idempotent POST gives up without waiting`() {
        assertEquals(RetryDecision.GiveUp, decide(HttpMethod.POST, "/feedbacks", 429, retryAfter = "2"))
        assertEquals(RetryDecision.GiveUp, decide(HttpMethod.POST, "/feedbacks", 429))
    }

    @Test
    fun `TC-NET-040 retry constants match the shared constants`() {
        assertEquals(listOf(500L, 1000L), kr.chalkak.core.common.AppConstants.RETRY_BACKOFF_MS)
        assertEquals(2, kr.chalkak.core.common.AppConstants.RETRY_MAX)
    }
}
