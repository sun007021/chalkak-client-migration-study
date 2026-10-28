package kr.chalkak.feature.record

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.testing.RecordFixtureModels
import kr.chalkak.core.network.ApiResult
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Month arrows / picker, request economy, late answers, cache and revalidation. */
class RecordNavigationTest {
    private val aug = YearMonth.of(2026, 8)

    // ---- arrows and picker (REQ-REC-005/006) -------------------------------------------------------

    @Test
    fun `TC-REC-016 the previous arrow asks that month and a first visit clears the old content while loading`() = runTest {
        val r = rig()
        val gate = Gate<ApiResult<List<RecordPost>>>()
        show(r)
        r.repo.calendarHandler = { gate.await() }

        r.holder.onPreviousMonth()
        runCurrent()
        assertEquals(SEP, r.s.month)
        assertEquals(RecordPhase.Loading, r.s.phase)
        assertTrue(r.posts.isEmpty(), "October photos must not stay under September")
        assertEquals(listOf(OCT, SEP), r.repo.calendarCalls.toList())

        gate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-09.json")))
        advanceUntilIdle()
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(POST_SEP_30, r.post(D_SEP_30)?.postId)
    }

    @Test
    fun `TC-REC-016 a month without records can be visited and shows an empty grid`() = runTest {
        val r = rig(clock = novemberClock())
        show(r)
        assertEquals(NOV, r.s.month)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        assertEquals(OCT, r.s.month)
        r.holder.onNextMonth()
        advanceUntilIdle()
        assertEquals(NOV, r.s.month)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertTrue(r.posts.isEmpty())
    }

    @Test
    fun `TC-REC-016 arrows are disabled at the oldest and newest selectable month and then do nothing`() = runTest {
        val r = rig()
        show(r)
        assertEquals(false, r.s.canGoNext)
        assertEquals(true, r.s.canGoPrevious)
        r.holder.onNextMonth()
        advanceUntilIdle()
        assertEquals(OCT, r.s.month)

        r.holder.onPreviousMonth()
        advanceUntilIdle()
        assertEquals(SEP, r.s.month)
        assertEquals(false, r.s.canGoPrevious)
        assertEquals(true, r.s.canGoNext)
        val calls = r.repo.totalCalls
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        assertEquals(SEP, r.s.month)
        assertEquals(calls, r.repo.totalCalls)
    }

    @Test
    fun `TC-REC-017 picking the month already shown sends no request and changes nothing`() = runTest {
        val r = rig()
        show(r)
        val before = r.s
        val calls = r.repo.totalCalls
        r.holder.onMonthPicked(OCT)
        advanceUntilIdle()
        assertEquals(before, r.s)
        assertEquals(calls, r.repo.totalCalls)
    }

    @Test
    fun `TC-REC-017 picking a month outside the selectable list sends no request and changes nothing`() = runTest {
        val r = rig()
        show(r)
        val before = r.s
        val calls = r.repo.totalCalls
        r.holder.onMonthPicked(aug)
        advanceUntilIdle()
        assertEquals(before, r.s)
        assertEquals(calls, r.repo.totalCalls)
    }

    @Test
    fun `TC-REC-016 picking a listed month moves there and asks its calendar`() = runTest {
        val r = rig()
        show(r)
        r.holder.onMonthPicked(SEP)
        advanceUntilIdle()
        assertEquals(SEP, r.s.month)
        assertEquals(D_SEP_30, r.s.selectedDate)
        assertEquals(1, r.repo.calendarCallsFor(SEP))
    }

    // ---- late answers (REQ-REC-026) ----------------------------------------------------------------

    @Test
    fun `TC-REC-019 a September answer that arrives after going back to October never overwrites October`() = runTest {
        val r = rig()
        show(r)
        val sepGate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { m -> if (m == SEP) sepGate.await() else ok(RecordFixtureModels.calendarFor(m)) }

        r.holder.onPreviousMonth()
        runCurrent()
        r.holder.onNextMonth()
        advanceUntilIdle()
        assertEquals(OCT, r.s.month)

        sepGate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-09.json")))
        advanceUntilIdle()
        assertEquals(OCT, r.s.month)
        assertEquals(POST_OCT_31, r.post(D_OCT_31)?.postId)
        assertTrue(r.posts.none { it.topicDate.month.value == 9 })
        assertEquals(D_OCT_31, r.s.selectedDate)
    }

