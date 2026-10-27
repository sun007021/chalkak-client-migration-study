package kr.chalkak.core.network

import okhttp3.OkHttpClient
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class NetworkConfigTest {
    @Test
    fun `TC-NET-043 api client uses connect 10s and response 15s timeouts`() {
        val c = OkHttpFactory.apiClient()
        assertEquals(10_000, c.connectTimeoutMillis)
        assertEquals(15_000, c.readTimeoutMillis)
        assertEquals(15_000, c.writeTimeoutMillis)
    }

    @Test
    fun `TC-NET-043 default config values come from the shared constants`() {
        val cfg = NetworkConfig()
        assertEquals(10_000L, cfg.connectTimeoutMs)
        assertEquals(15_000L, cfg.responseTimeoutMs)
        assertEquals(60_000L, cfg.uploadTimeoutMs)
    }

    @Test
    fun `TC-NET-043 custom timeouts are honoured and OkHttp 10s default is not relied on`() {
        val c = OkHttpFactory.apiClient(NetworkConfig(connectTimeoutMs = 111, responseTimeoutMs = 222))
        assertEquals(111, c.connectTimeoutMillis)
        assertEquals(222, c.readTimeoutMillis)
    }

    @Test
    fun `TC-NET-044 presigned PUT client uses a 60s timeout`() {
        val c = OkHttpFactory.uploadClient()
        assertEquals(60_000, c.readTimeoutMillis)
        assertEquals(60_000, c.writeTimeoutMillis)
    }

    @Test
    fun `TC-NET-050 neither client follows redirects including https to http`() {
        listOf(OkHttpFactory.apiClient(), OkHttpFactory.uploadClient()).forEach { c: OkHttpClient ->
            assertFalse(c.followRedirects)
            assertFalse(c.followSslRedirects)
        }
    }

    @Test
    fun `TC-NET-044 factory keeps the base client interceptors out of the upload client auth path`() {
        val base = OkHttpClient()
        assertEquals(0, OkHttpFactory.uploadClient(base = base).interceptors.size)
    }
}
