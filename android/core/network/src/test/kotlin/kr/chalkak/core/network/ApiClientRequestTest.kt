package kr.chalkak.core.network

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.error
import kr.chalkak.core.network.testing.httpError
import kr.chalkak.core.network.testing.okJson
import okhttp3.mockwebserver.MockResponse
import java.io.File
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ApiClientRequestTest {
    private val clock = FakeClock()
    private val today = "/posts/today"

    private fun guest(scope: kotlinx.coroutines.CoroutineScope) = NetHarness(scope, StoredSession.Guest, clock = clock)

    // ---- decoding through the client ----------------------------------------------------------

    @Test
    fun `TC-NET-004 gateway html on a POST keeps status 502 and is not retried`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/auth/social-login"), MockResponses.fromFixture("common/error__bad-gateway-html.json"), okJson())
            val e = h.client.execute(ApiRequest(HttpMethod.POST, "/auth/social-login", jsonBody = "{}")).httpError()
            assertEquals(502, e.status)
            assertEquals(1, h.dispatcher.requests(api("/auth/social-login")).size)
        }
    }

    @Test
    fun `TC-NET-005 malformed json on 200 is InvalidResponse through send`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(today), MockResponses.fromFixture("common/ok__malformed-json.json"))
            assertIs<ApiError.InvalidResponse>(h.client.send(ApiRequest(HttpMethod.GET, today), TodayPostDto.serializer()).error())
        }
    }

    @Test
    fun `TC-NET-006 TC-NET-011 empty body and wrong content type are InvalidResponse through send`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(today), MockResponses.fromFixture("common/ok__empty-body.json"), MockResponses.fromFixture("common/ok__wrong-content-type.json"))
            assertIs<ApiError.InvalidResponse>(h.client.send(ApiRequest(HttpMethod.GET, today), TodayPostDto.serializer()).error())
            assertIs<ApiError.InvalidResponse>(h.client.send(ApiRequest(HttpMethod.GET, today), TodayPostDto.serializer()).error())
        }
    }

    @Test
    fun `TC-NET-007 204 logout is a success without a body`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/auth/logout"), MockResponses.fromFixture("auth/logout__no-content.json"))
            assertEquals(ApiResult.Success(Unit), h.client.sendNoContent(ApiRequest(HttpMethod.POST, "/auth/logout", jsonBody = """{"refreshToken":"t"}""")))
        }
    }

    @Test
    fun `TC-NET-008 unknown fields are ignored through send`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(today), MockResponses.fromFixture("common/ok__extra-fields.json"))
            val ok = assertIs<ApiResult.Success<TodayPostDto>>(h.client.send(ApiRequest(HttpMethod.GET, today), TodayPostDto.serializer()))
            assertEquals("2026-10-27", ok.value.topicDate)
        }
    }

    @Test
    fun `TC-NET-010 missing required field is InvalidResponse through send`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(today), MockResponses.fromFixture("common/ok__missing-required.json"))
            assertIs<ApiError.InvalidResponse>(h.client.send(ApiRequest(HttpMethod.GET, today), TodayPostDto.serializer()).error())
        }
    }

    // ---- request construction -----------------------------------------------------------------

    @Test
    fun `TC-NET-052 uppercase uuid path segments are sent in lower case`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/posts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), okJson())
            h.client.execute(ApiRequest(HttpMethod.GET, "/posts/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"))
            assertEquals(api("/posts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), h.dispatcher.recorded.single().requestUrl?.encodedPath)
        }
    }

    @Test
    fun `TC-NET-053 query parameters reach the server as given`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/posts"), okJson())
            h.client.execute(ApiRequest(HttpMethod.GET, "/posts", listOf("topicDate" to "2026-10-27", "page" to "1", "pageSize" to "20", "sort" to "latest")))
            val url = h.dispatcher.recorded.single().requestUrl!!
            assertEquals("2026-10-27", url.queryParameter("topicDate"))
            assertEquals("20", url.queryParameter("pageSize"))
            assertEquals("latest", url.queryParameter("sort"))
        }
    }

    @Test
    fun `TC-NET-054 a request with a body sends json content type and Accept json`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/feedbacks"), okJson())
            h.client.execute(ApiRequest(HttpMethod.POST, "/feedbacks", jsonBody = """{"content":"hi"}"""))
            val req = h.dispatcher.recorded.single()
            assertEquals("application/json", req.getHeader("Content-Type")?.substringBefore(";"))
            assertEquals("application/json", req.getHeader("Accept"))
            assertEquals("""{"content":"hi"}""", req.body.readUtf8())
        }
    }

    @Test
    fun `TC-NET-054 body-less POST PUT DELETE send no body and no Content-Type`() = runTest {
        guest(backgroundScope).use { h ->
            for (m in listOf(HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE)) {
                h.dispatcher.enqueue(api("/x/${m.name.lowercase()}"), MockResponse().setResponseCode(204))
                h.client.execute(ApiRequest(m, "/x/${m.name.lowercase()}"))
            }
            h.dispatcher.recorded.forEach {
                assertEquals(0L, it.bodySize, it.path)
                assertNull(it.getHeader("Content-Type"), it.path)
                assertEquals("application/json", it.getHeader("Accept"), it.path)
            }
        }
    }

    // ---- presigned upload ---------------------------------------------------------------------

    @Test
    fun `TC-NET-044 presigned PUT has the policy content type and no Authorization or app headers`() = runTest {
        NetHarness(backgroundScope, StoredSession.User(TestSessions.user(clock)), clock = clock).use { h ->
            h.dispatcher.enqueue("/__upload/55555555-5555-4555-8555-555555555501", MockResponses.fromFixture("common/presigned-put__ok.json"))
            val url = h.server.url("/__upload/55555555-5555-4555-8555-555555555501?X-Amz-Expires=300").toString()
            val bytes = byteArrayOf(1, 2, 3, 4)
            val result = h.client.putPresigned(url, "image/png", bytes, OkHttpFactory.uploadClient())
            assertEquals(ApiResult.Success(Unit), result)
            val req = h.dispatcher.recorded.single()
            assertEquals("PUT", req.method)
            assertEquals("image/png", req.getHeader("Content-Type"))
            assertNull(req.getHeader("Authorization"))
            assertNull(req.getHeader("Accept"))
            assertContentEquals(bytes, req.body.readByteArray())
            val allowed = setOf("content-type", "content-length", "host", "connection", "accept-encoding", "user-agent")
            assertTrue(req.headers.names().all { it.lowercase() in allowed }, req.headers.names().toString())
        }
    }

    @Test
    fun `TC-NET-050 presigned PUT to non loopback http is rejected before any request`() = runTest {
        guest(backgroundScope).use { h ->
            val result = h.client.putPresigned("http://bucket.example.com/x?sig=1", "image/png", byteArrayOf(1), OkHttpFactory.uploadClient())
            assertEquals(ApiError.Config(ConfigError.INSECURE_HTTP), result.error())
            assertTrue(h.dispatcher.recorded.isEmpty())
        }
    }

    // ---- connection ---------------------------------------------------------------------------

    @Test
    fun `TC-NET-050 a redirect is not followed and fails the request`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api(today), MockResponse().setResponseCode(302).addHeader("Location", "http://insecure.example.com/"))
            val result = h.client.execute(ApiRequest(HttpMethod.GET, today))
            assertIs<ApiResult.Failure>(result)
            assertEquals(1, h.dispatcher.recorded.size)
        }
    }

    @Test
    fun `TC-NET-058 every request goes to the configured base url only`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue(api("/topics"), okJson())
            h.dispatcher.enqueue(api("/banners"), okJson())
            h.client.execute(ApiRequest(HttpMethod.GET, "/topics"))
            h.client.execute(ApiRequest(HttpMethod.GET, "/banners"))
            assertEquals(2, h.server.requestCount)
            assertTrue(h.dispatcher.recorded.all { it.getHeader("Host") == "127.0.0.1:${h.server.port}" })
        }
    }

    @Test
    fun `TC-NET-058 no dev server address or fallback url is hard coded in main sources`() {
        val androidDir = File(requireNotNull(System.getProperty("android.dir")))
        val main = File(androidDir, "core/network/src/main")
        val hits = main.walkTopDown().filter { it.isFile && it.extension == "kt" }
            .filter { f -> f.readLines().any { l -> !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*") && (l.contains("chalkak-dev") || l.contains("pysun.kr")) } }
            .map { it.name }.toList()
        assertEquals(emptyList<String>(), hits)
    }

    // ---- logging ------------------------------------------------------------------------------

    @Test
    fun `TC-NET-055 a full refresh flow logs no token values`() = runTest {
        val user = TestSessions.user(clock)
        NetHarness(backgroundScope, StoredSession.User(user), clock = clock).use { h ->
            h.dispatcher.handle(api("/notifications/unread-status")) { req ->
                if (req.getHeader("Authorization") == "Bearer fixture-access-token-2") okJson() else MockResponses.fromFixture("common/error__unauthorized-token-invalid.json")
            }
            h.dispatcher.enqueue(api("/auth/refresh"), MockResponses.fromFixture("auth/refresh__success.json"))
            h.client.execute(ApiRequest(HttpMethod.GET, "/notifications/unread-status"))
            val joined = synchronized(h.logs) { h.logs.joinToString("\n") }
            assertTrue(h.logs.isNotEmpty(), "client should log requests")
            listOf("fixture-access-token", "fixture-refresh-token").forEach { assertFalse(joined.contains(it), it) }
        }
    }

    @Test
    fun `TC-NET-055 presigned upload logs omit the url query string`() = runTest {
        guest(backgroundScope).use { h ->
            h.dispatcher.enqueue("/__upload/x", MockResponses.fromFixture("common/presigned-put__ok.json"))
            h.client.putPresigned(h.server.url("/__upload/x?X-Amz-Signature=SECRETSIG").toString(), "image/png", byteArrayOf(1), OkHttpFactory.uploadClient())
            val joined = synchronized(h.logs) { h.logs.joinToString("\n") }
            assertFalse(joined.contains("SECRETSIG"))
        }
    }
}
