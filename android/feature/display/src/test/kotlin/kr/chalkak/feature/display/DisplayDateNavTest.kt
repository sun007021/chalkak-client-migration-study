package kr.chalkak.feature.display

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import java.time.LocalDate
import java.util.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Date range, navigation, clamping, boundaries and stale date answers (TC-DISP-028..040, 046). */
class DisplayDateNavTest {
    private val first = AppConstants.FIRST_TOPIC_DATE

    @Test
    fun `TC-DISP-028 at the first exhibition date previous is disabled and sends nothing, from the day after it goes to the first date`() = runTest {
        val atFirst = displayRig(now = "2026-09-17T03:00:00Z")
        atFirst.show()
        assertEquals(first, atFirst.s.date)
        assertFalse(atFirst.s.canGoPrevious)
        val calls = atFirst.repo.topics.calls.size
        atFirst.holder.onPreviousDate(); atFirst.idle()
        assertEquals(calls, atFirst.repo.topics.calls.size)
        assertEquals(first, atFirst.s.date)

        val r = displayRig(now = "2026-09-18T03:00:00Z", auto = false)
        r.repo.topics.always(LocalDate.of(2026, 9, 18), kr.chalkak.core.network.ApiResult.Success(PostFixtures.topicFor(LocalDate.of(2026, 9, 18))))
        r.repo.topics.always(first, PostFixtures.topicResult("display/topics__first-date-2026-09-17.json"))
        r.repo.posts.default = { kr.chalkak.core.network.ApiResult.Success(PostFixtures.pageFor(it)) }
        r.show()
        assertTrue(r.s.canGoPrevious)
        r.holder.onPreviousDate(); r.idle()
        assertEquals(first, r.s.date)
        assertEquals(first, r.repo.topics.calls.last())
        assertFalse(r.s.canGoPrevious)
        assertEquals("처음 만나는 하늘", r.s.topic?.title)
    }

    @Test
    fun `TC-DISP-029 today has no next, yesterday's next is today`() = runTest {
        val r = displayRig()
        r.show()
        assertFalse(r.s.canGoNext)
        val calls = r.repo.topics.calls.size
        r.holder.onNextDate(); r.idle()
        assertEquals(calls, r.repo.topics.calls.size)
        assertEquals(TODAY, r.s.date)

        val y = displayRig(initialDate = YESTERDAY)
        y.show()
        assertTrue(y.s.canGoNext)
        y.holder.onNextDate(); y.idle()
        assertEquals(TODAY, y.s.date)
        assertEquals(q(TODAY, PostSort.RECENT), y.repo.posts.calls.last())
    }

    @Test
    fun `TC-DISP-030 month and year boundaries produce exact yyyy-MM-dd topic dates`() = runTest {
        val cases = listOf(
            Triple("2026-11-20T03:00:00Z", LocalDate.of(2026, 10, 1), -1) to LocalDate.of(2026, 9, 30),
            Triple("2027-02-01T03:00:00Z", LocalDate.of(2027, 1, 1), -1) to LocalDate.of(2026, 12, 31),
            Triple("2027-02-01T03:00:00Z", LocalDate.of(2026, 12, 31), +1) to LocalDate.of(2027, 1, 1),
        )
        for ((input, expected) in cases) {
            val (now, start, step) = input
            val r = displayRig(now = now, initialDate = start)
            r.show()
            if (step < 0) r.holder.onPreviousDate() else r.holder.onNextDate()
            r.idle()
            assertEquals(expected, r.repo.topics.calls.last(), "$start $step")
            assertEquals(expected, r.s.date)
            assertEquals(expected.toString(), r.s.topic?.topicDate)
        }
    }

