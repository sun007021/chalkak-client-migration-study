package kr.chalkak.feature.record

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.record.RecordPostStatus
import kr.chalkak.core.data.record.testing.RecordFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Entry, month list / current month (D-19), grid placement and selection. */
class RecordLoadTest {

    // ---- entry -------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-001 entering asks months and the KST current month once and goes Loading to Content`() = runTest {
        val r = rig()
        r.holder.onShown()
        assertEquals(RecordPhase.Loading, r.s.phase)
        advanceUntilIdle()

        assertEquals(1, r.repo.monthsCalls.size)
        assertEquals(listOf(OCT), r.repo.calendarCalls.toList())
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(OCT, r.s.month)
        assertEquals(OCT, r.s.currentMonth)
        assertTrue(r.states.map { it.phase }.indexOf(RecordPhase.Loading) < r.states.map { it.phase }.indexOf(RecordPhase.Content))
    }

    @Test
    fun `TC-REC-042 screen_view record is sent once when the screen appears and not again on foreground`() = runTest {
        val r = rig()
        show(r)
        r.holder.onForeground()
        advanceUntilIdle()
        assertEquals(listOf("record"), r.analytics.screens.toList())
    }

    // ---- month list --------------------------------------------------------------------------------

    @Test
    fun `TC-REC-002 selectable months are the server list newest first`() = runTest {
        val r = rig()
        show(r)
        assertEquals(listOf(OCT, SEP), r.s.availableMonths)
    }

    @Test
    fun `TC-REC-002 an unsorted list with a duplicate is shown newest first without duplicates`() = runTest {
        val r = rig()
        r.repo.monthsHandler = { ok(listOf(SEP, YearMonth.of(2025, 12), OCT, SEP)) }
        show(r)
        assertEquals(listOf(OCT, SEP, YearMonth.of(2025, 12)), r.s.availableMonths)
    }

    @Test
    fun `TC-REC-002 an empty month list is no error and only the current month is selectable`() = runTest {
        val r = rig()
        r.repo.monthsHandler = { ok(RecordFixtureModels.months("record/posts-calendar-months__empty.json")) }
        show(r)
        assertEquals(listOf(OCT), r.s.availableMonths)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertNull(r.s.error)
    }

    @Test
    fun `TC-REC-003 the current month is added when the server list lacks it`() = runTest {
        val r = rig()
        r.repo.monthsHandler = { ok(RecordFixtureModels.months("record/posts-calendar-months__without-current.json")) }
        show(r)
        assertEquals(listOf(OCT, SEP), r.s.availableMonths)
        assertEquals(OCT, r.s.month)
    }

    @Test
    fun `TC-REC-018 a multi-year list keeps every year and arrows cross the year boundary`() = runTest {
        val r = rig()
        r.repo.monthsHandler = { ok(RecordFixtureModels.months("record/posts-calendar-months__multi-year.json")) }
        show(r)
        assertEquals(
            listOf(OCT, SEP, YearMonth.of(2025, 12), YearMonth.of(2025, 3)),
            r.s.availableMonths,
        )
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        assertEquals(YearMonth.of(2025, 12), r.s.month)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        assertEquals(YearMonth.of(2025, 3), r.s.month)
        assertEquals(false, r.s.canGoPrevious)
    }

    // ---- current month: KST, fake clock (D-19) -----------------------------------------------------

    @Test
    fun `TC-REC-005 KST 23-59-59 on Oct 31 is still October and KST midnight is November on any device zone`() = runTest {
        for (zone in listOf(null, "UTC", "America/Los_Angeles")) {
            val before = FakeClock().also { it.set("2026-10-31T14:59:59Z") }
            val after = FakeClock().also { it.set("2026-10-31T15:00:00Z") }
            fun first(clock: FakeClock): YearMonth {
                val body = {
                    val r = rig(clock = clock)
                    r.holder.onShown()
                    advanceUntilIdle()
                    r.s.currentMonth
                }
                return if (zone == null) body() else withDevice(zoneId = zone) { body() }
            }
            assertEquals(OCT, first(before), "zone=$zone before midnight")
            assertEquals(NOV, first(after), "zone=$zone after midnight")
        }
    }

    @Test
    fun `TC-REC-005 the first month shown is the current month, not a month fixed at process start`() = runTest {
        val clock = FakeClock().also { it.set("2026-10-31T15:00:00Z") }
        val r = rig(clock = clock)
        show(r)
        assertEquals(NOV, r.s.month)
        assertTrue(NOV in r.s.availableMonths)
        assertEquals(listOf(NOV), r.repo.calendarCalls.toList())
    }

    @Test
    fun `TC-REC-006 year end boundary 2026-12-31 23-59-59 KST is December and midnight is January 2027`() = runTest {
        val before = FakeClock().also { it.set("2026-12-31T14:59:59Z") }
        val after = FakeClock().also { it.set("2026-12-31T15:00:00Z") }
        val a = rig(clock = before)
        show(a)
        assertEquals(YearMonth.of(2026, 12), a.s.currentMonth)
        val b = rig(clock = after)
        show(b)
        assertEquals(YearMonth.of(2027, 1), b.s.currentMonth)
        assertEquals(YearMonth.of(2027, 1), b.s.month)
    }

    @Test
    fun `TC-REC-007 after the month changes in a live process re-entering recomputes the current month`() = runTest {
        val clock = FakeClock().also { it.set("2026-10-31T14:59:59Z") }
        val r = rig(clock = clock)
        show(r)
        assertEquals(OCT, r.s.currentMonth)

        clock.set("2026-10-31T15:00:00Z")
        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(NOV, r.s.currentMonth)
        assertTrue(NOV in r.s.availableMonths)
        assertEquals(NOV, r.s.availableMonths.first())
    }

    @Test
    fun `TC-REC-007 foreground after midnight updates the current month but keeps the viewed month and selected day`() = runTest {
        val clock = FakeClock().also { it.set("2026-10-31T14:59:59Z") }
        val r = rig(clock = clock)
        show(r)
        r.holder.onDateSelected(D_OCT_20)
        assertEquals(D_OCT_20, r.s.selectedDate)

        clock.set("2026-10-31T15:00:00Z")
        r.holder.onForeground()
        advanceUntilIdle()

        assertEquals(NOV, r.s.currentMonth)
        assertEquals(listOf(NOV, OCT, SEP), r.s.availableMonths)
        assertEquals(OCT, r.s.month)
        assertEquals(D_OCT_20, r.s.selectedDate)
    }

    // ---- grid placement ----------------------------------------------------------------------------

    @Test
    fun `TC-REC-008 the 10-31 photo sits on October 31 by its topic date`() = runTest {
        val r = rig()
        show(r)
        assertEquals(POST_OCT_31, r.post(D_OCT_31)?.postId)
        assertEquals(31, r.s.cells.count { it.date != null })
    }

    @Test
    fun `TC-REC-008 an October 31 entry does not appear in November`() = runTest {
        val r = rig(clock = novemberClock())
        show(r)
        assertEquals(NOV, r.s.month)
        assertTrue(r.posts.isEmpty())
        assertEquals(30, r.s.cells.count { it.date != null })
    }

    @Test
    fun `TC-REC-011 APPROVED shows its thumbnail, PENDING its thumbnail with the badge and other days stay empty`() = runTest {
        val r = rig()
        show(r)
        val approved = r.post(D_OCT_20)!!
        val pending = r.post(D_OCT_27)!!
        assertEquals(RecordPostStatus.APPROVED, approved.status)
        assertEquals("https://cdn.example.test/posts/$POST_OCT_20/thumbnail.webp", approved.thumbnailImageUrl)
        assertEquals(RecordPostStatus.PENDING, pending.status)
        assertNull(r.post(D_OCT_05))
        assertEquals(3, r.posts.size)

        r.holder.onDateSelected(D_OCT_20)
        assertEquals(false, r.s.panel!!.pendingBadge)
        r.holder.onDateSelected(D_OCT_27)
        assertEquals(true, r.s.panel!!.pendingBadge)
    }

    @Test
    fun `TC-REC-015 the answer order does not matter, every photo is on its own date cell`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-shuffled.json")) }
        show(r)
        assertEquals(POST_OCT_20, r.post(D_OCT_20)?.postId)
        assertEquals(POST_OCT_27, r.post(D_OCT_27)?.postId)
        assertEquals(POST_OCT_31, r.post(D_OCT_31)?.postId)
        assertEquals(3, r.posts.size)
        assertEquals(D_OCT_31, r.s.selectedDate)
    }

    @Test
    fun `TC-REC-012 a mismatching answer is the first-load error screen with retry`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { ApiResult.Failure(ApiError.InvalidResponse("month mismatch")) }
        show(r)
        assertEquals(RecordPhase.Error, r.s.phase)
        assertEquals("기록을 불러오지 못했어요", Copy[r.s.error!!.titleCopyKey])
        assertEquals(RecordErrorAction.Retry, r.s.error!!.action)
        assertTrue(r.posts.isEmpty())
    }

    // ---- selection ---------------------------------------------------------------------------------

    @Test
    fun `TC-REC-036 without a user choice the newest photo date is selected`() = runTest {
        val r = rig()
        show(r)
        assertEquals(D_OCT_31, r.s.selectedDate)
        assertEquals(POST_OCT_31, r.s.panel?.post?.postId)
    }

    @Test
    fun `TC-REC-036 a month without photos selects nothing`() = runTest {
        val r = rig(clock = novemberClock())
        show(r)
        assertNull(r.s.selectedDate)
        assertNull(r.s.panel)
    }

    @Test
    fun `TC-REC-037 an empty month is an empty grid, not an error`() = runTest {
        val r = rig(clock = novemberClock())
        show(r)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertNull(r.s.error)
        assertNotNull(r.s.cells.firstOrNull())
        assertTrue(r.toasts.isEmpty())
    }

    @Test
    fun `TC-REC-037 tapping a date without a photo changes nothing`() = runTest {
        val r = rig()
        show(r)
        val before = r.s
        r.holder.onDateSelected(D_OCT_05)
        assertEquals(before, r.s)
        assertEquals(D_OCT_31, r.s.selectedDate)
    }

    @Test
    fun `TC-REC-023 the chosen day survives the first answer and a later revalidation`() = runTest {
        val r = rig()
        show(r)
        r.holder.onDateSelected(D_OCT_20)
        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(D_OCT_20, r.s.selectedDate)
        r.holder.onForeground()
        advanceUntilIdle()
        assertEquals(D_OCT_20, r.s.selectedDate)
        assertEquals(POST_OCT_20, r.s.panel?.post?.postId)
    }
}