    @Test
    fun `TC-REC-019 rapid taps through three months show only the last one whatever order the answers come in`() = runTest {
        val r = rig(clock = novemberClock())
        r.repo.monthsHandler = { ok(RecordFixtureModels.months("record/posts-calendar-months__recent-first.json")) }
        show(r) // NOV current, OCT, SEP selectable
        val gates = mapOf(OCT to Gate<ApiResult<List<RecordPost>>>(), SEP to Gate<ApiResult<List<RecordPost>>>())
        r.repo.calendarHandler = { m -> gates.getValue(m).await() }

        r.holder.onPreviousMonth()
        runCurrent()
        r.holder.onPreviousMonth()
        runCurrent()
        assertEquals(SEP, r.s.month)

        gates.getValue(SEP).complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-09.json")))
        advanceUntilIdle()
        gates.getValue(OCT).complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10.json")))
        advanceUntilIdle()

        assertEquals(SEP, r.s.month)
        assertEquals(setOf(POST_SEP_17, POST_SEP_30), r.posts.map { it.postId }.toSet())
    }

    // ---- cache and revalidation (REQ-REC-021..023) -------------------------------------------------

    @Test
    fun `TC-REC-020 returning to a month shows the cached photos at once and swaps in the fresh answer`() = runTest {
        val r = rig()
        show(r)
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        val gate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { gate.await() }

        r.holder.onNextMonth()
        runCurrent()
        assertEquals(OCT, r.s.month)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(true, r.s.revalidating)
        assertEquals(3, r.posts.size, "cached photos first")

        gate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")))
        advanceUntilIdle()
        assertEquals(false, r.s.revalidating)
        assertEquals(2, r.posts.size, "fresh answer replaces the cache")
        assertEquals(2, r.repo.calendarCallsFor(OCT))
    }

    @Test
    fun `TC-REC-022 re-entering keeps the photos while asking again and replaces them with the newer answer`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")) }
        show(r)
        assertEquals(2, r.posts.size)
        val gate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { gate.await() }

        r.holder.onShown()
        runCurrent()
        assertEquals(2, r.posts.size)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(true, r.s.revalidating)

        gate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10.json")))
        advanceUntilIdle()
        assertEquals(3, r.posts.size)
        assertEquals(false, r.s.revalidating)
    }

    @Test
    fun `TC-REC-043 a photo uploaded meanwhile appears on today's cell after the tab is re-entered`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")) }
        show(r)
        assertEquals(null, r.post(D_OCT_27))
        r.repo.calendarHandler = { ok(RecordFixtureModels.calendarFor(it)) }

        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(POST_OCT_27, r.post(D_OCT_27)?.postId)
    }

    // ---- lifecycle and account ---------------------------------------------------------------------

    @Test
    fun `TC-REC-027 leaving during the first load leaves Loading, no error and no toast, and coming back loads`() = runTest {
        val r = rig()
        val gate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { gate.await() }
        r.holder.onShown()
        runCurrent()
        r.holder.onScreenGone()
        gate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10.json")))
        advanceUntilIdle()

        assertEquals(RecordPhase.Loading, r.s.phase)
        assertEquals(null, r.s.error)
        assertTrue(r.toasts.isEmpty())

        r.repo.calendarHandler = { ok(RecordFixtureModels.calendarFor(it)) }
        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(3, r.posts.size)
    }

    @Test
    fun `TC-REC-028 an account change drops the cache and selection and ignores the old account's late answer`() = runTest {
        val r = rig()
        show(r)
        r.holder.onDateSelected(D_OCT_20)
        val oldGate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { m -> if (m == SEP) oldGate.await() else ok(RecordFixtureModels.calendarFor(m)) }
        r.holder.onPreviousMonth()
        runCurrent()

        val newGate = Gate<ApiResult<List<RecordPost>>>()
        r.repo.calendarHandler = { newGate.await() }
        r.holder.onAccountChanged(kr.chalkak.feature.auth.HomeMode.Member)
        runCurrent()
        assertEquals(RecordPhase.Loading, r.s.phase, "no cached month of the previous account is shown")
        assertTrue(r.posts.isEmpty())
        assertEquals(null, r.s.selectedDate)
        assertEquals(OCT, r.s.month)

        oldGate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-09.json")))
        advanceUntilIdle()
        assertTrue(r.posts.isEmpty(), "late answer of the previous account must not land")
        assertEquals(RecordPhase.Loading, r.s.phase)

        newGate.complete(ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")))
        advanceUntilIdle()
        assertEquals(2, r.posts.size)
        assertEquals(D_OCT_31, r.s.selectedDate)
    }
}
