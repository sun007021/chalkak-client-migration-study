package com.stonefive.chalkak.ui.record

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.RECORD_OCT
import com.stonefive.chalkak.testing.RECORD_POST_OCT_20
import com.stonefive.chalkak.testing.RECORD_POST_OCT_31
import com.stonefive.chalkak.testing.RECORD_SEP
import com.stonefive.chalkak.testing.RECORD_TODAY
import com.stonefive.chalkak.testing.RecordHarness
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.recordThumb
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.data.record.testing.RecordFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.record.RecordPhase
import kr.chalkak.feature.record.SaveOutcome
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * `RecordRoute` over a real `RecordStateHolder` (fixtures of `shared/fixtures/record`, 2026-10-27 KST): shown / gone / foreground
 * drive the holder, taps go through it, its effects become toasts and navigation callbacks.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1400dp")
class RecordRouteTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private val images = ImageProbe()
    private val toasts = CopyOnWriteArrayList<String>()
    private val feeds = CopyOnWriteArrayList<FeedEntry.FromRecord>()
    private val displays = CopyOnWriteArrayList<LocalDate>()
    private var logins = 0
    private var h = RecordHarness()

    @After
    fun tearDown() = h.close()

    private fun start(
        now: String? = null,
        requestedDate: LocalDate? = null,
        setup: kr.chalkak.core.data.record.testing.FakeRecordRepository.() -> Unit = {},
    ) {
        h.close()
        h = RecordHarness(now = now, setup = setup)
        rule.setContent { Route(requestedDate) }
        rule.waitForIdle()
    }

    @androidx.compose.runtime.Composable
    private fun Route(requestedDate: LocalDate? = null) {
        TestApp(copy) {
            RecordRoute(
                holder = h.holder,
                image = images.slot,
                showToast = { toasts += it },
                onOpenFeed = { feeds += it },
                onOpenDisplay = { displays += it },
                onLoginRequired = { logins++ },
                requestedDate = requestedDate,
                today = { RECORD_TODAY },
            )
        }
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    private fun tap(t: String) {
        tag(t).performClick()
        rule.waitForIdle()
    }

    private fun day(d: String) = "record.day-2026-$d"

    /** Activity paused then resumed: "app back in the foreground while the screen is visible". */
    private fun backgroundAndForeground() {
        rule.activityRule.scenario.moveToState(Lifecycle.State.STARTED)
        rule.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        rule.waitForIdle()
    }

    private val failure500 get() = RecordFixtureModels.failure("record/posts-calendar__500-server-error.json")

    // ---- 진입 (TC-REC-001, TC-REC-036) ------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-001 화면이 보이면 월 목록과 현재 달 달력을 한 번씩 불러와 로딩에서 내용으로 바뀐다`() {
        val gate = CompletableDeferred<Unit>()
        start { calendarHandler = { month -> gate.await(); ApiResult.Success(RecordFixtureModels.calendarFor(month)) } }
        tag("record.loading").assertIsDisplayed()
        count("record.calendar-grid").assertCountEquals(0)

        gate.complete(Unit)
        rule.waitForIdle()
        tag("record.calendar-grid").assertIsDisplayed()
        count("record.loading").assertCountEquals(0)
        assertEquals(1, h.repo.monthsCalls.size)
        assertEquals(listOf(RECORD_OCT), h.repo.calendarCalls.toList())
        tag("record.month-label").assertTextEquals("2026년 10월")
    }

    @Test
    fun `TC-REC-036 처음 들어오면 가장 최근 기록 날짜가 선택되어 있다`() {
        start()
        tag(day("10-31")).assertIsSelected()
    }

    @Test
    fun `TC-REC-025 홈에서 이전 달 날짜로 들어오면 그 달과 날짜가 선택된다`() {
        start(requestedDate = LocalDate.of(2026, 9, 17))
        tag("record.month-label").assertTextEquals("2026년 9월")
        tag(day("09-17")).assertIsSelected()
        assertTrue(RECORD_SEP in h.repo.calendarCalls)
    }

    @Test
    fun `TC-REC-025 홈에서 이번 달 날짜로 들어오면 최신 사진보다 그 날짜가 우선한다`() {
        start(requestedDate = LocalDate.of(2026, 10, 27))
        tag(day("10-27")).assertIsSelected()
        tag("record.pending-badge").assertExists()
    }

    // ---- 화면 생명주기 (TC-REC-027, TC-REC-007/022) --------------------------------------------------------------------------------

    @Test
    fun `TC-REC-027 첫 조회 중 화면을 벗어나면 오류도 토스트도 없이 로딩으로 남고 다시 나타나면 불러온다`() {
        val gate = CompletableDeferred<Unit>()
        var first = true
        var visible by mutableStateOf(true)
        h.close()
        h = RecordHarness {
            calendarHandler = { month ->
                if (first) { first = false; gate.await() }
                ApiResult.Success(RecordFixtureModels.calendarFor(month))
            }
        }
        rule.setContent { if (visible) Route() }
        rule.waitForIdle()
        tag("record.loading").assertIsDisplayed()

        visible = false
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(RecordPhase.Loading, h.state.phase)
        assertEquals(null, h.state.error)
        assertTrue(toasts.isEmpty())

        visible = true
        rule.awaitTag("record.calendar-grid")
        tag("record.calendar-grid").assertIsDisplayed()
        assertEquals(RecordPhase.Content, h.state.phase)
    }

    @Test
    fun `TC-REC-022 앱이 포그라운드로 돌아오면 같은 달을 다시 확인하고 새 기록을 반영한다`() {
        start { calendarHandler = { ApiResult.Success(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")) } }
        assertEquals(1, h.repo.calendarCalls.size)
        count("record.day-photo-2026-10-27").assertCountEquals(0)

        h.repo.calendarHandler = { ApiResult.Success(RecordFixtureModels.calendarFor(it)) }
        backgroundAndForeground()

        assertEquals(listOf(RECORD_OCT, RECORD_OCT), h.repo.calendarCalls.toList())
        rule.onNodeWithTag("record.day-photo-2026-10-27", useUnmergedTree = true).assertExists()
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-REC-022 재확인이 실패하면 기존 기록을 유지하고 토스트만 띄운다`() {
        start()
        h.repo.calendarHandler = { failure500 }
        backgroundAndForeground()

        assertEquals(listOf(copy["record.err.other"]), toasts.toList())
        tag("record.calendar-grid").assertIsDisplayed()
        rule.onNodeWithTag("record.day-photo-2026-10-31", useUnmergedTree = true).assertExists()
        count("record.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-REC-029 오프라인에서 재확인이 실패하면 기록을 유지하고 네트워크 확인 토스트를 띄운다`() {
        start()
        h.repo.calendarHandler = { ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE)) }
        backgroundAndForeground()

        assertEquals(listOf(copy["common.error.network"]), toasts.toList())
        tag("record.calendar-grid").assertIsDisplayed()
    }

    // ---- 오류 화면 (TC-REC-032/029/030) ----------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-032 서버 오류 뒤 다시 시도를 누르면 같은 달을 다시 요청해 달력을 보인다`() {
        var attempts = 0
        start { calendarHandler = { month -> if (attempts++ == 0) failure500 else ApiResult.Success(RecordFixtureModels.calendarFor(month)) } }
        tag("record.error-message").assertTextEquals(copy["record.err.other"])
        tap("record.retry-button")

        count("record.error-state").assertCountEquals(0)
        tag("record.calendar-grid").assertIsDisplayed()
        assertEquals(listOf(RECORD_OCT, RECORD_OCT), h.repo.calendarCalls.toList())
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-REC-029 오프라인 첫 진입은 오류와 다시 시도이고 온라인 복귀 뒤 다시 시도하면 불러온다`() {
        var online = false
        start {
            calendarHandler = { month ->
                if (online) ApiResult.Success(RecordFixtureModels.calendarFor(month)) else ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE))
            }
        }
        tag("record.retry-button").assertIsDisplayed()
        online = true
        tap("record.retry-button")
        tag("record.calendar-grid").assertIsDisplayed()
        tag(day("10-31")).assertIsSelected()
    }

    @Test
    fun `TC-REC-030 401 오류 화면의 로그인 하기를 누르면 로그인 요청이 한 번 올라간다`() {
        start { calendarHandler = { RecordFixtureModels.failure("record/posts-calendar__401-unauthorized.json") } }
        tag("record.login-required-state").assertIsDisplayed()
        tap("record.login-button")
        assertEquals(1, logins)
    }

    // ---- 월 이동 (TC-REC-016/004) ----------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-016 이전 달 화살표를 누르면 9월 달력을 요청하고 가장 최근 9월 기록이 선택된다`() {
        start()
        tap("record.prev-month-button")
        tag("record.month-label").assertTextEquals("2026년 9월")
        assertEquals(1, h.repo.calendarCalls.count { it == RECORD_SEP })
        tag(day("09-30")).assertIsSelected()
        count(day("10-31")).assertCountEquals(0)
    }

    @Test
    fun `TC-REC-004 월 선택 시트에서 9월을 고르면 9월로 이동하고 시트가 닫힌다`() {
        start()
        tap("record.month-picker-button")
        tap("record.month-picker-item-2026-09")
        tag("record.month-label").assertTextEquals("2026년 9월")
        count("record.month-picker-sheet").assertCountEquals(0)
        assertEquals(1, h.repo.calendarCalls.count { it == RECORD_SEP })
    }

    @Test
    fun `TC-REC-017 월 선택 시트에서 이미 보는 달을 다시 골라도 달력을 다시 요청하지 않는다`() {
        start()
        val before = h.repo.totalCalls
        tap("record.month-picker-button")
        tap("record.month-picker-item-2026-10")
        assertEquals(before, h.repo.totalCalls)
        tag("record.month-label").assertTextEquals("2026년 10월")
    }

    // ---- 날짜·사진 패널 (TC-REC-034/035/024) ------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-034 피드에서 보기는 선택한 사진을 썸네일 시드와 함께 열라고 알린다`() {
        start()
        tap(day("10-20"))
        tap("record.view-feed-button")
        assertEquals(listOf(FeedEntry.FromRecord(RECORD_POST_OCT_20, recordThumb(RECORD_POST_OCT_20))), feeds.toList())
        assertTrue(displays.isEmpty())
    }

    @Test
    fun `TC-REC-034 전시 보러가기는 선택한 사진의 주제 날짜로 전시를 열라고 알린다`() {
        start()
        tap("record.view-display-button")
        assertEquals(listOf(LocalDate.of(2026, 10, 31)), displays.toList())
        assertTrue(feeds.isEmpty())
    }

    @Test
    fun `TC-REC-035 PENDING 날짜를 고르면 배지만 보이고 배지를 누를 때마다 안내가 열리고 닫힌다`() {
        start()
        tap(day("10-27"))
        tag("record.pending-badge").assertIsDisplayed()
        count("record.view-feed-button").assertCountEquals(0)
        count("record.view-display-button").assertCountEquals(0)
        rule.onAllNodesWithTag("record.pending-tooltip", useUnmergedTree = true).assertCountEquals(0)

        tap("record.pending-badge")
        tag("record.pending-tooltip").assertIsDisplayed()
        tap("record.pending-badge")
        rule.onAllNodesWithTag("record.pending-tooltip", useUnmergedTree = true).assertCountEquals(0)
        assertTrue(feeds.isEmpty() && displays.isEmpty())
    }

    @Test
    fun `TC-REC-037 사진 없는 날짜 칸을 눌러도 선택은 그대로다`() {
        start()
        tap(day("10-15"))
        tag(day("10-31")).assertIsSelected()
    }

    @Test
    fun `TC-REC-024 삭제한 게시물은 달력에서 사라지고 선택은 같은 달의 가장 최근 사진으로 옮겨 간다`() {
        start()
        tap(day("10-31"))
        h.changes.markRemoved(RECORD_POST_OCT_31)
        rule.waitForIdle()

        rule.onAllNodesWithTag("record.day-photo-2026-10-31", useUnmergedTree = true).assertCountEquals(0)
        tag(day("10-27")).assertIsSelected()
        tag("record.pending-badge").assertExists()
    }

    // ---- 이미지로 저장 (TC-REC-038/039/040) -----------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-038 이미지로 저장은 현재 달을 렌더해 정해진 파일 이름으로 저장하고 성공 토스트를 한 번 띄운다`() {
        start()
        tap("record.save-image-button")
        assertEquals(listOf(RECORD_OCT), h.renderer.calls.toList())
        assertEquals(listOf("chalkak-calendar-2026-10.png"), h.saver.fileNames.toList())
        assertEquals(listOf(copy["record.save.ok"]), toasts.toList())
    }

    @Test
    fun `TC-REC-039 저장 권한이 거부되면 권한 안내 토스트이고 앱은 계속 쓸 수 있다`() {
        start()
        h.saver.outcome = SaveOutcome.PermissionDenied
        tap("record.save-image-button")
        assertEquals(listOf(copy["record.save.denied"]), toasts.toList())
        tag("record.calendar-grid").assertIsDisplayed()
        tag("record.save-image-button").assertExists()
    }

    @Test
    fun `TC-REC-039 쓰기가 실패하면 저장 실패 토스트다`() {
        start()
        h.saver.outcome = SaveOutcome.Failed
        tap("record.save-image-button")
        assertEquals(listOf(copy["record.save.fail"]), toasts.toList())
    }

    @Test
    fun `TC-REC-040 저장 버튼을 연타해도 저장은 한 번만 실행되고 토스트도 한 번이다`() {
        start()
        val hold = CompletableDeferred<Unit>()
        h.saver.hold = hold
        tap("record.save-image-button")
        tap("record.save-image-button")
        tap("record.save-image-button")
        assertEquals(1, h.saver.fileNames.size)
        assertEquals(1, h.renderer.calls.size)

        hold.complete(Unit)
        rule.waitForIdle()
        assertEquals(listOf(copy["record.save.ok"]), toasts.toList())
    }

    @Test
    fun `TC-REC-043 새 사진을 올린 뒤 화면이 다시 보이면 오늘 칸에 새 사진이 나타난다`() {
        var visible by mutableStateOf(true)
        h.close()
        h = RecordHarness { calendarHandler = { ApiResult.Success(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")) } }
        rule.setContent { if (visible) Route() }
        rule.waitForIdle()
        count("record.day-photo-2026-10-27").assertCountEquals(0)

        visible = false
        rule.waitForIdle()
        h.repo.calendarHandler = { ApiResult.Success(RecordFixtureModels.calendarFor(it)) }
        visible = true
        rule.waitForIdle()

        rule.onNodeWithTag("record.day-photo-2026-10-27", useUnmergedTree = true).assertExists()
        assertEquals(2, h.repo.calendarCalls.size)
        val shown: List<RecordPost> = h.state.cells.mapNotNull { it.post }
        assertEquals(3, shown.size)
    }
}
