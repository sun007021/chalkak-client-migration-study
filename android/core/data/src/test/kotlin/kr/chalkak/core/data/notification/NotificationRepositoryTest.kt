package kr.chalkak.core.data.notification

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.home.DefaultHomeRepository
import kr.chalkak.core.data.notification.testing.NotificationFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_1
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.refreshSuccess
import okhttp3.mockwebserver.MockResponse
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Notification endpoints over MockWebServer + `shared/fixtures/notification`. */
class NotificationRepositoryTest {
    private val clock = FakeClock()
    private val member get() = StoredSession.User(TestSessions.user(clock))
    private val id1 = "33333333-3333-4333-8333-333333333301"
    private val id2 = "33333333-3333-4333-8333-333333333302"
    private val list = api("/notifications")

    private class Env(val h: NetHarness, val repo: NotificationRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession = member): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultNotificationRepository(h.client))
    }

    private fun fx(path: String, status: Int? = null) = MockResponses.fromFixture(path, status)

    private fun <T> ApiResult<T>.value(): T = assertIs<ApiResult.Success<T>>(this).value

    private fun ApiResult<*>.http(): ApiError.Http = assertIs<ApiError.Http>(assertIs<ApiResult.Failure>(this).error)

    private fun ApiResult<*>.failure(): ApiError = assertIs<ApiResult.Failure>(this).error

    private fun Env.enqueueList(vararg responses: MockResponse) = h.dispatcher.enqueue(list, *responses)

    /** Path answers 401 until the request carries the refreshed access token, then [ok]. */
    private fun Env.guard(path: String, ok: () -> MockResponse) {
        h.dispatcher.handle(path) { req ->
            if (req.getHeader("Authorization") == BEARER_2) ok() else fx("notification/notifications__unauthorized.json")
        }
    }

    // ---- list -----------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-002 first page is GET notifications page 1 pageSize 20 with the Bearer header`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__page1.json"))
            e.repo.list(1)
            val req = e.h.dispatcher.requests(list).single()
            assertEquals("GET", req.method)
            assertEquals("1", req.requestUrl!!.queryParameter("page"))
            assertEquals("20", req.requestUrl!!.queryParameter("pageSize"))
            assertEquals(BEARER_1, req.getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-NOTI-002 the next page asks for page 2 with the same page size`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__page2-last.json"))
            e.repo.list(2)
            val url = e.h.dispatcher.requests(list).single().requestUrl!!
            assertEquals("2", url.queryParameter("page"))
            assertEquals("20", url.queryParameter("pageSize"))
        }
    }

    @Test
    fun `TC-NOTI-003 page 1 is decoded field by field in server order`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__page1.json"))
            val page = e.repo.list(1).value()
            assertEquals(NotificationFixtureModels.page("notification/notifications__page1.json"), page)
            assertEquals(20, page.items.size)
            assertTrue(page.hasNext)
            assertEquals(1, page.currentPage)
            assertEquals(20, page.pageSize)
        }
    }

    @Test
    fun `TC-NOTI-003 null thumbnail, null readAt and null source fields are read as null`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__null-source.json"), fx("notification/notifications__topic-reminder.json"))
            val nullSource = e.repo.list(1).value().items.single()
            assertNull(nullSource.sourceType)
            assertNull(nullSource.sourceId)
            assertNull(nullSource.readAt)
            val topicReminder = e.repo.list(1).value().items
            assertEquals(listOf(NotificationType.TOPIC, NotificationType.REMINDER), topicReminder.map { it.type })
            assertTrue(topicReminder.all { it.thumbnailImageUrl == null })
        }
    }

    @Test
    fun `TC-NOTI-003 createdAt with and without fraction digits parses to the right Instant`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__kst-boundary.json"))
            val items = e.repo.list(1).value().items
            assertEquals(java.time.Instant.parse("2026-10-26T15:00:00Z"), items[0].createdAt)
            assertEquals(java.time.Instant.parse("2026-10-26T14:59:59Z"), items[1].createdAt)
            assertEquals(java.time.Instant.parse("2026-10-26T15:00:00.123Z"), items[2].createdAt)
        }
    }

    @Test
    fun `TC-NOTI-024 an unknown type is kept as UNKNOWN with the raw text and does not fail the page`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__unknown-type.json"))
            val item = e.repo.list(1).value().items.single()
            assertEquals(NotificationType.UNKNOWN, item.type)
            assertEquals("FUTURE_TYPE", item.rawType)
            assertNull(item.sourceType)
        }
    }

    @Test
    fun `TC-NOTI-008 a response with a missing required field is an InvalidResponse failure`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__missing-fields.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.list(1).failure())
        }
    }

    @Test
    fun `TC-NOTI-008 a broken JSON body is an InvalidResponse failure and does not throw`() = runTest {
        env().use { e ->
            e.enqueueList(MockResponses.json(200, """{"currentPage":1,"notifications":["""))
            assertIs<ApiError.InvalidResponse>(e.repo.list(1).failure())
        }
    }

    @Test
    fun `TC-NOTI-023 the repository does not filter by date (30 day boundary rows all come back)`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__30day-boundary.json"))
            assertEquals(2, e.repo.list(1).value().items.size)
        }
    }

    @Test
    fun `TC-NOTI-009 a 401 on the list refreshes once and resends with the new token`() = runTest {
        env().use { e ->
            e.guard(list) { fx("notification/notifications__page1.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertEquals(20, e.repo.list(1).value().items.size)
            assertEquals(2, e.h.dispatcher.requests(list).size)
            assertEquals(1, e.h.refreshRequests().size)
        }
    }

    @Test
    fun `TC-NOTI-009 REAUTHENTICATION_REQUIRED on the refresh clears the session and asks for the login screen`() = runTest {
        env().use { e ->
            e.guard(list) { fx("notification/notifications__page1.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), fx("auth/refresh__reauthentication-required.json"))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, e.repo.list(1).http().errorCode)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), e.h.events.events.toList())
            assertEquals(StoredSession.None, e.h.store.current)
        }
    }

    @Test
    fun `TC-NOTI-006 a 500 on the list is an Http 500 failure after the D-21 retries`() = runTest {
        env().use { e ->
            val server500 = { fx("notification/notifications__internal-error.json") }
            e.enqueueList(server500(), server500(), server500())
            assertEquals(500, e.repo.list(1).http().status)
            assertEquals(3, e.h.dispatcher.requests(list).size)
        }
    }

    // ---- detail ---------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-042 a rejected detail carries the original photo URL and the rejection reason`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/notifications/$id2"), fx("notification/notification-detail__rejected.json"))
            val detail = e.repo.detail(id2).value()
            assertEquals(NotificationFixtureModels.detail("notification/notification-detail__rejected.json"), detail)
            assertEquals(NotificationType.POST_REJECTED, detail.type)
        }
    }

    @Test
    fun `TC-NOTI-044 a notice detail has title and full body and null photo and reason`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/notifications/33333333-3333-4333-8333-333333333305"), fx("notification/notification-detail__notice.json"))
            val detail = e.repo.detail("33333333-3333-4333-8333-333333333305").value()
            assertEquals(NotificationType.NOTICE, detail.type)
            assertNull(detail.originalImageUrl)
            assertNull(detail.rejectionReason)
            assertTrue("\n" in detail.body)
        }
    }

    @Test
    fun `TC-NOTI-047 an approved detail decodes with or without a photo`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/notifications/$id1"), fx("notification/notification-detail__approved.json"))
            val detail = e.repo.detail(id1).value()
            assertEquals(NotificationType.POST_APPROVED, detail.type)
            assertNull(detail.rejectionReason)
        }
    }

    @Test
    fun `TC-NOTI-045 a 404 on the detail is an Http 404 BUSINESS_ERROR failure`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/notifications/33333333-3333-4333-8333-333333333399"), fx("notification/notification-detail__not-found.json"))
            val http = e.repo.detail("33333333-3333-4333-8333-333333333399").http()
            assertEquals(404, http.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, http.errorCode)
        }
    }

    @Test
    fun `TC-NOTI-046 a 500 on the detail is retried twice then reported as Http 500`() = runTest {
        env().use { e ->
            val path = api("/notifications/$id1")
            repeat(3) { e.h.dispatcher.enqueue(path, fx("notification/notification-detail__internal-error.json")) }
            assertEquals(500, e.repo.detail(id1).http().status)
            assertEquals(3, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-NOTI-041 reading list and detail sends no PATCH read request at all`() = runTest {
        env().use { e ->
            e.enqueueList(fx("notification/notifications__page1.json"))
            e.h.dispatcher.enqueue(api("/notifications/$id2"), fx("notification/notification-detail__rejected.json"))
            e.repo.list(1)
            e.repo.detail(id2)
            assertTrue(e.h.dispatcher.recorded.none { it.method == "PATCH" })
            assertTrue(e.h.dispatcher.recorded.none { it.requestUrl!!.encodedPath.contains("read-all") })
        }
    }

    // ---- read -----------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-027 read is PATCH notifications id read with no body and 204 is Success`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/notifications/$id1/read"), fx("notification/notification-read__no-content.json"))
            assertEquals(Unit, e.repo.markRead(id1).value())
            val req = e.h.dispatcher.requests(api("/notifications/$id1/read")).single()
            assertEquals("PATCH", req.method)
            assertEquals(0L, req.bodySize)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-PUSH-048 an upper-case notification id is sent lower-case in the path`() = runTest {
        env().use { e ->
            val lower = "abcdef01-aaaa-4aaa-8aaa-abcdefabcdef"
            e.h.dispatcher.enqueue(api("/notifications/$lower/read"), fx("notification/notification-read__no-content.json"))
            assertEquals(Unit, e.repo.markRead(lower.uppercase()).value())
            assertEquals(1, e.h.dispatcher.requests(api("/notifications/$lower/read")).size)
        }
    }

    @Test
    fun `TC-NOTI-033 a 404 on read is an Http 404 BUSINESS_ERROR failure`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/notifications/$id1/read"), fx("notification/notification-read__not-found.json"))
            val http = e.repo.markRead(id1).http()
            assertEquals(404, http.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, http.errorCode)
        }
    }

    @Test
    fun `TC-NOTI-034 a 500 on read is retried twice (PATCH is idempotent) then reported as Http 500`() = runTest {
        env().use { e ->
            val path = api("/notifications/$id1/read")
            repeat(3) { e.h.dispatcher.enqueue(path, fx("notification/notification-read__internal-error.json")) }
            assertEquals(500, e.repo.markRead(id1).http().status)
            assertEquals(3, e.h.dispatcher.requests(path).size)
        }
    }

    @Test
    fun `TC-NOTI-035 a 401 on read refreshes once and resends the PATCH with the new token`() = runTest {
        env().use { e ->
            val path = api("/notifications/$id1/read")
            e.guard(path) { fx("notification/notification-read__no-content.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertEquals(Unit, e.repo.markRead(id1).value())
            assertEquals(listOf(BEARER_1, BEARER_2), e.h.dispatcher.requests(path).map { it.getHeader("Authorization") })
        }
    }

    @Test
    fun `TC-NOTI-035 REAUTHENTICATION_REQUIRED on read fails with the login event and no resend`() = runTest {
        env().use { e ->
            val path = api("/notifications/$id1/read")
            e.guard(path) { fx("notification/notification-read__no-content.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), fx("auth/refresh__reauthentication-required.json"))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, e.repo.markRead(id1).http().errorCode)
            assertEquals(1, e.h.dispatcher.requests(path).size)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), e.h.events.events.toList())
        }
    }

    // ---- unread-status (home owns the call; auth handling asserted here) -------------------------

    @Test
    fun `TC-NOTI-055 unread-status 401 refreshes once and resends, REAUTH goes to the login screen`() = runTest {
        env().use { e ->
            val path = api("/notifications/unread-status")
            e.guard(path) { fx("notification/unread-status__true.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val home = DefaultHomeRepository(e.h.client)
            assertEquals(true, home.unreadStatus().value())
            assertEquals(2, e.h.dispatcher.requests(path).size)
        }
        env().use { e ->
            val path = api("/notifications/unread-status")
            e.guard(path) { fx("notification/unread-status__true.json") }
            e.h.dispatcher.enqueue(api("/auth/refresh"), fx("auth/refresh__reauthentication-required.json"))
            assertEquals(ErrorCode.REAUTHENTICATION_REQUIRED, DefaultHomeRepository(e.h.client).unreadStatus().http().errorCode)
            assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), e.h.events.events.toList())
        }
    }
}