    @Test
    fun `TC-DISP-031 a previous date without a topic restores the shown exhibition with a toast and keeps the first date constant`() = runTest {
        val r = displayRig()
        r.show()
        val before = r.s
        r.repo.topics.enqueue(YESTERDAY, PostFixtures.failure("display/topics__404-not-found.json"))
        r.holder.onPreviousDate(); r.idle()
        assertEquals(TODAY, r.s.date)
        assertEquals(before.photos, r.s.photos)
        assertEquals(before.topic, r.s.topic)
        assertEquals(DisplayStatus.Content, r.s.status)
        assertEquals(first, r.s.earliestDate)
        assertEquals("display.date-missing", r.toasts().single().copyKey)
        assertEquals("해당 날짜의 전시가 없어요", Copy["display.date-missing"])
        assertEquals(first, AppConstants.FIRST_TOPIC_DATE)
        assertTrue(r.s.canGoPrevious)
    }

    @Test
    fun `TC-DISP-032 jumping over several days to a date without a topic restores the previous exhibition`() = runTest {
        val r = displayRig()
        r.show()
        val before = r.s
        val target = LocalDate.of(2026, 10, 1)
        r.repo.topics.enqueue(target, PostFixtures.failure("display/topics__404-not-found.json"))
        r.holder.onDateSelected(target); r.idle()
        assertEquals(TODAY, r.s.date)
        assertEquals(before.photos, r.s.photos)
        assertEquals(first, r.s.earliestDate)
        assertEquals("display.date-missing", r.toasts().single().copyKey)
    }

    @Test
    fun `TC-DISP-033 a failure while moving restores the content with a toast and creates no boundary`() = runTest {
        val net = displayRig()
        net.show()
        val before = net.s
        net.repo.topics.enqueue(YESTERDAY, PostFixtures.network())
        net.holder.onPreviousDate(); net.idle()
        assertEquals(TODAY, net.s.date)
        assertEquals(before.photos, net.s.photos)
        assertEquals("common.error.network", net.toasts().single().copyKey)
        assertEquals(first, net.s.earliestDate)
        assertTrue(net.s.canGoPrevious)

        val server = displayRig()
        server.show()
        server.repo.topics.enqueue(YESTERDAY, PostFixtures.failure("display/topics__500-server-error.json"))
        server.holder.onPreviousDate(); server.idle()
        assertEquals(TODAY, server.s.date)
        assertEquals(DisplayStatus.Content, server.s.status)
        assertEquals("display.error", server.toasts().single().copyKey)
    }

    @Test
    fun `TC-DISP-034 dates outside the range are clamped to the nearest end before loading`() = runTest {
        val r = displayRig()
        r.show()
        r.holder.onDateSelected(LocalDate.of(2026, 9, 1)); r.idle()
        assertEquals(first, r.repo.topics.calls.last())
        assertEquals(first, r.s.date)

        val y = displayRig(initialDate = LocalDate.of(2026, 10, 20))
        y.show()
        y.holder.onDateSelected(LocalDate.of(2026, 10, 28)); y.idle() // tomorrow
        assertEquals(TODAY, y.repo.topics.calls.last())
        assertEquals(TODAY, y.s.date)
    }

    @Test
    fun `TC-DISP-035 selecting the shown date again sends nothing`() = runTest {
        val r = displayRig()
        r.show()
        val topics = r.repo.topics.calls.size
        val posts = r.repo.posts.calls.size
        r.holder.onDateSelected(TODAY); r.idle()
        assertEquals(topics, r.repo.topics.calls.size)
        assertEquals(posts, r.repo.posts.calls.size)
        val future = r.s
        r.holder.onDateSelected(LocalDate.of(2026, 10, 30)); r.idle() // clamps to the shown date, still no request
        assertEquals(topics, r.repo.topics.calls.size)
        assertEquals(future.date, r.s.date)
    }

