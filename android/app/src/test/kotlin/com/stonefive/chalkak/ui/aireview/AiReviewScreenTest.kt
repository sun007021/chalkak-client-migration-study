package com.stonefive.chalkak.ui.aireview

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.hasTestTagPrefix
import com.stonefive.chalkak.testing.loadCopy
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.data.aireview.AiCriterion
import kr.chalkak.core.data.aireview.AiFeedback
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.feature.aireview.AiPill
import kr.chalkak.feature.aireview.AiResultUi
import kr.chalkak.feature.aireview.AiReviewUiState
import kr.chalkak.feature.aireview.AiSheet
import kr.chalkak.feature.aireview.AiToast
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Stateless `AiReviewSection` over hand-built `AiReviewUiState`s (values of the real holder, `shared/fixtures/ai-review`). */
@RunWith(RobolectricTestRunner::class)
class AiReviewScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()

    private class Clicks {
        var pill = 0
        var start = 0
        var dismiss = 0
        var help = 0
        var helpDismiss = 0
        val expired = mutableListOf<Long>()

        fun callbacks() = AiReviewCallbacks(
            onPillClick = { pill++ },
            onStartConfirm = { start++ },
            onSheetDismiss = { dismiss++ },
            onCriteriaHelpClick = { help++ },
            onCriteriaHelpDismiss = { helpDismiss++ },
            onToastExpired = { expired += it },
        )
    }

    private val clicks = Clicks()

    private fun state(
        pill: AiPill = AiPill.Hidden,
        sheet: AiSheet? = null,
        criteriaDialogOpen: Boolean = false,
        notice: String? = null,
        toast: AiToast? = null,
        review: AiReview? = null,
    ) = AiReviewUiState(pill, sheet, criteriaDialogOpen, notice, toast, review)

    private fun show(state: AiReviewUiState) {
        rule.setContent { TestApp(copy) { AiReviewSection(state, clicks.callbacks()) } }
        rule.waitForIdle()
    }

    /** One composition, the states shown one after another ([check] runs after each has settled). */
    private fun showEach(states: List<AiReviewUiState>, check: (AiReviewUiState) -> Unit) {
        var current by mutableStateOf(states.first())
        rule.setContent { TestApp(copy) { AiReviewSection(current, clicks.callbacks()) } }
        states.forEach {
            current = it
            rule.waitForIdle()
            check(it)
        }
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    private fun resultSheet(review: AiReview = AiReviews.completed()) = AiSheet.Result(AiResultUi.from(requireNotNull(review.result)))

    private val pillTags = listOf(
        "feed.ai-request-button", "feed.ai-checking", "feed.ai-requesting", "feed.ai-processing",
        "feed.ai-result-button", "feed.ai-retry-button", "feed.ai-failed-button", "feed.ai-recheck-button",
    )

    private fun assertOnlyPill(tag: String) = pillTags.forEach { count(it).assertCountEquals(if (it == tag) 1 else 0) }

    // ---- pill (TC-AIR-012..015, 037, 057) ------------------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-012 NONE 이면 AI 피드백 받기 알약이 보이고 누르면 알린다`() {
        show(state(AiPill.Request, review = AiReviews.none()))
        assertOnlyPill("feed.ai-request-button")
        tag("feed.ai-request-button").assertIsDisplayed().assertIsEnabled().assertShowsAll(copy["ai.pill.request"])
        tag("feed.ai-request-button").performClick()
        assertEquals(1, clicks.pill)
    }

    @Test
    fun `TC-AIR-013 PROCESSING 이면 AI 분석중 알약은 비활성이라 눌러도 알리지 않는다`() {
        show(state(AiPill.Processing, review = AiReviews.processing()))
        assertOnlyPill("feed.ai-processing")
        tag("feed.ai-processing").assertIsDisplayed().assertIsNotEnabled().assertShowsAll(copy["ai.pill.processing"])
        tag("feed.ai-processing").performClick()
        assertEquals(0, clicks.pill)
    }

    @Test
    fun `TC-AIR-013 확인중과 요청중 알약도 비활성이다`() {
        show(state(AiPill.Checking))
        assertOnlyPill("feed.ai-checking")
        tag("feed.ai-checking").assertIsNotEnabled().assertShowsAll(copy["ai.pill.checking"])
    }

    @Test
    fun `TC-AIR-023 요청중 알약은 비활성이라 연타해도 알리지 않는다`() {
        show(state(AiPill.Requesting, review = AiReviews.none()))
        assertOnlyPill("feed.ai-requesting")
        tag("feed.ai-requesting").assertIsNotEnabled().assertShowsAll(copy["ai.pill.requesting"])
        repeat(3) { tag("feed.ai-requesting").performClick() }
        assertEquals(0, clicks.pill)
    }

    @Test
    fun `TC-AIR-014 COMPLETED 이면 AI 피드백 보기만 있고 재요청 버튼이 없다`() {
        show(state(AiPill.View, review = AiReviews.completed()))
        assertOnlyPill("feed.ai-result-button")
        tag("feed.ai-result-button").assertIsDisplayed().assertIsEnabled().assertShowsAll(copy["ai.pill.view"])
        count("feed.ai-retry-button").assertCountEquals(0)
        tag("feed.ai-result-button").performClick()
        assertEquals(1, clicks.pill)
    }

    @Test
    fun `TC-AIR-015 FAILED 이고 재요청 가능이면 AI 피드백 재요청 알약이 보인다`() {
        show(state(AiPill.Retry, review = AiReviews.failed(canRequestAgain = true)))
        assertOnlyPill("feed.ai-retry-button")
        tag("feed.ai-retry-button").assertIsEnabled().assertShowsAll(copy["ai.pill.retry"])
        tag("feed.ai-retry-button").performClick()
        assertEquals(1, clicks.pill)
    }

    @Test
    fun `TC-AIR-015 FAILED 이고 재요청 불가이면 재요청 버튼 없이 AI 피드백 실패 알약만 보인다`() {
        show(state(AiPill.Failed, review = AiReviews.failed(canRequestAgain = false)))
        assertOnlyPill("feed.ai-failed-button")
        tag("feed.ai-failed-button").assertIsEnabled().assertShowsAll(copy["ai.pill.failed"])
        count("feed.ai-retry-button").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-037 창이 끝난 뒤 안내 문구와 AI 상태 다시 확인 알약이 보이고 누르면 알린다`() {
        show(state(AiPill.Recheck, notice = "ai.poll.timeout"))
        assertOnlyPill("feed.ai-recheck-button")
        tag("feed.ai-recheck-button").assertIsEnabled().assertShowsAll(copy["ai.pill.recheck"])
        tag("feed.ai-message").assertIsDisplayed().assertShowsAll(copy["ai.poll.timeout"])
        tag("feed.ai-recheck-button").performClick()
        assertEquals(1, clicks.pill)
    }

    @Test
    fun `TC-AIR-035 폴링 창 안내는 PROCESSING 알약 아래에 남고 알약은 여전히 분석중이다`() {
        show(state(AiPill.Processing, notice = "ai.poll.timeout", review = AiReviews.processing()))
        tag("feed.ai-processing").assertShowsAll(copy["ai.pill.processing"])
        tag("feed.ai-message").assertShowsAll(copy["ai.poll.timeout"])
    }

    @Test
    fun `TC-AIR-017 숨김 상태에서는 AI 알약도 안내도 시트도 그리지 않는다`() {
        show(state(AiPill.Hidden))
        pillTags.forEach { count(it).assertCountEquals(0) }
        count("feed.ai-message").assertCountEquals(0)
        count("ai-start-sheet.root").assertCountEquals(0)
        count("ai-result-sheet.root").assertCountEquals(0)
        count("ai-failed-sheet.root").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-017 안내 문구가 없으면 안내 노드가 없다`() {
        show(state(AiPill.Request, review = AiReviews.none()))
        count("feed.ai-message").assertCountEquals(0)
    }

    // ---- start sheet (TC-AIR-020, 021) ---------------------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-020 시작 시트는 제목과 안내 3줄과 분석 시작하기 버튼을 보인다`() {
        show(state(AiPill.Request, sheet = AiSheet.Start(retry = false), review = AiReviews.none()))
        tag("ai-start-sheet.root").assertIsDisplayed().assertShowsAll(copy["ai.start.title"])
        tag("ai-start-sheet.description").assertShowsAll(copy["ai.start.line1"], copy["ai.start.line2"], copy["ai.start.line3"])
        tag("ai-start-sheet.start-button").assertIsEnabled().assertShowsAll(copy["ai.start.confirm"])
        count("ai-start-sheet.close-button").assertCountEquals(1)
    }

    @Test
    fun `TC-AIR-020 재요청 시트는 AI 피드백을 재요청할까요 제목을 쓴다`() {
        show(state(AiPill.Retry, sheet = AiSheet.Start(retry = true), review = AiReviews.failed(canRequestAgain = true)))
        tag("ai-start-sheet.root").assertShowsAll(copy["ai.start.title-retry"])
        tag("ai-start-sheet.description").assertShowsAll(copy["ai.start.line1"], copy["ai.start.line2"], copy["ai.start.line3"])
    }

    @Test
    fun `TC-AIR-020 분석 시작하기를 누르면 확정을 알리고 닫기를 누르면 닫힘만 알린다`() {
        show(state(AiPill.Request, sheet = AiSheet.Start(retry = false), review = AiReviews.none()))
        tag("ai-start-sheet.close-button").performClick()
        assertEquals(1, clicks.dismiss)
        assertEquals(0, clicks.start)
        tag("ai-start-sheet.start-button").performClick()
        assertEquals(1, clicks.start)
    }

    @Test
    fun `TC-AIR-021 시작 시트에는 추가 동의 체크나 토글이 없다`() {
        show(state(AiPill.Request, sheet = AiSheet.Start(retry = false), review = AiReviews.none()))
        rule.onAllNodes(isToggleable()).assertCountEquals(0)
    }

    // ---- result sheet (TC-AIR-010, 049..052) ---------------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-049 결과 시트는 요약 점수 기준 목록 세 섹션을 이 순서로 보인다`() {
        val review = AiReviews.completed()
        show(state(AiPill.View, sheet = resultSheet(review), review = review))
        tag("ai-result-sheet.root").assertIsDisplayed()
        tag("ai-result-sheet.feedback-summary").assertShowsAll(AiReviews.FEEDBACK.summary)
        tag("ai-result-sheet.overall-score").assertShowsAll("7.5")
        tag("ai-result-sheet.criteria-item-COMPOSITION").assertShowsAll("구도", "7.5")
        tag("ai-result-sheet.feedback-strength").assertShowsAll(copy["ai.result.strength"], AiReviews.FEEDBACK.strength)
        tag("ai-result-sheet.feedback-weakness").assertShowsAll(copy["ai.result.weakness"], AiReviews.FEEDBACK.weakness)
        tag("ai-result-sheet.feedback-suggestion").assertShowsAll(copy["ai.result.suggestion"], AiReviews.FEEDBACK.suggestion)

        val tops = listOf(
            "ai-result-sheet.feedback-summary", "ai-result-sheet.overall-score", "ai-result-sheet.criteria-item-COMPOSITION",
            "ai-result-sheet.feedback-strength", "ai-result-sheet.feedback-weakness", "ai-result-sheet.feedback-suggestion",
        ).map { tag(it).getBoundsInRoot().top }
        assertEquals(tops.sorted(), tops, "display order: $tops")
        assertEquals(tops.distinct(), tops)
    }

    @Test
    fun `TC-AIR-049 점수는 소수 첫째 자리로 보인다 10점과 0점도 같다`() {
        val cases = listOf(10.0 to "10.0", 0.0 to "0.0", 7.5 to "7.5")
        val states = cases.map { (score, _) ->
            val review = AiReviews.completed(score = score, criteria = listOf(AiCriterion("COMPOSITION", "구도", score)))
            state(AiPill.View, resultSheet(review), review = review)
        }
        var i = 0
        showEach(states) {
            val text = cases[i++].second
            tag("ai-result-sheet.overall-score").assertShowsAll(text)
            tag("ai-result-sheet.criteria-item-COMPOSITION").assertShowsAll(text)
        }
    }

    @Test
    fun `TC-AIR-050 전체 점수의 접근성 라벨은 10점 만점에 7점 5점 문구이다`() {
        val review = AiReviews.completed(score = 7.5)
        show(state(AiPill.View, resultSheet(review), review = review))
        tag("ai-result-sheet.overall-score").assertContentDescriptionEquals(copy.format("ai.result.score-a11y", "X" to "7.5"))
    }

    @Test
    fun `TC-AIR-051 distinctivePerspective 가 true 이면 해석이 돋보이는 배지가 보인다`() {
        val review = AiReviews.completed(distinctive = true)
        show(state(AiPill.View, resultSheet(review), review = review))
        tag("ai-result-sheet.distinctive-badge").assertIsDisplayed().assertShowsAll(copy["ai.result.distinctive"])
    }

    @Test
    fun `TC-AIR-051 distinctivePerspective 가 false 이면 배지가 없다`() {
        val review = AiReviews.completed(distinctive = false)
        show(state(AiPill.View, resultSheet(review), review = review))
        count("ai-result-sheet.distinctive-badge").assertCountEquals(0)
        tag("ai-result-sheet.root").assertIsDisplayed()
    }

    @Test
    fun `TC-AIR-010 기준이 0개 1개 3개여도 목록으로 그린다`() {
        fun criterion(n: Int) = AiCriterion("KEY$n", "기준$n", n.toDouble())
        val counts = listOf(0, 1, 3)
        val states = counts.map { n ->
            val review = AiReviews.completed(criteria = (1..n).map(::criterion))
            state(AiPill.View, resultSheet(review), review = review)
        }
        var i = 0
        showEach(states) {
            val n = counts[i++]
            rule.onAllNodes(hasTestTagPrefix("ai-result-sheet.criteria-item-")).assertCountEquals(n)
            tag("ai-result-sheet.feedback-suggestion").assertExists()
            (1..n).forEach { tag("ai-result-sheet.criteria-item-KEY$it").assertShowsAll("기준$it") }
        }
    }

    @Test
    fun `TC-AIR-010 요약 60자와 나머지 150자 상한 길이도 모두 담긴다`() {
        val feedback = AiFeedback("요".repeat(60), "강".repeat(150), "약".repeat(150), "제".repeat(150))
        val review = AiReviews.completed(feedback = feedback)
        show(state(AiPill.View, resultSheet(review), review = review))
        tag("ai-result-sheet.feedback-summary").assertShowsAll(feedback.summary)
        tag("ai-result-sheet.feedback-strength").assertShowsAll(feedback.strength)
        tag("ai-result-sheet.feedback-weakness").assertShowsAll(feedback.weakness)
        tag("ai-result-sheet.feedback-suggestion").assertShowsAll(feedback.suggestion)
    }

    @Test
    fun `TC-AIR-052 점수 영역의 기준 안내 버튼을 누르면 알리고 다이얼로그는 상태가 열 때만 보인다`() {
        val review = AiReviews.completed()
        show(state(AiPill.View, resultSheet(review), review = review))
        count("ai-result-sheet.criteria-dialog").assertCountEquals(0)
        tag("ai-result-sheet.criteria-info-button").performClick()
        assertEquals(1, clicks.help)
    }

    @Test
    fun `TC-AIR-052 기준 안내 다이얼로그는 제목을 보이고 닫기 버튼으로 닫을 수 있다`() {
        val review = AiReviews.completed()
        show(state(AiPill.View, resultSheet(review), criteriaDialogOpen = true, review = review))
        tag("ai-result-sheet.criteria-dialog").assertIsDisplayed().assertShowsAll(copy["ai.result.criteria-dialog-title"])
        tag("ai-result-sheet.criteria-close-button").performClick()
        assertEquals(1, clicks.helpDismiss)
    }

    @Test
    fun `TC-AIR-049 결과 시트 닫기 버튼은 닫힘을 알린다`() {
        val review = AiReviews.completed()
        show(state(AiPill.View, resultSheet(review), review = review))
        tag("ai-result-sheet.close-button").performClick()
        assertEquals(1, clicks.dismiss)
    }

    // ---- failure sheet (TC-AIR-015, 016, 053) --------------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-053 실패 시트는 제목과 확인 버튼을 보이고 확인은 닫힘을 알린다`() {
        show(state(AiPill.Retry, AiSheet.Failed(null), review = AiReviews.failed(canRequestAgain = true)))
        tag("ai-failed-sheet.root").assertIsDisplayed().assertShowsAll(copy["ai.failed.title"])
        tag("ai-failed-sheet.confirm-button").assertShowsAll(copy["ai.failed.confirm"])
        tag("ai-failed-sheet.confirm-button").performClick()
        assertEquals(1, clicks.dismiss)
    }

    @Test
    fun `TC-AIR-053 재요청 가능한 오늘 게시물이면 실패 시트에 재요청 버튼이 있고 누르면 알약 탭으로 알린다`() {
        show(state(AiPill.Retry, AiSheet.Failed(null), review = AiReviews.failed(canRequestAgain = true)))
        count("ai-failed-sheet.message").assertCountEquals(0)
        tag("ai-failed-sheet.retry-button").assertIsEnabled().assertShowsAll(copy["ai.pill.retry"])
        tag("ai-failed-sheet.retry-button").performClick()
        assertEquals(1, clicks.pill)
    }

    @Test
    fun `TC-AIR-015 재요청 불가이면 실패 시트에 더 이상 요청할 수 없어요 문구만 있고 재요청 버튼이 없다`() {
        show(state(AiPill.Failed, AiSheet.Failed("ai.failed.no-more"), review = AiReviews.failed(canRequestAgain = false)))
        tag("ai-failed-sheet.message").assertShowsAll(copy["ai.failed.no-more"])
        count("ai-failed-sheet.retry-button").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-016 지난 주제 게시물의 실패 시트는 오늘 올린 사진만 재요청할 수 있어요를 안내하고 재요청 버튼이 없다`() {
        show(state(AiPill.Failed, AiSheet.Failed("ai.failed.past"), review = AiReviews.failed(canRequestAgain = true)))
        tag("ai-failed-sheet.message").assertShowsAll(copy["ai.failed.past"])
        count("ai-failed-sheet.retry-button").assertCountEquals(0)
    }

    // ---- toast (TC-AIR-026, 027, 030) ----------------------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-027 복사본 키 토스트는 문구로 보인다`() {
        show(state(AiPill.Request, toast = AiToast(1, "ai.error.banned", null), review = AiReviews.none()))
        tag("toast.message").assertShowsAll(copy["ai.error.banned"])
    }

    @Test
    fun `TC-AIR-026 서버 message 토스트는 서버 문구를 그대로 보인다`() {
        val server = "더 이상 AI 리뷰를 다시 요청할 수 없습니다."
        show(state(AiPill.Retry, toast = AiToast(2, null, server), review = AiReviews.failed(canRequestAgain = true)))
        tag("toast.message").assertShowsAll(server)
    }

    @Test
    fun `TC-AIR-030 토스트는 표시 시간이 지나면 자기 id 로 만료를 알린다`() {
        rule.mainClock.autoAdvance = false
        show(state(AiPill.Request, toast = AiToast(7, "ai.error.network", null), review = AiReviews.none()))
        assertTrue(rule.onAllNodesWithTag("toast.message").fetchSemanticsNodes().isNotEmpty())
        rule.mainClock.advanceTimeBy(AppConstants.TOAST_DURATION_MS + 100)
        assertEquals(listOf(7L), clicks.expired)
    }

    // ---- terminology / test ids (TC-AIR-054, 057) ----------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-054 화면의 어떤 상태에서도 AI 리뷰 용어가 노출되지 않는다`() {
        val completed = AiReviews.completed()
        val states = listOf(
            state(AiPill.Request, sheet = AiSheet.Start(false), review = AiReviews.none()),
            state(AiPill.Retry, sheet = AiSheet.Start(true), review = AiReviews.failed(true)),
            state(AiPill.View, sheet = resultSheet(completed), criteriaDialogOpen = true, review = completed),
            state(AiPill.Failed, sheet = AiSheet.Failed("ai.failed.no-more"), review = AiReviews.failed(false)),
            state(AiPill.Recheck, notice = "ai.poll.timeout"),
            state(AiPill.Processing, review = AiReviews.processing()),
        )
        showEach(states) { rule.onAllNodes(hasText("AI 리뷰", substring = true)).assertCountEquals(0) }
    }

    @Test
    fun `TC-AIR-057 알약 시트 결과 실패 영역의 식별자가 모두 존재한다`() {
        val completed = AiReviews.completed()
        val expected = mapOf(
            state(AiPill.Request, sheet = AiSheet.Start(false), review = AiReviews.none()) to
                listOf("feed.ai-request-button", "ai-start-sheet.root", "ai-start-sheet.description", "ai-start-sheet.start-button", "ai-start-sheet.close-button"),
            state(AiPill.View, sheet = resultSheet(completed), criteriaDialogOpen = true, review = completed) to
                listOf(
                    "feed.ai-result-button", "ai-result-sheet.root", "ai-result-sheet.overall-score", "ai-result-sheet.criteria-item-COMPOSITION",
                    "ai-result-sheet.distinctive-badge", "ai-result-sheet.feedback-summary", "ai-result-sheet.feedback-strength",
                    "ai-result-sheet.feedback-weakness", "ai-result-sheet.feedback-suggestion", "ai-result-sheet.criteria-info-button",
                    "ai-result-sheet.criteria-dialog", "ai-result-sheet.close-button", "ai-result-sheet.criteria-close-button",
                ),
            state(AiPill.Retry, sheet = AiSheet.Failed(null), review = AiReviews.failed(true)) to
                listOf("feed.ai-retry-button", "ai-failed-sheet.root", "ai-failed-sheet.retry-button", "ai-failed-sheet.confirm-button"),
            state(AiPill.Failed, sheet = AiSheet.Failed("ai.failed.no-more"), review = AiReviews.failed(false)) to
                listOf("feed.ai-failed-button", "ai-failed-sheet.root", "ai-failed-sheet.message"),
            state(AiPill.Recheck, notice = "ai.poll.timeout") to listOf("feed.ai-recheck-button", "feed.ai-message"),
        )
        val tagsOf = expected.entries.toList()
        var i = 0
        showEach(tagsOf.map { it.key }) { tagsOf[i++].value.forEach { count(it).assertCountEquals(1) } }
    }
}
