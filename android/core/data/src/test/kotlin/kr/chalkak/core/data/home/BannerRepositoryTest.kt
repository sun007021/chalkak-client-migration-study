package kr.chalkak.core.data.home

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** BANR repository level (C) tests: `GET /banners` over MockWebServer + shared/fixtures/banner. */
class BannerRepositoryTest {
    private val clock = FakeClock()
    private val path = api("/banners")

    private class Env(val h: NetHarness, val repo: BannerRepository) : AutoCloseable {
        override fun close() = h.close()
        fun requests() = h.dispatcher.requests(api("/banners"))
    }

    private fun TestScope.env(initial: StoredSession = StoredSession.None, clock: FakeClock): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultBannerRepository(h.client))
    }

    private fun Env.enqueue(vararg responses: MockResponse) = h.dispatcher.enqueue(api("/banners"), *responses)

    private fun fx(path: String) = MockResponses.fromFixture(path)

    private fun <T> ApiResult<T>.value(): T = assertIs<ApiResult.Success<T>>(this).value

    private fun ApiResult<*>.error(): ApiError = assertIs<ApiResult.Failure>(this).error

    @Test
    fun `TC-BANR-001 request is page 1 size 10 without Authorization and the 10 banners keep server order and fields`() = runTest {
        env(StoredSession.User(TestSessions.user(clock)), clock).use { e ->
            e.enqueue(fx("banner/banners__page1-10.json"))
            val page = e.repo.banners(1).value()

            val req = e.requests().single()
            assertEquals("GET", req.method)
            assertEquals("1", req.requestUrl?.queryParameter("page"))
            assertEquals("10", req.requestUrl?.queryParameter("pageSize"))
            assertNull(req.getHeader("Authorization"))

            assertEquals(10, page.banners.size)
            assertTrue(page.hasNext)
            assertEquals((1..10).map { "44444444-4444-4444-8444-4444444444%02d".format(it) }, page.banners.map { it.id })
            val first = page.banners.first()
            assertEquals("이슈 1", first.title)
            assertEquals("찰칵 소식 1", first.subtitle)
            assertEquals("https://web.example.test/issues/1", first.webViewUrl)
            assertEquals("https://cdn.example.test/banners/44444444-4444-4444-8444-444444444401/thumbnail.webp", first.thumbnailUrl)
            assertEquals(Instant.parse("2026-10-27T01:00:00Z"), first.createdAt)
        }
    }

    @Test
    fun `TC-BANR-002 an expired member token is not sent so the call succeeds, and a 401 never triggers a refresh`() = runTest {
        env(StoredSession.User(TestSessions.expiredAccess(clock)), clock).use { e ->
            e.enqueue(fx("banner/banners__page1-10.json"))
            assertEquals(10, e.repo.banners(1).value().banners.size)
            assertNull(e.requests().single().getHeader("Authorization"))
        }
        env(StoredSession.User(TestSessions.user(clock)), clock).use { e ->
            e.enqueue(fx("banner/banners__401-unauthorized.json"))
            val error = e.repo.banners(1).error()
            assertEquals(401, assertIs<ApiError.Http>(error).status)
            assertEquals(1, e.requests().size)
            assertTrue(e.h.refreshRequests().isEmpty())
        }
    }

    @Test
    fun `TC-BANR-003 page 2 is passed through as is and the last page has hasNext false`() = runTest {
        env(clock = clock).use { e ->
            e.enqueue(fx("banner/banners__page2-last.json"))
            val page = e.repo.banners(2).value()
            assertEquals("2", e.requests().single().requestUrl?.queryParameter("page"))
            assertEquals(3, page.banners.size)
            assertFalse(page.hasNext)
        }
    }

    @Test
    fun `TC-BANR-003 an empty banners list with hasNext false is a success and not an error`() = runTest {
        env(clock = clock).use { e ->
            e.enqueue(fx("banner/banners__empty.json"))
            val page = e.repo.banners(1).value()
            assertTrue(page.banners.isEmpty())
            assertFalse(page.hasNext)
        }
    }

    @Test
    fun `TC-BANR-004 a response without hasNext is treated as the last page`() = runTest {
        env(clock = clock).use { e ->
            e.enqueue(fx("banner/banners__no-has-next.json"))
            val page = e.repo.banners(1).value()
            assertEquals(3, page.banners.size)
            assertFalse(page.hasNext)
        }
    }

    @Test
    fun `TC-BANR-005 a 400 is returned as an Http 400 failure with a single request and no refresh`() = runTest {
        env(StoredSession.User(TestSessions.user(clock)), clock).use { e ->
            e.enqueue(fx("banner/banners__400-bad-query.json"))
            val http = assertIs<ApiError.Http>(e.repo.banners(1).error())
            assertEquals(400, http.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, http.errorCode)
            assertEquals(1, e.requests().size)
            assertTrue(e.h.refreshRequests().isEmpty())
        }
    }

    @Test
    fun `TC-BANR-005 a 500 is retried twice (3 requests in total) and then returned as Http 500`() = runTest {
        env(clock = clock).use { e ->
            e.enqueue(fx("banner/banners__500-server-error.json"), fx("banner/banners__500-server-error.json"), fx("banner/banners__500-server-error.json"))
            val http = assertIs<ApiError.Http>(e.repo.banners(1).error())
            assertEquals(500, http.status)
            assertEquals(3, e.requests().size)
            assertTrue(e.h.refreshRequests().isEmpty())
        }
    }

    @Test
    fun `TC-BANR-005 a connection failure is retried twice and then returned as a Network failure`() = runTest {
        env(clock = clock).use { e ->
            val drop = { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) }
            e.enqueue(drop(), drop(), drop())
            assertIs<ApiError.Network>(e.repo.banners(1).error())
            assertEquals(3, e.requests().size)
        }
    }

    @Test
    fun `TC-BANR-006 a broken JSON body is an InvalidResponse failure`() = runTest {
        env(clock = clock).use { e ->
            e.enqueue(fx("banner/banners__malformed.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.banners(1).error())
        }
    }

    @Test
    fun `TC-BANR-006 a non-https webViewUrl makes the whole response an InvalidResponse failure`() = runTest {
        env(clock = clock).use { e ->
            e.enqueue(fx("banner/banners__insecure-url.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.banners(1).error())
        }
    }

    @Test
    fun `TC-BANR-007 a malformed thumbnailUrl keeps the banner and only drops its thumbnail`() = runTest {
        env(clock = clock).use { e ->
            e.enqueue(fx("banner/banners__bad-thumbnail.json"))
            val banners = e.repo.banners(1).value().banners
            assertEquals(3, banners.size)
            assertNull(banners[1].thumbnailUrl)
            assertEquals("https://web.example.test/issues/2", banners[1].webViewUrl)
            assertEquals("https://cdn.example.test/banners/44444444-4444-4444-8444-444444444401/thumbnail.webp", banners[0].thumbnailUrl)
            assertEquals("https://cdn.example.test/banners/44444444-4444-4444-8444-444444444403/thumbnail.webp", banners[2].thumbnailUrl)
        }
    }
}
