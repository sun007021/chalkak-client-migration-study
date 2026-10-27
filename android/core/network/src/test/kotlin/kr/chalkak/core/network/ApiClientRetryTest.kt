@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.error
import kr.chalkak.core.network.testing.httpError
import kr.chalkak.core.network.testing.okJson
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertTrue

class ApiClientRetryTest {
    private val clock = FakeClock()
    private val unread = "/notifications/unread-status"
    private fun server500() = MockResponses.fromFixture("common/error__internal-500.json")

    private fun harness(scope: kotlinx.coroutines.CoroutineScope, config: NetworkConfig = NetworkConfig()) =
        NetHarness(scope, StoredSession.Guest, config = config, clock = clock)

    @Test
    fun `TC-NET-037 GET 5xx is retried twice with 500ms then 1000ms of virtual time then fails`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(unread), server500(), server500(), server500(), okJson())
            val result = h.client.execute(ApiRequest(HttpMethod.GET, unread))
            assertEquals(500, result.httpError().status)
            assertEquals(3, h.dispatcher.requests(api(unread)).size)
            assertEquals(1500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-037 success on the second attempt waits only 500ms`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(unread), server500(), okJson())
            assertIs<ApiResult.Success<*>>(h.client.execute(ApiRequest(HttpMethod.GET, unread)))
            assertEquals(2, h.dispatcher.requests(api(unread)).size)
            assertEquals(500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-037 PUT DELETE PATCH and upload policy POST get three attempts on 503`() = runTest {
        harness(backgroundScope).use { h ->
            val cases = listOf(
                HttpMethod.PUT to "/posts/x/likes", HttpMethod.DELETE to "/posts/x", HttpMethod.PATCH to "/notifications/x",
                HttpMethod.POST to "/posts/uploads", HttpMethod.POST to "/users/me/signature/uploads",
            )
            for ((m, p) in cases) {
                h.dispatcher.enqueue(api(p), server500(), server500(), server500(), okJson())
                h.client.execute(ApiRequest(m, p))
                assertEquals(3, h.dispatcher.requests(api(p)).size, "$m $p")
            }
        }
    }

    @Test
    fun `TC-NET-037 network errors are retried like 5xx`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(unread), MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST), okJson())
            assertIs<ApiResult.Success<*>>(h.client.execute(ApiRequest(HttpMethod.GET, unread)))
            assertEquals(2, h.dispatcher.requests(api(unread)).size)
        }
    }

    @Test
    fun `TC-NET-038 non idempotent POST requests are sent exactly once on 5xx`() = runTest {
        harness(backgroundScope).use { h ->
            val paths = listOf(
                "/posts", "/auth/refresh", "/feedbacks", "/posts/22222222-2222-4222-8222-222222222201/ai-review",
                "/auth/social-login", "/auth/social-signup/signature/uploads", "/auth/social-signup", "/auth/logout",
            )
            for (p in paths) {
                h.dispatcher.enqueue(api(p), server500(), okJson())
                val result = h.client.execute(ApiRequest(HttpMethod.POST, p, jsonBody = "{}"))
                assertEquals(500, result.httpError().status, p)
                assertEquals(1, h.dispatcher.requests(api(p)).size, p)
            }
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-038 non idempotent POST is not retried after a network error`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/feedbacks"), MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST), okJson())
            assertIs<ApiError.Network>(h.client.execute(ApiRequest(HttpMethod.POST, "/feedbacks", jsonBody = "{}")).error())
            assertEquals(1, h.dispatcher.requests(api("/feedbacks")).size)
        }
    }

    @Test
    fun `TC-NET-039 idempotent request with 400 403 404 is not retried`() = runTest {
        harness(backgroundScope).use { h ->
            val fixtures = listOf(
                "common/error__business-400.json", "common/error__forbidden-no-permission.json", "common/error__not-found-api.json",
            )
            for ((i, f) in fixtures.withIndex()) {
                val p = "/probe$i"
                h.dispatcher.enqueue(api(p), MockResponses.fromFixture(f), okJson())
                h.client.execute(ApiRequest(HttpMethod.GET, p))
                assertEquals(1, h.dispatcher.requests(api(p)).size, f)
            }
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-040 503 with Retry-After 2 waits 2000ms of virtual time before the retry`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(unread), MockResponses.fromFixture("common/error__service-unavailable-503.json"), okJson())
            assertIs<ApiResult.Success<*>>(h.client.execute(ApiRequest(HttpMethod.GET, unread)))
            assertEquals(2000L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-040 429 with Retry-After on an idempotent request waits then retries`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/topics"), MockResponses.fromFixture("common/error__rate-limited-429.json"), okJson())
            assertIs<ApiResult.Success<*>>(h.client.execute(ApiRequest(HttpMethod.GET, "/topics")))
            assertEquals(2000L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-041 invalid Retry-After falls back to the default backoff`() = runTest {
        harness(backgroundScope).use { h ->
            val bad = MockResponses.fromFixture("common/error__service-unavailable-503-bad-retry-after.json")
            h.dispatcher.enqueue(api(unread), bad, MockResponses.fromFixture("common/error__service-unavailable-503-bad-retry-after.json"), okJson())
            assertIs<ApiResult.Success<*>>(h.client.execute(ApiRequest(HttpMethod.GET, unread)))
            assertEquals(1500L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-041 Retry-After above the cap fails at once with that response`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(unread), MockResponse().setResponseCode(503).addHeader("Retry-After", "31").setBody("Service Unavailable"), okJson())
            val result = h.client.execute(ApiRequest(HttpMethod.GET, unread))
            assertEquals(503, result.httpError().status)
            assertEquals(1, h.dispatcher.requests(api(unread)).size)
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-042 429 on a non idempotent POST fails immediately without waiting`() = runTest {
        harness(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/feedbacks"), MockResponses.fromFixture("common/error__rate-limited-429.json"), okJson())
            val result = h.client.execute(ApiRequest(HttpMethod.POST, "/feedbacks", jsonBody = "{}"))
            assertEquals(429, result.httpError().status)
            assertEquals(1, h.dispatcher.requests(api("/feedbacks")).size)
            assertEquals(0L, testScheduler.currentTime)
        }
    }

    @Test
    fun `TC-NET-043 a response slower than the response timeout is a Network TIMEOUT`() = runTest {
        harness(backgroundScope, NetworkConfig(responseTimeoutMs = 250)).use { h ->
            h.dispatcher.enqueue(api("/feedbacks"), MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
            val result = h.client.execute(ApiRequest(HttpMethod.POST, "/feedbacks", jsonBody = "{}"))
            assertEquals(ApiError.Network(NetworkKind.TIMEOUT), result.error())
        }
    }

    @Test
    fun `TC-NET-045 timeout disconnect refused connection and TLS failure all map to ApiError Network`() = runTest {
        val post = ApiRequest(HttpMethod.POST, "/feedbacks", jsonBody = "{}")
        harness(backgroundScope, NetworkConfig(responseTimeoutMs = 250)).use { h ->
            h.dispatcher.enqueue(api("/feedbacks"), MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE), MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            assertIs<ApiError.Network>(h.client.execute(post).error())
            assertIs<ApiError.Network>(h.client.execute(post).error())
        }
        // server stopped -> connection refused
        val h2 = harness(backgroundScope)
        h2.close()
        assertIs<ApiError.Network>(h2.client.execute(post).error())
        // https against a plain-http server -> TLS handshake failure
        val h3 = harness(backgroundScope)
        h3.use {
            val tlsBase = (ApiBaseUrl.parse("https://localhost:${h3.server.port}") as ApiBaseUrlResult.Valid).baseUrl
            val tlsClient = ApiClient(tlsBase, OkHttpFactory.apiClient(), h3.store, h3.refresher, clock, h3.events)
            assertIs<ApiError.Network>(tlsClient.execute(post).error())
        }
    }

    @Test
    fun `TC-NET-048 cancelling a request in flight propagates CancellationException and yields no ApiResult`() = runTest {
        harness(backgroundScope).use { h ->
            val reached = CompletableDeferred<Unit>()
            val release = java.util.concurrent.CountDownLatch(1)
            h.dispatcher.handle(api(unread)) {
                reached.complete(Unit)
                release.await(10, java.util.concurrent.TimeUnit.SECONDS)
                okJson()
            }
            val call = async { h.client.execute(ApiRequest(HttpMethod.GET, unread)) }
            reached.await()
            call.cancel()
            assertFailsWith<CancellationException> { call.await() }
            release.countDown()
            assertEquals(1, h.dispatcher.requests(api(unread)).size)
        }
    }
}
