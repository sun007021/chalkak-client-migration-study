package com.stonefive.chalkak.ui.aireview

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.AiHarness
import com.stonefive.chalkak.testing.TODAY
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.YESTERDAY
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kr.chalkak.core.data.aireview.testing.aiHttpFailure
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.feature.aireview.AiReviewStateHolder
import kr.chalkak.feature.aireview.AiReviewTarget
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `AiReviewRoute` over a real `AiReviewStateHolder` and a scripted repository (`shared/fixtures/ai-review` values). */
@RunWith(RobolectricTestRunner::class)
class AiReviewRouteTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private var h = AiHarness()
    private val post = AiReviews.POST_ID
    private val otherPost = "22222222-2222-4222-8222-222222222202"

    private var target by mutableStateOf<AiReviewTarget?>(AiReviewTarget(post, TODAY))
    private var onScreen by mutableStateOf(true)
    private var logins = 0

    @After
    fun tearDown() = h.close()

    private fun ok(review: AiReview): ApiResult<AiReview> = ApiResult.Success(review)

    private fun FakeAiReviewRepository.script(vararg gets: ApiResult<AiReview>) = scriptGet(*gets)

    private fun show(holder: AiReviewStateHolder, finishOnLeave: Boolean = true) {
        rule.setContent {
            TestApp(copy) {
                if (onScreen) AiReviewRoute(holder, target, onLoginRequired = { logins++ }, finishOnLeave = finishOnLeave)
            }
        }
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    private fun systemBack() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }

    // ---- enter: GET only (TC-AIR-011), pill per status (TC-AIR-012..015) --------------------------------------------------------------

    @Test
    fun `TC-AIR-011 NONE 게시물에 들어오면 GET 한 번만 보내고 POST 는 보내지 않고 AI 피드백 받기를 보인다`() {
        h.repo.script(ok(AiReviews.none()))
        show(h.holder())
        tag("feed.ai-request-button").assertIsDisplayed().assertShowsAll(copy["ai.pill.request"])
        assertEquals(listOf(FakeAiReviewRepository.Call("GET", post)), h.repo.calls.toList())
        assertEquals(0, h.repo.postCount)
    }

    @Test
    fun `TC-AIR-013 PROCESSING 이면 AI 분석중 알약이고 GET 은 첫 응답까지 한 번이다`() {
        h.repo.script(ok(AiReviews.processing()))
        show(h.holder())
        tag("feed.ai-processing").assertShowsAll(copy["ai.pill.processing"])
        assertEquals(1, h.repo.getCount)
        assertEquals(0, h.repo.postCount)
    }

    @Test
    fun `TC-AIR-014 COMPLETED 이면 AI 피드백 보기를 누르면 결과 시트가 열리고 닫기로 닫힌다`() {
        h.repo.script(ok(AiReviews.completed()))
        show(h.holder())
        count("ai-result-sheet.root").assertCountEquals(0)
        tag("feed.ai-result-button").performClick()
        rule.waitForIdle()
        tag("ai-result-sheet.root").assertIsDisplayed()
        tag("ai-result-sheet.feedback-summary").assertShowsAll(AiReviews.FEEDBACK.summary)
        tag("ai-result-sheet.close-button").performClick()
        rule.waitForIdle()
        count("ai-result-sheet.root").assertCountEquals(0)
        assertEquals(0, h.repo.postCount)
    }

    @Test
    fun `TC-AIR-049 결과 시트의 기준 안내를 열고 닫을 수 있다`() {
        h.repo.script(ok(AiReviews.completed()))
        show(h.holder())
        tag("feed.ai-result-button").performClick()
        rule.waitForIdle()
        tag("ai-result-sheet.criteria-info-button").performClick()
        rule.waitForIdle()
        tag("ai-result-sheet.criteria-dialog").assertShowsAll(copy["ai.result.criteria-dialog-title"])
        tag("ai-result-sheet.criteria-close-button").performClick()
        rule.waitForIdle()
        count("ai-result-sheet.criteria-dialog").assertCountEquals(0)
        tag("ai-result-sheet.root").assertIsDisplayed()
    }

    @Test
    fun `TC-AIR-015 FAILED 이고 재요청 가능이면 재요청 알약이 보이고 누르면 재요청 시트가 열린다`() {
        h.repo.script(ok(AiReviews.failed(canRequestAgain = true)))
        show(h.holder())
        tag("feed.ai-retry-button").assertShowsAll(copy["ai.pill.retry"])
        tag("feed.ai-retry-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.root").assertShowsAll(copy["ai.start.title-retry"])
        assertEquals(0, h.repo.postCount)
    }

    @Test
    fun `TC-AIR-015 FAILED 이고 재요청 불가이면 실패 알약만 있고 누르면 실패 시트에 사유가 보인다`() {
        h.repo.script(ok(AiReviews.failed(canRequestAgain = false)))
        show(h.holder())
        count("feed.ai-retry-button").assertCountEquals(0)
        tag("feed.ai-failed-button").performClick()
        rule.waitForIdle()
        tag("ai-failed-sheet.message").assertShowsAll(copy["ai.failed.no-more"])
        count("ai-failed-sheet.retry-button").assertCountEquals(0)
        tag("ai-failed-sheet.confirm-button").performClick()
        rule.waitForIdle()
        count("ai-failed-sheet.root").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-016 지난 주제 게시물은 실패여도 재요청이 막히고 오늘 올린 사진만 재요청 안내가 보인다`() {
        target = AiReviewTarget(post, YESTERDAY)
        h.repo.script(ok(AiReviews.failed(canRequestAgain = true)))
        show(h.holder())
        count("feed.ai-retry-button").assertCountEquals(0)
        tag("feed.ai-failed-button").performClick()
        rule.waitForIdle()
        tag("ai-failed-sheet.message").assertShowsAll(copy["ai.failed.past"])
        count("ai-failed-sheet.retry-button").assertCountEquals(0)
        assertEquals(0, h.repo.postCount)
    }

    // ---- request flow (TC-AIR-020, 022, 023, 026, 027) -------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-020 받기를 누르면 시작 시트가 뜨고 닫으면 POST 0건이다`() {
        show(h.holder())
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.root").assertShowsAll(copy["ai.start.title"])
        tag("ai-start-sheet.close-button").performClick()
        rule.waitForIdle()
        count("ai-start-sheet.root").assertCountEquals(0)
        assertEquals(0, h.repo.postCount)
        tag("feed.ai-request-button").assertIsDisplayed()
    }

    @Test
    fun `TC-AIR-020 분석 시작하기를 확정하면 POST 1회이고 시트가 닫히고 AI 분석중이 된다`() {
        h.repo.scriptPost(ok(AiReviews.processing()))
        show(h.holder())
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.start-button").performClick()
        rule.waitForIdle()
        count("ai-start-sheet.root").assertCountEquals(0)
        tag("feed.ai-processing").assertShowsAll(copy["ai.pill.processing"])
        assertEquals(listOf(post), h.repo.posts().map { it.postId })
    }

    @Test
    fun `TC-AIR-023 POST 응답을 기다리는 동안 AI 요청중이고 중복 확정에도 POST 는 한 번이다`() {
        val gate = CompletableDeferred<Unit>()
        val holder = h.holder()
        h.repo.scriptPost(FakeAiReviewRepository.Step(ok(AiReviews.processing()), gate))
        show(holder)
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.start-button").performClick()
        holder.onStartConfirmed()
        holder.onStartConfirmed()
        rule.waitForIdle()
        tag("feed.ai-requesting").assertShowsAll(copy["ai.pill.requesting"])
        assertEquals(1, h.repo.postCount)
        gate.complete(Unit)
        rule.waitForIdle()
        tag("feed.ai-processing").assertIsDisplayed()
        assertEquals(1, h.repo.postCount)
    }

    @Test
    fun `TC-AIR-026 POST 400 이면 서버 message 를 그대로 토스트로 보이고 다시 보내지 않는다`() {
        val server = "더 이상 AI 리뷰를 다시 요청할 수 없습니다."
        h.repo.script(ok(AiReviews.failed(canRequestAgain = true)))
        h.repo.scriptPost(aiHttpFailure(400, ErrorCode.BUSINESS_ERROR, server))
        show(h.holder())
        tag("feed.ai-retry-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.start-button").performClick()
        rule.waitForIdle()
        tag("toast.message").assertShowsAll(server)
        tag("feed.ai-retry-button").assertIsDisplayed()
        assertEquals(1, h.repo.postCount)
    }

    @Test
    fun `TC-AIR-027 POST 403 이면 이용이 제한되어 요청할 수 없다는 문구 토스트이고 GET 결과는 그대로다`() {
        h.repo.script(ok(AiReviews.none()))
        h.repo.scriptPost(aiHttpFailure(403, ErrorCode.FORBIDDEN, "차단된 회원입니다."))
        show(h.holder())
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.start-button").performClick()
        rule.waitForIdle()
        tag("toast.message").assertShowsAll(copy["ai.error.banned"])
        assertEquals(1, h.repo.postCount)
    }

    @Test
    fun `TC-AIR-040 첫 GET 이 실패하면 AI 상태 다시 확인 알약이고 누르면 GET 을 다시 보내 복구한다`() {
        h.repo.script(aiHttpFailure(500, ErrorCode.INTERNAL_ERROR), ok(AiReviews.none()))
        show(h.holder())
        tag("feed.ai-recheck-button").assertShowsAll(copy["ai.pill.recheck"])
        tag("toast.message").assertShowsAll(copy["ai.error.load"])
        tag("feed.ai-recheck-button").performClick()
        rule.waitForIdle()
        tag("feed.ai-request-button").assertIsDisplayed()
        assertEquals(2, h.repo.getCount)
        assertEquals(0, h.repo.postCount)
    }

    // ---- target / user wiring (TC-AIR-017, 044; setTarget before onScreenShown) -----------------------------------------------------

    @Test
    fun `TC-AIR-017 대상이 없으면 GET 도 알약도 없다 대상이 나중에 정해지면 GET 은 정확히 한 번이다`() {
        target = null
        show(h.holder())
        assertTrue(h.repo.calls.isEmpty())
        count("feed.ai-request-button").assertCountEquals(0)

        target = AiReviewTarget(post, TODAY)
        rule.waitForIdle()
        assertEquals(1, h.repo.getCount)
        tag("feed.ai-request-button").assertIsDisplayed()
    }

    @Test
    fun `setTarget 이 onScreenShown 보다 먼저라서 대상이 있는 첫 진입의 GET 은 정확히 한 번이다`() {
        show(h.holder())
        assertEquals(1, h.repo.getCount)
        assertEquals(post, h.repo.calls.single().postId)
    }

    @Test
    fun `TC-AIR-017 게스트는 대상이 있어도 GET 0건이고 알약이 없다`() {
        h.close()
        h = AiHarness(userId = null)
        show(h.holder())
        assertTrue(h.repo.calls.isEmpty())
        count("feed.ai-request-button").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-044 게시물 A 에서 B 로 바뀌면 이전 응답을 버리고 B 를 조회해 B 의 상태를 보인다`() {
        val gateA = CompletableDeferred<Unit>()
        h.repo.scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gateA))
        h.repo.scriptGet(ok(AiReviews.none()))
        show(h.holder())
        target = AiReviewTarget(otherPost, TODAY)
        rule.waitForIdle()
        gateA.complete(Unit)
        rule.waitForIdle()
        assertEquals(listOf(post, otherPost), h.repo.gets().map { it.postId })
        tag("feed.ai-request-button").assertIsDisplayed()
        count("feed.ai-result-button").assertCountEquals(0)
    }

    @Test
    fun `LoginRequired 효과가 오면 onLoginRequired 를 호출한다`() {
        h.repo.script(aiHttpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED))
        show(h.holder())
        assertEquals(1, logins)
    }

    // ---- leaving (TC-AIR-042) -----------------------------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-042 화면을 떠나면 늦게 온 GET 응답은 상태를 바꾸지 않고 홀더는 끝난다`() {
        val gate = CompletableDeferred<Unit>()
        h.repo.scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate))
        val holder = h.holder()
        show(holder)
        onScreen = false
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertNull(holder.state.value.review)
        holder.onScreenShown() // cleared: nothing starts again
        rule.waitForIdle()
        assertEquals(1, h.repo.getCount)
    }

    @Test
    fun `TC-AIR-042 finishOnLeave 가 false 이면 떠날 때 숨기기만 하고 다시 들어오면 GET 부터 새로 시작한다`() {
        val holder = h.holder()
        show(holder, finishOnLeave = false)
        assertEquals(1, h.repo.getCount)
        onScreen = false
        rule.waitForIdle()
        onScreen = true
        rule.waitForIdle()
        assertEquals(2, h.repo.getCount)
        assertEquals(0, h.repo.postCount)
        tag("feed.ai-request-button").assertIsDisplayed()
    }

    // ---- sheets and system back --------------------------------------------------------------------------------------------------

    @Test
    fun `시트가 열려 있을 때 시스템 뒤로 가기는 시트를 닫는다`() {
        show(h.holder())
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.root").assertIsDisplayed()
        systemBack()
        count("ai-start-sheet.root").assertCountEquals(0)
        assertEquals(0, h.repo.postCount)
    }

    // ---- push entry (TC-AIR-058) ----------------------------------------------------------------------------------------------------

    @Test
    fun `TC-AIR-058 푸시로 들어왔고 COMPLETED 이면 결과 시트가 한 번 자동으로 열리고 다시 들어와도 열리지 않는다`() {
        h.repo.script(ok(AiReviews.completed()))
        show(h.holder(openSheetOnEntry = true), finishOnLeave = false)
        tag("ai-result-sheet.root").assertIsDisplayed()
        tag("ai-result-sheet.close-button").performClick()
        rule.waitForIdle()
        onScreen = false
        rule.waitForIdle()
        onScreen = true
        rule.waitForIdle()
        count("ai-result-sheet.root").assertCountEquals(0)
        tag("feed.ai-result-button").assertIsDisplayed()
    }

    @Test
    fun `TC-AIR-058 푸시로 들어왔고 FAILED 이면 실패 시트가 자동으로 열린다`() {
        h.repo.script(ok(AiReviews.failed(canRequestAgain = true)))
        show(h.holder(openSheetOnEntry = true))
        tag("ai-failed-sheet.root").assertShowsAll(copy["ai.failed.title"])
    }

    @Test
    fun `TC-AIR-058 푸시로 들어왔어도 PROCESSING 이나 NONE 이면 시트는 열리지 않는다`() {
        h.repo.script(ok(AiReviews.processing()))
        show(h.holder(openSheetOnEntry = true))
        count("ai-result-sheet.root").assertCountEquals(0)
        count("ai-failed-sheet.root").assertCountEquals(0)
        count("ai-start-sheet.root").assertCountEquals(0)
    }
}
