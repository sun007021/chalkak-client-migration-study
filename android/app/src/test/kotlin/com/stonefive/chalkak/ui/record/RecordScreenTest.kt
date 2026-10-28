package com.stonefive.chalkak.ui.record

import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.RECORD_OCT
import com.stonefive.chalkak.testing.RECORD_SEP
import com.stonefive.chalkak.testing.RECORD_TODAY
import com.stonefive.chalkak.testing.RecordHarness
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.recordThumb
import java.time.LocalDate
import java.time.YearMonth
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.core.data.record.testing.RecordFixtureModels
import kr.chalkak.feature.record.RecordUiState
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Stateless `RecordScreen`: the states are the real `RecordUiState`s of a `RecordStateHolder` over `shared/fixtures/record`
 * (2026-10: 10/20 APPROVED, 10/27 PENDING, 10/31 APPROVED; default selection 10/31), rendered without a route.
 * Interaction through the holder (lifecycle, effects, toasts) is in `RecordRouteTest`.
 * The qualifiers give a screen tall enough for header, grid, panel and save button at once.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1400dp")
class RecordScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val images = ImageProbe()
    private val harnesses = mutableListOf<RecordHarness>()

    @After
    fun tearDown() = harnesses.forEach { it.close() }

    private fun harness(now: String? = null, setup: kr.chalkak.core.data.record.testing.FakeRecordRepository.() -> Unit = {}) =
        RecordHarness(now = now, setup = setup).also { harnesses += it }

    /** October, loaded, 10/31 selected. */
    private fun october(): RecordUiState = harness().shown()

    private fun show(state: RecordUiState, callbacks: RecordCallbacks = RecordCallbacks(), today: LocalDate = RECORD_TODAY) {
        rule.setContent { TestApp(copy) { RecordScreen(state, callbacks, images.slot, today) } }
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    private fun unmerged(t: String) = rule.onAllNodesWithTag(t, useUnmergedTree = true)

    /** The node and its descendants, left to right, show exactly [expected] when their texts are joined (one Text or seven). */
    private fun showsInOrder(expected: String) = SemanticsMatcher("shows $expected") { node ->
        fun texts(n: SemanticsNode): List<String> =
            (n.config.getOrNull(SemanticsProperties.Text)?.map { it.text } ?: emptyList()) + n.children.flatMap(::texts)
        texts(node).joinToString("") == expected
    }

    private fun day(d: Int) = "record.day-2026-10-${d.toString().padStart(2, '0')}"

    // ---- TC-REC-042 ------------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-042 기록 화면의 식별자와 연월 라벨, 요일 머리글, 저장 버튼 문구가 있다`() {
        show(october())
        listOf(
            "record.root", "record.month-label", "record.prev-month-button", "record.next-month-button", "record.month-picker-button",
            "record.weekday-header", "record.calendar-grid", day(1), day(31), "record.selected-photo", "record.save-image-button",
        ).forEach { tag(it).assertExists() }
        tag("record.month-label").assertTextEquals("2026년 10월")
        tag("record.save-image-button").assertShowsAll(copy["record.save"])
        count("record.loading").assertCountEquals(0)
        count("record.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-REC-001 첫 조회 중에는 로딩 표시만 있고 달력은 아직 없다`() {
        val h = harness { calendarHandler = { kotlinx.coroutines.awaitCancellation() } }
        show(h.shown())
        tag("record.loading").assertIsDisplayed()
        count("record.calendar-grid").assertCountEquals(0)
        count("record.selected-photo").assertCountEquals(0)
        count("record.error-state").assertCountEquals(0)
    }

    // ---- 달력 격자 (TC-REC-009/011/008) ------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-009 요일 머리글은 일월화수목금토이고 일요일에 시작하는 7열 격자에 그 달 날짜 칸만 있다`() {
        show(october())
        tag("record.weekday-header").assert(showsInOrder(copy["record.weekday"]))
        (1..31).forEach { tag(day(it)).assertExists() }
        count("record.day-2026-09-30").assertCountEquals(0)
        count("record.day-2026-11-01").assertCountEquals(0)

        // 2026-10-01 is a Thursday: it sits 4 columns right of Sunday 10/04, one row above it; 10/04 and 10/11 share a column.
        val thu = tag(day(1)).getBoundsInRoot()
        val sun4 = tag(day(4)).getBoundsInRoot()
        val sun11 = tag(day(11)).getBoundsInRoot()
        val fri = tag(day(2)).getBoundsInRoot()
        assertEquals(sun4.left, sun11.left, "same weekday, same column")
        assertTrue(sun4.top > thu.top, "the first Sunday starts the second row")
        assertEquals(thu.top, fri.top, "10/01 and 10/02 are in the first row")
        assertTrue(thu.left > sun4.left, "Thursday is right of Sunday")
        val cell = fri.left - thu.left
        assertTrue(cell > 0.dp)
        assertEquals((sun4.left + cell * 4).value, thu.left.value, 1f)
    }

    @Test
    fun `TC-REC-009 오늘(KST) 칸에만 오늘 표시가 하나 있다`() {
        show(october(), today = RECORD_TODAY)
        unmerged("record.today-marker").assertCountEquals(1)
        rule.onNode(hasTestTag("record.today-marker") and hasAnyAncestor(hasTestTag(day(27))), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `TC-REC-011 APPROVED는 썸네일, PENDING은 썸네일과 배지, 기록 없는 날은 빈 칸이다`() {
        show(october())
        unmerged("record.day-photo-2026-10-20").assertCountEquals(1)
        unmerged("record.day-photo-2026-10-31").assertCountEquals(1)
        unmerged("record.day-photo-2026-10-27").assertCountEquals(1)
        unmerged("record.day-pending-2026-10-27").assertCountEquals(1)
        unmerged("record.day-pending-2026-10-20").assertCountEquals(0)
        unmerged("record.day-pending-2026-10-31").assertCountEquals(0)
        unmerged("record.day-photo-2026-10-15").assertCountEquals(0)
        tag(day(15)).assertExists()
        listOf("290", "201", "291").forEach {
            assertTrue(images.drewUrl(recordThumb("22222222-2222-4222-8222-222222222$it")), "thumbnail of $it is drawn")
        }
    }

    @Test
    fun `TC-REC-008 TC-REC-015 응답 순서가 섞여 있어도 주제 날짜 10-31 사진은 31일 칸에 있다`() {
        val h = harness { calendarHandler = { RecordFixtureModels.ok(RecordFixtureModels.calendar("record/posts-calendar__2026-10-shuffled.json")) } }
        show(h.shown())
        listOf(20, 27, 31).forEach { unmerged("record.day-photo-2026-10-$it").assertCountEquals(1) }
        unmerged("record.day-photo-2026-10-15").assertCountEquals(0)
        rule.onNode(hasTestTag("record.day-photo-2026-10-31") and hasAnyAncestor(hasTestTag(day(31))), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `TC-REC-036 기본 선택은 가장 최근 기록 날짜이고 기록 있는 날 칸을 누르면 선택 콜백이 불린다`() {
        val taps = mutableListOf<LocalDate>()
        show(october(), RecordCallbacks(onDateSelected = { taps += it }))
        tag(day(31)).assertIsSelected()
        tag(day(27)).assertIsNotSelected()
        tag(day(27)).performClick()
        assertEquals(listOf(LocalDate.of(2026, 10, 27)), taps)
    }

    @Test
    fun `TC-REC-037 기록 없는 달은 빈 격자이고 사진 패널이 없으며 오류가 아니다`() {
        val h = harness(now = "2026-11-05T03:00:00Z")
        show(h.shown())
        tag("record.month-label").assertTextEquals("2026년 11월")
        tag("record.calendar-grid").assertExists()
        count("record.selected-photo").assertCountEquals(0)
        count("record.error-state").assertCountEquals(0)
        count("record.loading").assertCountEquals(0)
        unmerged("record.pending-badge").assertCountEquals(0)
        count("record.view-feed-button").assertCountEquals(0)
    }

    // ---- 월 이동 (TC-REC-016, TC-REC-004) ----------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-016 이전 달 화살표는 콜백을 부르고 가장 최신 달에서 다음 화살표는 비활성이다`() {
        var previous = 0
        var next = 0
        show(october(), RecordCallbacks(onPreviousMonth = { previous++ }, onNextMonth = { next++ }))
        tag("record.next-month-button").assertIsNotEnabled()
        tag("record.prev-month-button").assertIsEnabled()
        tag("record.prev-month-button").performClick()
        tag("record.next-month-button").performClick()
        assertEquals(1, previous)
        assertEquals(0, next, "a disabled arrow does not report")
    }

    @Test
    fun `TC-REC-016 가장 오래된 달에서는 이전 화살표가 비활성이고 라벨은 그 달이다`() {
        val h = harness()
        h.shown()
        h.holder.onPreviousMonth()
        show(h.state)
        tag("record.month-label").assertTextEquals("2026년 9월")
        tag("record.prev-month-button").assertIsNotEnabled()
        tag("record.next-month-button").assertIsEnabled()
        unmerged("record.day-photo-2026-09-17").assertCountEquals(1)
    }

    @Test
    fun `TC-REC-004 월 선택 버튼은 시트를 열고 선택지가 최신순으로 있으며 현재 달은 기록이 없어도 있다`() {
        val h = harness(now = "2026-11-05T03:00:00Z")
        show(h.shown())
        count("record.month-picker-sheet").assertCountEquals(0)
        tag("record.month-picker-button").performClick()
        tag("record.month-picker-sheet").assertExists()
        listOf("2026-11", "2026-10", "2026-09").forEach { tag("record.month-picker-item-$it").assertExists() }
        count("record.month-picker-item-2026-08").assertCountEquals(0)
    }

    @Test
    fun `TC-REC-004 시트에서 항목을 고르면 그 달로 콜백이 불리고 시트가 닫힌다`() {
        val picked = mutableListOf<YearMonth>()
        show(october(), RecordCallbacks(onMonthPicked = { picked += it }))
        tag("record.month-picker-button").performClick()
        tag("record.month-picker-item-2026-09").performClick()
        rule.waitForIdle()
        assertEquals(listOf(RECORD_SEP), picked)
        count("record.month-picker-sheet").assertCountEquals(0)
    }

    @Test
    fun `TC-REC-004 닫기 버튼은 아무것도 고르지 않고 시트만 닫는다`() {
        val picked = mutableListOf<YearMonth>()
        show(october(), RecordCallbacks(onMonthPicked = { picked += it }))
        tag("record.month-picker-button").performClick()
        tag("record.month-picker-close-button").performClick()
        rule.waitForIdle()
        assertTrue(picked.isEmpty())
        count("record.month-picker-sheet").assertCountEquals(0)
    }

    // ---- 사진 패널 (TC-REC-034/035) ------------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-034 APPROVED 날짜에는 피드와 전시 버튼이 있고 배지는 없으며 누르면 콜백이 불린다`() {
        val calls = mutableListOf<String>()
        show(october(), RecordCallbacks(onOpenFeed = { calls += "feed" }, onOpenDisplay = { calls += "display" }))
        tag("record.selected-photo").assertExists()
        tag("record.view-feed-button").assertShowsAll(copy["record.action.feed"])
        tag("record.view-display-button").assertShowsAll(copy["record.action.display"])
        unmerged("record.pending-badge").assertCountEquals(0)
        unmerged("record.pending-tooltip").assertCountEquals(0)
        tag("record.view-feed-button").performClick()
        tag("record.view-display-button").performClick()
        assertEquals(listOf("feed", "display"), calls)
        assertTrue(images.drewUrl(recordThumb("22222222-2222-4222-8222-222222222291")), "the selected photo is drawn")
    }

    @Test
    fun `TC-REC-035 PENDING 날짜에는 사진 반영 중 배지가 있고 두 동작 버튼은 없으며 안내는 닫혀 있다`() {
        val h = harness()
        h.shown()
        h.holder.onDateSelected(LocalDate.of(2026, 10, 27))
        show(h.state)
        tag("record.selected-photo").assertExists()
        tag("record.pending-badge").assertShowsAll(copy["record.pending.badge"])
        tag("record.pending-badge").assert(hasContentDescription(copy["record.pending.hint-open"]))
        count("record.view-feed-button").assertCountEquals(0)
        count("record.view-display-button").assertCountEquals(0)
        unmerged("record.pending-tooltip").assertCountEquals(0)
    }

    @Test
    fun `TC-REC-035 배지를 누르면 배지 콜백이 불린다`() {
        val h = harness()
        h.shown()
        h.holder.onDateSelected(LocalDate.of(2026, 10, 27))
        var taps = 0
        show(h.state, RecordCallbacks(onPendingBadgeTapped = { taps++ }))
        tag("record.pending-badge").performClick()
        assertEquals(1, taps)
    }

    @Test
    fun `TC-REC-035 안내가 열린 상태에서는 두 줄 안내가 보이고 배지 라벨은 닫기가 된다`() {
        val h = harness()
        h.shown()
        h.holder.onDateSelected(LocalDate.of(2026, 10, 27))
        h.holder.onPendingBadgeTapped()
        assertTrue(h.state.panel?.hintOpen == true)
        show(h.state)
        val (first, second) = copy["record.pending.tooltip"].split("\n")
        listOf(first, second).forEach { line ->
            tag("record.pending-tooltip").assert(hasText(line, substring = true) or hasAnyDescendant(hasText(line, substring = true)))
        }
        tag("record.pending-badge").assert(hasContentDescription(copy["record.pending.hint-close"]))
    }

    // ---- 이미지로 저장 (TC-REC-038/040) ----------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-038 이미지로 저장 버튼을 누르면 저장 콜백이 불린다`() {
        var saves = 0
        show(october(), RecordCallbacks(onSaveImage = { saves++ }))
        tag("record.save-image-button").assertIsEnabled()
        tag("record.save-image-button").performClick()
        assertEquals(1, saves)
    }

    @Test
    fun `TC-REC-040 저장 중에는 저장 버튼이 비활성이라 연타해도 콜백이 불리지 않는다`() {
        var saves = 0
        show(october().copy(saving = true), RecordCallbacks(onSaveImage = { saves++ }))
        tag("record.save-image-button").assertIsNotEnabled()
        tag("record.save-image-button").performClick()
        assertEquals(0, saves)
    }

    // ---- 오류 화면 (TC-REC-032/030/031/012) ----------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-032 서버 오류면 기록을 불러오지 못했어요와 다시 시도이고 달력은 비어 있다`() {
        var retries = 0
        val h = harness { calendarHandler = { RecordFixtureModels.failure("record/posts-calendar__500-server-error.json") } }
        show(h.shown(), RecordCallbacks(onRetry = { retries++ }))
        tag("record.error-state").assertExists()
        tag("record.error-message").assertTextEquals(copy["record.err.other"])
        tag("record.retry-button").assertShowsAll(copy["common.retry"])
        count("record.calendar-grid").assertCountEquals(0)
        count("record.selected-photo").assertCountEquals(0)
        count("record.loading").assertCountEquals(0)
        count("record.login-required-state").assertCountEquals(0)
        tag("record.retry-button").performClick()
        assertEquals(1, retries)
    }

    @Test
    fun `TC-REC-012 응답 검증에 실패해도 같은 오류 화면과 다시 시도다`() {
        val h = harness {
            calendarHandler = { kr.chalkak.core.network.ApiResult.Failure(kr.chalkak.core.network.ApiError.InvalidResponse("month mismatch")) }
        }
        show(h.shown())
        tag("record.error-message").assertTextEquals(copy["record.err.other"])
        tag("record.retry-button").assertExists()
    }

    @Test
    fun `TC-REC-030 인증이 끊긴 401이면 로그인이 필요해요와 로그인 하기이고 다시 시도는 없다`() {
        var logins = 0
        val h = harness { calendarHandler = { RecordFixtureModels.failure("record/posts-calendar__401-unauthorized.json") } }
        show(h.shown(), RecordCallbacks(onLoginTapped = { logins++ }))
        tag("record.login-required-state").assertShowsAll(copy["record.err.401"])
        tag("record.login-button").assertShowsAll(copy["record.guest.login"])
        count("record.retry-button").assertCountEquals(0)
        count("record.calendar-grid").assertCountEquals(0)
        tag("record.login-button").performClick()
        assertEquals(1, logins)
    }

    @Test
    fun `TC-REC-031 400이면 조회할 수 없는 연월이에요 메시지가 보이고 달력은 비어 있다`() {
        val h = harness { calendarHandler = { RecordFixtureModels.failure("record/posts-calendar__400-invalid-month.json") } }
        show(h.shown())
        tag("record.invalid-month-message").assertTextEquals(copy["record.err.400"])
        count("record.calendar-grid").assertCountEquals(0)
        count("record.login-required-state").assertCountEquals(0)
    }

    @Test
    fun `TC-REC-021 현재 달 조회가 실패하면 이전 달 내용이 남지 않고 오류 화면이다`() {
        val h = harness()
        h.shown()
        h.repo.calendarHandler = { RecordFixtureModels.failure("record/posts-calendar__500-server-error.json") }
        h.holder.onPreviousMonth() // September was never loaded: no cache to keep
        show(h.state)
        tag("record.error-state").assertExists()
        count("record.calendar-grid").assertCountEquals(0)
        unmerged("record.day-photo-2026-10-31").assertCountEquals(0)
        assertEquals(RECORD_SEP, h.state.month)
        assertEquals(RECORD_OCT, h.state.currentMonth)
    }
}
