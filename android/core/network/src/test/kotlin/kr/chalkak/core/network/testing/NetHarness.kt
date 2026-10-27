package kr.chalkak.core.network.testing

import kr.chalkak.core.common.testing.FakeClock
import kotlinx.coroutines.CoroutineScope
import kr.chalkak.core.network.ApiBaseUrl
import kr.chalkak.core.network.ApiBaseUrlResult
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.HttpRefreshApi
import kr.chalkak.core.network.NetworkConfig
import kr.chalkak.core.network.NetworkLogSink
import kr.chalkak.core.network.OkHttpFactory
import kr.chalkak.core.network.RefreshApi
import kr.chalkak.core.network.RetryPolicy
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.TokenRefresher
import okhttp3.mockwebserver.MockWebServer

/** MockWebServer + ApiClient wired with fakes. [refreshApi] null = real [HttpRefreshApi] against the same server. */
class NetHarness(
    scope: CoroutineScope,
    initial: StoredSession = StoredSession.None,
    config: NetworkConfig = NetworkConfig(),
    refreshApi: RefreshApi? = null,
    val clock: FakeClock = FakeClock(),
    val logs: MutableList<String> = mutableListOf(),
) : AutoCloseable {
    val dispatcher = RouteDispatcher()
    val server = MockWebServer().apply { dispatcher = this@NetHarness.dispatcher; start() }
    val store = FakeSessionStore(initial)
    val events = RecordingEvents()
    val baseUrl: ApiBaseUrl = (ApiBaseUrl.parse(server.url("/").toString()) as ApiBaseUrlResult.Valid).baseUrl
    private val okHttp = OkHttpFactory.apiClient(config)
    val refresher = TokenRefresher(store, refreshApi ?: HttpRefreshApi(baseUrl, okHttp), clock, scope, events)
    val client = ApiClient(
        baseUrl = baseUrl,
        okHttp = okHttp,
        sessionStore = store,
        refresher = refresher,
        clock = clock,
        events = events,
        retryPolicy = RetryPolicy(),
        logSink = NetworkLogSink { synchronized(logs) { logs += it } },
    )

    fun refreshRequests() = dispatcher.requests(api("/auth/refresh"))

    override fun close() { server.shutdown() }
}
