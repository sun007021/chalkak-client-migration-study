package kr.chalkak.feature.record

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.record.testing.RecordFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.auth.HomeMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Failure handling: error screen on a first load, kept content + toast on a revalidation (D-20). */
class RecordFailureTest {
    private val offline = ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE))

    private fun fail(path: String) = RecordFixtureModels.failure(path)

    // ---- first load: error screen ------------------------------------------------------------------

    @Test
    fun `TC-REC-032 a 500 on the first load is the generic error title with a retry button`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { fail("record/posts-calendar__500-server-error.json") }
        show(r)
        assertEquals(RecordPhase.Error, r.s.phase)
        assertEquals("기록을 불러오지 못했어요", Copy[r.s.error!!.titleCopyKey])
        assertEquals(RecordErrorAction.Retry, r.s.error!!.action)
        assertTrue(r.posts.isEmpty())
    }

    @Test
    fun `TC-REC-030 a 401 on the first load says login is needed and offers the login button`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { fail("record/posts-calendar__401-unauthorized.json") }
        show(r)
        assertEquals(RecordPhase.Error, r.s.phase)
        assertEquals("로그인이 필요해요", Copy[r.s.error!!.titleCopyKey])
        assertEquals(RecordErrorAction.Login, r.s.error!!.action)

        r.holder.onLoginTapped()
        advanceUntilIdle()
        assertEquals(listOf<RecordEffect>(RecordEffect.LoginRequired), r.nonToastEffects)
    }

    @Test
    fun `TC-REC-031 a 400 is the unsupported year-month message with a retry button`() = runTest {
        val r = rig()
        r.repo.calendarHandler = { fail("record/posts-calendar__400-invalid-month.json") }
        show(r)
        assertEquals(RecordPhase.Error, r.s.phase)
        assertEquals("조회할 수 없는 연월이에요", Copy[r.s.error!!.titleCopyKey])
        assertEquals(RecordErrorAction.Retry, r.s.error!!.action)
    }

    @Test
    fun `TC-REC-021 a month visited for the first time that fails is an error screen, not the previous month`() = runTest {
        val r = rig()
        show(r)
        r.repo.calendarHandler = { fail("record/posts-calendar__500-server-error.json") }
        r.holder.onPreviousMonth()
        advanceUntilIdle()
        assertEquals(SEP, r.s.month)
        assertEquals(RecordPhase.Error, r.s.phase)
        assertTrue(r.posts.isEmpty())
        assertTrue(r.toasts.isEmpty(), "no toast without content to keep")
    }

    @Test
    fun `TC-REC-029 offline on entry is the error screen and retry after the network is back loads the month`() = runTest {
        val r = rig()
        r.repo.monthsHandler = { offline }
        r.repo.calendarHandler = { offline }
        show(r)
        assertEquals(RecordPhase.Error, r.s.phase)
        assertEquals(RecordErrorAction.Retry, r.s.error!!.action)

        r.repo.monthsHandler = { ok(RecordFixtureModels.months("record/posts-calendar-months__recent-first.json")) }
        r.repo.calendarHandler = { ok(RecordFixtureModels.calendarFor(it)) }
        r.holder.onRetry()
        advanceUntilIdle()
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(null, r.s.error)
        assertEquals(3, r.posts.size)
    }

    // ---- months list failure (REQ-REC-008) ---------------------------------------------------------

    @Test
    fun `TC-REC-002 a failing month list still loads the current month and shows no toast`() = runTest {
        val r = rig()
        r.repo.monthsHandler = { offline }
        show(r)
        assertEquals(listOf(OCT), r.s.availableMonths)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(3, r.posts.size)
        assertTrue(r.toasts.isEmpty())
    }

    // ---- revalidation failure: keep content + toast ------------------------------------------------

    @Test
    fun `TC-REC-021 a failed revalidation of a cached month keeps the photos and shows the error toast`() = runTest {
        val r = rig()
        show(r)
        r.repo.calendarHandler = { fail("record/posts-calendar__500-server-error.json") }
        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(3, r.posts.size)
        assertEquals(false, r.s.revalidating)
        assertEquals(listOf("기록을 불러오지 못했어요"), r.toastTexts)
    }

    @Test
    fun `TC-REC-022 foreground revalidation that fails keeps the old photos`() = runTest {
        val r = rig()
        show(r)
        r.repo.calendarHandler = { fail("record/posts-calendar__500-server-error.json") }
        r.holder.onForeground()
        advanceUntilIdle()
        assertEquals(3, r.posts.size)
        assertEquals(RecordPhase.Content, r.s.phase)
        assertEquals(1, r.toasts.size)
    }

    @Test
    fun `TC-REC-029 offline revalidation keeps the cache and shows the network toast`() = runTest {
        val r = rig()
        show(r)
        r.repo.calendarHandler = { offline }
        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(3, r.posts.size)
        assertEquals(listOf("네트워크 연결을 확인해 주세요."), r.toastTexts)
    }

    @Test
    fun `TC-REC-021 the same failure twice in a row toasts twice with different ids`() = runTest {
        val r = rig()
        show(r)
        r.repo.calendarHandler = { fail("record/posts-calendar__500-server-error.json") }
        r.holder.onShown()
        advanceUntilIdle()
        r.holder.onShown()
        advanceUntilIdle()
        assertEquals(2, r.toasts.size)
        assertEquals(2, r.toasts.map { it.id }.toSet().size)
    }

    // ---- guest -------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-033 a guest only gets the login toast, no request and no screen_view`() = runTest {
        val r = rig(mode = HomeMode.Guest)
        show(r)
        assertEquals(0, r.repo.totalCalls)
        assertEquals(listOf("기록을 보려면 로그인이 필요해요"), r.toastTexts)
        assertTrue(r.analytics.screens.isEmpty())
    }

    @Test
    fun `TC-REC-033 every guest entry and foreground stays at zero requests`() = runTest {
        val r = rig(mode = HomeMode.Guest)
        show(r)
        r.holder.onForeground()
        r.holder.onShown()
        r.holder.onRetry()
        advanceUntilIdle()
        assertEquals(0, r.repo.totalCalls)
    }
}
