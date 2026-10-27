package kr.chalkak.core.data.home

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.refreshSuccess
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.SocketPolicy
import java.time.LocalDate
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Repository level (C) tests for the home endpoints over MockWebServer + shared fixtures. */
class HomeRepositoryTest {
    private val clock = FakeClock()
    private val member get() = StoredSession.User(TestSessions.user(clock))

    private class Env(val h: NetHarness, val repo: HomeRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultHomeRepository(h.client))
    }

    private fun fx(path: String) = MockResponses.fromFixture(path)

    private fun Env.enqueue(path: String, vararg responses: MockResponse) = h.dispatcher.enqueue(api(path), *responses)

    private fun Env.requests(path: String) = h.dispatcher.requests(api(path))

    private fun <T> ApiResult<T>.value(): T = assertIs<ApiResult.Success<T>>(this).value

    private fun ApiResult<*>.http(): ApiError.Http = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(this).error)

    // ---- today (hero) ------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-002 today 404 is an Http 404 failure the holder can map to NoOpenTopic`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__404-no-open-topic.json"))
            val http = e.repo.today().http()
            assertEquals(404, http.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, http.errorCode)
            assertEquals(1, e.requests("/posts/today").size)
        }
    }

    @Test
    fun `TC-HOME-003 isPosted false parses with null postId and null moderationStatus`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__not-posted.json"))
            val today = e.repo.today().value()
            assertEquals(LocalDate.of(2026, 10, 27), today.topicDate)
            assertEquals(false, today.isPosted)
            assertNull(today.postId)
            assertNull(today.status)
        }
    }

    @Test
    fun `TC-HOME-004 VALIDATING parses to ModerationStatus VALIDATING with the postId`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__posted-validating.json"))
            val today = e.repo.today().value()
            assertTrue(today.isPosted)
            assertEquals(ModerationStatus.VALIDATING, today.status)
            assertEquals("22222222-2222-4222-8222-222222222201", today.postId)
        }
    }

    @Test
    fun `TC-HOME-005 PENDING parses to ModerationStatus PENDING`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__posted-pending.json"))
            assertEquals(ModerationStatus.PENDING, e.repo.today().value().status)
        }
    }

    @Test
    fun `TC-HOME-006 APPROVED parses to ModerationStatus APPROVED and sends the member token`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__posted-approved.json"))
            assertEquals(ModerationStatus.APPROVED, e.repo.today().value().status)
            assertEquals("Bearer fixture-access-token-1", e.requests("/posts/today").single().getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-HOME-008 today 403 is an Http 403 FORBIDDEN failure and is requested once`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__403-banned.json"))
            val http = e.repo.today().http()
            assertEquals(403, http.status)
            assertEquals(ErrorCode.FORBIDDEN, http.errorCode)
            assertEquals(1, e.requests("/posts/today").size)
        }
    }

    @Test
    fun `TC-HOME-009 today 500 is retried twice (GET policy) and then an Http 500 failure`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__500-server-error.json"), fx("home/posts-today__500-server-error.json"), fx("home/posts-today__500-server-error.json"))
            val http = e.repo.today().http()
            assertEquals(500, http.status)
            assertEquals(ErrorCode.INTERNAL_ERROR, http.errorCode)
            assertEquals(3, e.requests("/posts/today").size)
        }
    }

    @Test
    fun `TC-HOME-010 isPosted false after a rejection parses like never posted`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__not-posted-after-reject.json"))
            val today = e.repo.today().value()
            assertEquals(false, today.isPosted)
            assertNull(today.postId)
            assertNull(today.status)
        }
    }

    @Test
    fun `TC-HOME-011 unknown moderationStatus is an InvalidResponse failure and not a crash`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/today", fx("home/posts-today__unknown-status.json"))
            assertIs<ApiError.InvalidResponse>(assertIs<ApiResult.Failure>(e.repo.today()).error)
        }
    }

    @Test
    fun `TC-HOME-014 401 UNAUTHORIZED refreshes once and the original GET is resent once with the new token`() = runTest {
        env(member).use { e ->
            e.h.dispatcher.handle(api("/posts/today")) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fx("home/posts-today__posted-approved.json") else fx("home/posts-today__401-unauthorized.json")
            }
            e.enqueue("/auth/refresh", refreshSuccess())
            val today = e.repo.today().value()
            assertEquals(ModerationStatus.APPROVED, today.status)
            assertEquals(1, e.h.refreshRequests().size)
            assertEquals(2, e.requests("/posts/today").size)
        }
    }

    // ---- topics and popular posts ------------------------------------------------------------------

    @Test
    fun `TC-HOME-015 topic uses date=KST date and posts use the response topicDate with lowercase popular page 1 size 20`() = runTest {
        env(StoredSession.None).use { e ->
            e.enqueue("/topics", fx("home/topics__open-2026-10-27.json"))
            e.enqueue("/posts", fx("home/posts-list__popular-8.json"))
            val topic = e.repo.topic(LocalDate.of(2026, 10, 27)).value()
            assertEquals(LocalDate.of(2026, 10, 27), topic.topicDate)
            assertEquals("가을 하늘", topic.title)
            val posts = e.repo.popularPosts(topic.topicDate).value()

            assertEquals("2026-10-27", e.requests("/topics").single().requestUrl?.queryParameter("date"))
            val q = e.requests("/posts").single().requestUrl!!
            assertEquals("2026-10-27", q.queryParameter("topicDate"))
            assertEquals("popular", q.queryParameter("sort"))
            assertEquals("1", q.queryParameter("page"))
            assertEquals("20", q.queryParameter("pageSize"))
            assertEquals(8, posts.size)
            assertEquals("22222222-2222-4222-8222-222222222202", posts.first().id)
            assertEquals(38, posts.first().likeCount)
        }
    }

    @Test
    fun `TC-HOME-016 yesterday topic and posts are requested with the yesterday date and 3 posts come back`() = runTest {
        env(StoredSession.None).use { e ->
            e.enqueue("/topics", fx("home/topics__open-2026-10-26.json"))
            e.enqueue("/posts", fx("home/posts-list__popular-3.json"))
            val topic = e.repo.topic(LocalDate.of(2026, 10, 26)).value()
            assertEquals(3, e.repo.popularPosts(topic.topicDate).value().size)
            assertEquals("2026-10-26", e.requests("/posts").single().requestUrl?.queryParameter("topicDate"))
        }
    }

    @Test
    fun `TC-HOME-017 topic 404 is an Http 404 failure`() = runTest {
        env(StoredSession.None).use { e ->
            e.enqueue("/topics", fx("home/topics__404-not-found.json"))
            val http = e.repo.topic(LocalDate.of(2026, 10, 26)).http()
            assertEquals(404, http.status)
            assertEquals(1, e.requests("/topics").size)
        }
    }

    @Test
    fun `TC-HOME-019 empty and single popular lists parse without error`() = runTest {
        env(StoredSession.None).use { e ->
            e.enqueue("/posts", fx("home/posts-list__popular-0.json"), fx("home/posts-list__popular-1.json"))
            assertEquals(0, e.repo.popularPosts(LocalDate.of(2026, 10, 27)).value().size)
            assertEquals(1, e.repo.popularPosts(LocalDate.of(2026, 10, 27)).value().size)
        }
    }

    @Test
    fun `TC-HOME-020 posts 500 is an Http 500 failure after the GET retries`() = runTest {
        env(StoredSession.None).use { e ->
            e.enqueue("/posts", fx("home/posts-list__500-server-error.json"), fx("home/posts-list__500-server-error.json"), fx("home/posts-list__500-server-error.json"))
            assertEquals(500, e.repo.popularPosts(LocalDate.of(2026, 10, 27)).http().status)
            assertEquals(3, e.requests("/posts").size)
        }
    }

    @Test
    fun `TC-HOME-012 a guest sends topics and posts without Authorization and never touches personal endpoints`() = runTest {
        env(StoredSession.None).use { e ->
            e.enqueue("/topics", fx("home/topics__open-2026-10-27.json"))
            e.enqueue("/posts", fx("home/posts-list__popular-5.json"))
            val topic = e.repo.topic(LocalDate.of(2026, 10, 27)).value()
            assertEquals(5, e.repo.popularPosts(topic.topicDate).value().size)
            assertNull(e.requests("/topics").single().getHeader("Authorization"))
            assertNull(e.requests("/posts").single().getHeader("Authorization"))
            assertTrue(e.requests("/posts/today").isEmpty() && e.requests("/posts/calendar").isEmpty())
        }
    }

    // ---- calendar ----------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-026 calendar sends year and month as plain numbers and parses entries in order`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("home/posts-calendar__2026-09-week.json"), fx("home/posts-calendar__2026-10-week-approved.json"))
            val sep = e.repo.calendar(YearMonth.of(2026, 9)).value()
            val oct = e.repo.calendar(YearMonth.of(2026, 10)).value()
            val reqs = e.requests("/posts/calendar")
            assertEquals(listOf("2026" to "9", "2026" to "10"), reqs.map { it.requestUrl!!.queryParameter("year")!! to it.requestUrl!!.queryParameter("month")!! })
            assertEquals(listOf(LocalDate.of(2026, 9, 29), LocalDate.of(2026, 9, 30)), sep.map { it.topicDate })
            assertEquals(3, oct.size)
            assertEquals(ModerationStatus.APPROVED, oct.last().status)
        }
    }

    @Test
    fun `TC-HOME-005 calendar entry for PENDING carries the thumbnail used by the hero`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("home/posts-calendar__2026-10-week-pending.json"))
            val today = e.repo.calendar(YearMonth.of(2026, 10)).value().first { it.topicDate == LocalDate.of(2026, 10, 27) }
            assertEquals(ModerationStatus.PENDING, today.status)
            assertTrue(today.thumbnailImageUrl.startsWith("https://"))
        }
    }

    @Test
    fun `TC-HOME-032 calendar 500 is an Http 500 failure after retries`() = runTest {
        env(member).use { e ->
            val r = fx("home/posts-calendar__500-server-error.json")
            e.enqueue("/posts/calendar", r, fx("home/posts-calendar__500-server-error.json"), fx("home/posts-calendar__500-server-error.json"))
            assertEquals(500, e.repo.calendar(YearMonth.of(2026, 10)).http().status)
            assertEquals(3, e.requests("/posts/calendar").size)
        }
    }

    // ---- unread ------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-050 unread-status maps hasUnread true and false`() = runTest {
        env(member).use { e ->
            e.enqueue("/notifications/unread-status", fx("home/notifications-unread-status__true.json"), fx("home/notifications-unread-status__false.json"))
            assertEquals(true, e.repo.unreadStatus().value())
            assertEquals(false, e.repo.unreadStatus().value())
        }
    }

    @Test
    fun `TC-HOME-052 unread-status 500 is a failure the holder ignores`() = runTest {
        env(member).use { e ->
            e.enqueue("/notifications/unread-status", fx("home/notifications-unread-status__500-server-error.json"), fx("home/notifications-unread-status__500-server-error.json"), fx("home/notifications-unread-status__500-server-error.json"))
            assertEquals(500, e.repo.unreadStatus().http().status)
        }
    }

    @Test
    fun `TC-HOME-045 a dropped connection is a Network failure after the GET retries`() = runTest {
        env(member).use { e ->
            val drop = { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) }
            e.enqueue("/posts/today", drop(), drop(), drop())
            val error = assertIs<ApiResult.Failure>(e.repo.today()).error
            assertIs<ApiError.Network>(error)
            assertTrue(error.kind in NetworkKind.entries)
            assertEquals(3, e.requests("/posts/today").size)
        }
    }
}
