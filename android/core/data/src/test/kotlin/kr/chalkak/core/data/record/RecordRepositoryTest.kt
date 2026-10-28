package kr.chalkak.core.data.record

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_2
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.refreshSuccess
import okhttp3.mockwebserver.MockResponse
import java.time.LocalDate
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** Repository level (C) tests of the record endpoints over MockWebServer + shared fixtures. */
class RecordRepositoryTest {
    private val clock = FakeClock()
    private val member get() = StoredSession.User(TestSessions.user(clock))
    private val oct = YearMonth.of(2026, 10)

    private class Env(val h: NetHarness, val repo: RecordRepository) : AutoCloseable {
        override fun close() = h.close()
    }

    private fun TestScope.env(initial: StoredSession): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultRecordRepository(h.client))
    }

    private fun fx(path: String) = MockResponses.fromFixture(path)

    private fun Env.enqueue(path: String, vararg responses: MockResponse) = h.dispatcher.enqueue(api(path), *responses)

    private fun Env.requests(path: String) = h.dispatcher.requests(api(path))

    private fun <T> ApiResult<T>.value(): T = assertIs<ApiResult.Success<T>>(this).value

    private fun ApiResult<*>.error(): ApiError = assertIs<ApiResult.Failure>(this).error

    private fun ApiResult<*>.http(): ApiError.Http = assertIs<ApiError.Http>(error())

    // ---- months ------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-002 months come back newest first and a member token is sent`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar/months", fx("record/posts-calendar-months__recent-first.json"))
            assertEquals(listOf(YearMonth.of(2026, 10), YearMonth.of(2026, 9)), e.repo.months().value())
            assertEquals("Bearer fixture-access-token-1", e.requests("/posts/calendar/months").single().getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-REC-002 an unsorted months answer with a duplicate is sorted newest first without duplicates`() = runTest {
        env(member).use { e ->
            val body = """{"months":[{"year":2026,"month":9},{"year":2025,"month":12},{"year":2026,"month":10},{"year":2026,"month":9}]}"""
            e.enqueue("/posts/calendar/months", MockResponses.json(200, body))
            assertEquals(
                listOf(YearMonth.of(2026, 10), YearMonth.of(2026, 9), YearMonth.of(2025, 12)),
                e.repo.months().value(),
            )
        }
    }

    @Test
    fun `TC-REC-002 an empty months answer is an empty list and not an error`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar/months", fx("record/posts-calendar-months__empty.json"))
            assertEquals(emptyList(), e.repo.months().value())
        }
    }

    @Test
    fun `TC-REC-018 multi-year months keep every year newest first`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar/months", fx("record/posts-calendar-months__multi-year.json"))
            assertEquals(
                listOf(YearMonth.of(2026, 10), YearMonth.of(2026, 9), YearMonth.of(2025, 12), YearMonth.of(2025, 3)),
                e.repo.months().value(),
            )
        }
    }

    // ---- calendar: query and mapping ---------------------------------------------------------------

    @Test
    fun `TC-REC-017 calendar sends year and month as plain numbers`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__2026-09.json"), fx("record/posts-calendar__2026-10.json"))
            e.repo.calendar(YearMonth.of(2026, 9)).value()
            e.repo.calendar(oct).value()
            val q = e.requests("/posts/calendar").map { it.requestUrl!! }
            assertEquals(listOf("2026" to "9", "2026" to "10"), q.map { it.queryParameter("year") to it.queryParameter("month") })
        }
    }

    @Test
    fun `TC-REC-008 entries are placed by the topic date string, 10-31 stays in October`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__2026-10.json"))
            val posts = e.repo.calendar(oct).value()
            assertEquals(
                listOf(LocalDate.of(2026, 10, 20), LocalDate.of(2026, 10, 27), LocalDate.of(2026, 10, 31)),
                posts.map { it.topicDate },
            )
            assertEquals(
                listOf(RecordPostStatus.APPROVED, RecordPostStatus.PENDING, RecordPostStatus.APPROVED),
                posts.map { it.status },
            )
            assertEquals("22222222-2222-4222-8222-222222222291", posts.last().postId)
            assertEquals(
                "https://cdn.example.test/posts/22222222-2222-4222-8222-222222222291/thumbnail.webp",
                posts.last().thumbnailImageUrl,
            )
        }
    }

    @Test
    fun `TC-REC-015 a shuffled answer holds the same entries as the sorted one`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__2026-10.json"), fx("record/posts-calendar__2026-10-shuffled.json"))
            val sorted = e.repo.calendar(oct).value()
            val shuffled = e.repo.calendar(oct).value()
            assertEquals(sorted.toSet(), shuffled.toSet())
        }
    }

    @Test
    fun `TC-REC-004 an empty month is a successful empty list`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__2026-08-empty.json"))
            assertEquals(emptyList(), e.repo.calendar(YearMonth.of(2026, 8)).value())
        }
    }

    // ---- calendar: response validation (REQ-REC-018) -----------------------------------------------

    @Test
    fun `TC-REC-012 a response for another month is an InvalidResponse failure`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__month-mismatch.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.calendar(oct).error())
        }
    }

    @Test
    fun `TC-REC-013 a topic date outside the month is an InvalidResponse failure`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__date-out-of-month.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.calendar(oct).error())
        }
    }

    @Test
    fun `TC-REC-013 a duplicated date is an InvalidResponse failure`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__duplicate-date.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.calendar(oct).error())
        }
    }

    @Test
    fun `TC-REC-013 an empty thumbnail url is an InvalidResponse failure`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__empty-thumbnail.json"))
            assertIs<ApiError.InvalidResponse>(e.repo.calendar(oct).error())
        }
    }

    /**
     * Catalog (issue 1): REJECTED / unknown status -> "a day without a photo panel"; spec REQ-REC-018: the whole response is
     * a contract violation. Both agree on: no crash, and the REJECTED day (10/27) never shows up as a day with a photo.
     */
    @Test
    fun `TC-REC-014 REJECTED or unknown status never crashes and never yields a photo day for it`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__unknown-status.json"))
            when (val r = e.repo.calendar(oct)) {
                is ApiResult.Failure -> assertIs<ApiError.InvalidResponse>(r.error)
                is ApiResult.Success -> assertTrue(r.value.none { it.topicDate == LocalDate.of(2026, 10, 27) })
            }
        }
    }

    // ---- calendar: failures ------------------------------------------------------------------------

    @Test
    fun `TC-REC-030 401 refreshes once and the original GET is resent with the new token`() = runTest {
        env(member).use { e ->
            e.h.dispatcher.handle(api("/posts/calendar")) { req ->
                if (req.getHeader("Authorization") == BEARER_2) fx("record/posts-calendar__2026-10.json") else fx("record/posts-calendar__401-unauthorized.json")
            }
            e.enqueue("/auth/refresh", refreshSuccess())
            assertEquals(3, e.repo.calendar(oct).value().size)
            assertEquals(1, e.h.refreshRequests().size)
            assertEquals(2, e.requests("/posts/calendar").size)
        }
    }

    @Test
    fun `TC-REC-031 400 comes back as an Http 400 failure and is requested once`() = runTest {
        env(member).use { e ->
            e.enqueue("/posts/calendar", fx("record/posts-calendar__400-invalid-month.json"))
            val http = e.repo.calendar(oct).http()
            assertEquals(400, http.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, http.errorCode)
            assertEquals(1, e.requests("/posts/calendar").size)
        }
    }

    @Test
    fun `TC-REC-032 500 is retried twice (GET policy) and then an Http 500 failure`() = runTest {
        env(member).use { e ->
            e.enqueue(
                "/posts/calendar",
                fx("record/posts-calendar__500-server-error.json"),
                fx("record/posts-calendar__500-server-error.json"),
                fx("record/posts-calendar__500-server-error.json"),
            )
            val http = e.repo.calendar(oct).http()
            assertEquals(500, http.status)
            assertEquals(ErrorCode.INTERNAL_ERROR, http.errorCode)
            assertEquals(3, e.requests("/posts/calendar").size)
        }
    }
}
