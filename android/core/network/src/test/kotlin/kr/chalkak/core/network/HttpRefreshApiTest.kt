package kr.chalkak.core.network

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.RouteDispatcher
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class HttpRefreshApiTest {
    private val dispatcher = RouteDispatcher()
    private val server = MockWebServer().apply { this.dispatcher = this@HttpRefreshApiTest.dispatcher; start() }
    private val baseUrl = (ApiBaseUrl.parse(server.url("/").toString()) as ApiBaseUrlResult.Valid).baseUrl
    private fun refreshApi(responseTimeoutMs: Long = 15_000) =
        HttpRefreshApi(baseUrl, OkHttpFactory.apiClient(NetworkConfig(responseTimeoutMs = responseTimeoutMs)))
    private val path = api("/auth/refresh")

    @AfterTest
    fun tearDown() = server.shutdown()

    @Test
    fun `TC-NET-022 success parses both tokens and sends only the refresh token as json without Authorization`() = runTest {
        dispatcher.enqueue(path, MockResponses.fromFixture("auth/refresh__success.json"))
        val result = refreshApi().refresh("fixture-refresh-token-1")
        assertEquals(RefreshResult.Success(TestSessions.tokens2), result)
        val req = dispatcher.requests(path).single()
        assertEquals("POST", req.method)
        assertNull(req.getHeader("Authorization"))
        assertEquals("""{"refreshToken":"fixture-refresh-token-1"}""", req.body.readUtf8())
        assertEquals("application/json", req.getHeader("Content-Type")?.substringBefore(";"))
    }

    @Test
    fun `TC-NET-021 REAUTHENTICATION_REQUIRED 401 maps to ReauthenticationRequired`() = runTest {
        dispatcher.enqueue(path, MockResponses.fromFixture("auth/refresh__reauthentication-required.json"))
        assertEquals(RefreshResult.ReauthenticationRequired, refreshApi().refresh("t"))
    }

    @Test
    fun `TC-NET-024 5xx maps to a transient failure and is not retried`() = runTest {
        dispatcher.enqueue(path, MockResponses.fromFixture("auth/refresh__internal-error.json"), MockResponses.fromFixture("auth/refresh__success.json"))
        val failed = assertIs<RefreshResult.Failed>(refreshApi().refresh("t"))
        assertEquals(500, assertIs<ApiError.Http>(failed.error).status)
        assertEquals(1, dispatcher.requests(path).size)
    }

    @Test
    fun `TC-NET-025 missing token field is a transient failure not a partial session`() = runTest {
        dispatcher.enqueue(path, MockResponses.fromFixture("auth/refresh__missing-token-field.json"))
        val failed = assertIs<RefreshResult.Failed>(refreshApi().refresh("t"))
        assertIs<ApiError.InvalidResponse>(failed.error)
    }

    @Test
    fun `TC-NET-026 400 with a business error is a request failure`() = runTest {
        dispatcher.enqueue(path, MockResponses.fromFixture("common/error__business-400.json"))
        val failed = assertIs<RefreshResult.Failed>(refreshApi().refresh("t"))
        assertEquals(400, assertIs<ApiError.Http>(failed.error).status)
    }

    @Test
    fun `TC-NET-023 timeout maps to Network failure with a single attempt`() = runTest {
        dispatcher.enqueue(path, MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE))
        val failed = assertIs<RefreshResult.Failed>(refreshApi(responseTimeoutMs = 200).refresh("t"))
        assertEquals(ApiError.Network(NetworkKind.TIMEOUT), failed.error)
        assertEquals(1, dispatcher.requests(path).size)
    }

    @Test
    fun `TC-NET-023 disconnect maps to a Network failure with a single attempt`() = runTest {
        dispatcher.enqueue(path, MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
        val failed = assertIs<RefreshResult.Failed>(refreshApi().refresh("t"))
        assertIs<ApiError.Network>(failed.error)
        assertEquals(1, dispatcher.requests(path).size)
    }
}
