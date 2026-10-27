package kr.chalkak.core.network

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.httpError
import okhttp3.mockwebserver.MockResponse
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class OkHttpCallsTest {
    @Test
    fun `TC-NET-045 IOException subclasses map to timeout, offline or other`() {
        assertEquals(NetworkKind.TIMEOUT, SocketTimeoutException().toNetworkError().kind)
        assertEquals(NetworkKind.TIMEOUT, InterruptedIOException().toNetworkError().kind)
        assertEquals(NetworkKind.OFFLINE, UnknownHostException().toNetworkError().kind)
        assertEquals(NetworkKind.OFFLINE, ConnectException().toNetworkError().kind)
        assertEquals(NetworkKind.OFFLINE, NoRouteToHostException().toNetworkError().kind)
        assertEquals(NetworkKind.OTHER, SSLHandshakeException("x").toNetworkError().kind)
        assertEquals(NetworkKind.OTHER, SocketException("reset").toNetworkError().kind)
        assertEquals(NetworkKind.OTHER, IOException("x").toNetworkError().kind)
    }

    @Test
    fun `TC-NET-050 a 3xx redirect is not followed and surfaces as an Http failure after one request`() = runTest {
        NetHarness(backgroundScope, StoredSession.Guest).use { h ->
            h.dispatcher.enqueue(api("/topics"), MockResponse().setResponseCode(302).addHeader("Location", "http://evil.example/x"))
            val result = h.client.execute(ApiRequest(HttpMethod.GET, "/topics"))
            assertEquals(302, result.httpError().status)
            assertEquals(1, h.dispatcher.requests(api("/topics")).size)
            assertTrue(h.server.requestCount == 1)
        }
    }
}