    @Test
    fun `TC-DISP-038 rapid previous taps end on the last target even when the answers come back out of order`() = runTest {
        val r = displayRig()
        r.show()
        val d1 = LocalDate.of(2026, 10, 26)
        val d2 = LocalDate.of(2026, 10, 25)
        val d3 = LocalDate.of(2026, 10, 24)
        val g1 = gated(PostFixtures.topicResult("display/topics__open-2026-10-26.json"))
        val g2 = gated(kr.chalkak.core.network.ApiResult.Success(PostFixtures.topicFor(d2)))
        val g3 = gated(kr.chalkak.core.network.ApiResult.Success(PostFixtures.topicFor(d3)))
        r.repo.topics.enqueue(d1, g1)
        r.repo.topics.enqueue(d2, g2)
        r.repo.topics.enqueue(d3, g3)
        r.holder.onPreviousDate(); runCurrent()
        r.holder.onPreviousDate(); runCurrent()
        r.holder.onPreviousDate(); runCurrent()
        g3.release(); advanceUntilIdle()
        g1.release(); advanceUntilIdle()
        g2.release(); advanceUntilIdle()
        assertEquals(d3, r.s.date)
        assertEquals(d3.toString(), r.s.topic?.topicDate)
        assertEquals(DisplayStatus.Content, r.s.status)
    }

    @Test
    fun `TC-DISP-046 a slow answer of an earlier date never overwrites the date moved to afterwards`() = runTest {
        val r = displayRig()
        r.show()
        val a = LocalDate.of(2026, 10, 26)
        val b = LocalDate.of(2026, 10, 25)
        val slowA = gated(PostFixtures.topicResult("display/topics__open-2026-10-26.json"))
        r.repo.topics.enqueue(a, slowA)
        r.holder.onDateSelected(a); runCurrent()
        r.holder.onDateSelected(b); advanceUntilIdle()
        assertEquals(b, r.s.date)
        val shown = r.s.photos
        slowA.release(); advanceUntilIdle()
        assertEquals(b, r.s.date)
        assertEquals(b.toString(), r.s.topic?.topicDate)
        assertEquals(shown, r.s.photos)
        assertTrue(r.toasts().isEmpty())
    }

    @Test
    fun `TC-DISP-039 the upper bound is KST today - 23_59_59 KST is still the 27th, 00_00_00 KST is the 28th, in any device zone`() = runTest {
        val old = TimeZone.getDefault()
        try {
            for (zone in listOf("UTC", "America/Los_Angeles", "Asia/Seoul")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone))
                val before = displayRig(now = "2026-10-27T14:59:59Z")
                before.show()
                assertEquals(LocalDate.of(2026, 10, 27), before.s.latestDate, zone)
                assertEquals(LocalDate.of(2026, 10, 27), before.s.date, zone)
                assertFalse(before.s.canGoNext, zone)

                val after = displayRig(now = "2026-10-27T15:00:00Z")
                after.show()
                assertEquals(LocalDate.of(2026, 10, 28), after.s.latestDate, zone)
                assertEquals(LocalDate.of(2026, 10, 28), after.s.date, zone)
            }
        } finally {
            TimeZone.setDefault(old)
        }
    }

    @Test
    fun `TC-DISP-040 after midnight the upper bound moves on the next show, the viewed date stays and becomes an archive`() = runTest {
        val r = displayRig(now = "2026-10-27T14:00:00Z")
        r.show()
        assertEquals(TODAY, r.s.latestDate)
        assertFalse(r.s.isArchive)
        r.clock.set("2026-10-27T15:30:00Z") // 00:30 KST on the 28th
        r.holder.onScreenHidden(); r.holder.onScreenShown(); r.idle()
        assertEquals(LocalDate.of(2026, 10, 28), r.s.latestDate)
        assertEquals(TODAY, r.s.date) // the viewed date is not changed
        assertTrue(r.s.canGoNext)
        assertTrue(r.s.isArchive) // yesterday is an archive from the next load on
        assertNotNull(r.s.topic)
        assertEquals(PostSort.POPULAR, r.repo.posts.calls.last().sort)
    }
}
