package com.stonefive.chalkak.ui.feed

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
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.PostHarness
import com.stonefive.chalkak.testing.TestApp
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
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_MINE_PAST
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.feature.display.FeedEntry
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * `FeedRoute` with an `AiReviewStateHolder`: the AI area appears for my confirmed post only, its target is
 * `AiReviewTarget(postId, topicDate)` from the detail, and it follows the feed route's lifecycle.
 */
@RunWith(RobolectricTestRunner::class)
class FeedRouteAiReviewTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private val h = PostHarness()
    private val ai = AiHarness()
    private val images = ImageProbe()
    private var onScreen by mutableStateOf(true)
    private val backs = mutableListOf<Unit>()
    private var logins = 0

    @After
    fun tearDown() {
        h.close()
        ai.close()
    }

    private fun ok(review: AiReview): ApiResult<AiReview> = ApiResult.Success(review)

    private fun show(postId: String, fixture: String, finishOnLeave: Boolean = true) {
        h.repo.details.always(postId, PostFixtures.detailResult(fixture))
        showHolder(postId, finishOnLeave)
    }

    private fun showHolder(postId: String, finishOnLeave: Boolean = true) {
        val holder = h.feed(FeedEntry.FromPush(postId))
        val aiHolder = ai.holder()
        rule.setContent {
            TestApp(copy) {
                if (onScreen) {
                    FeedRoute(
                        holder = holder,
                        remoteImage = images.slot,
                        onBack = { backs += Unit },
                        onDeleted = { _, _ -> },
                        onClosed = {},
                        onLoginRequired = { logins++ },
                        finishOnLeave = finishOnLeave,
                        aiReview = aiHolder,
                    )
                }
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

    @Test
    fun `TC-AIR-011 내 오늘 게시물 상세에 들어오면 그 게시물의 GET 만 한 번 보내고 AI 피드백 받기를 보인다`() {
        show(POST_MINE, "feed/posts-detail__mine-today.json")
        tag("feed.root").assertIsDisplayed()
        tag("feed.ai-request-button").assertIsDisplayed().assertShowsAll(copy["ai.pill.request"])
        assertEquals(listOf(FakeAiReviewRepository.Call("GET", POST_MINE)), ai.repo.calls.toList())
    }

    @Test
    fun `TC-AIR-017 남의 게시물 상세에는 AI 알약이 없고 AI 조회가 0건이다`() {
        show(POST_OTHER, "feed/posts-detail__other.json")
        tag("feed.root").assertIsDisplayed()
        count("feed.ai-request-button").assertCountEquals(0)
        count("feed.ai-processing").assertCountEquals(0)
        assertTrue(ai.repo.calls.isEmpty())
    }

    @Test
    fun `TC-AIR-017 상세 응답이 확정되기 전에는 대상이 없어 AI 조회가 0건이고 확정되면 한 번이다`() {
        val gate = gated(PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        h.repo.details.enqueue(POST_MINE, gate)
        showHolder(POST_MINE)
        assertTrue(ai.repo.calls.isEmpty())
        count("feed.ai-request-button").assertCountEquals(0)

        gate.release()
        rule.waitForIdle()
        assertEquals(1, ai.repo.getCount)
        tag("feed.ai-request-button").assertIsDisplayed()
    }

    @Test
    fun `TC-AIR-016 지난 주제의 내 게시물은 재요청 가능 실패여도 재요청 버튼이 없고 오늘 올린 사진만 안내가 보인다`() {
        ai.repo.scriptGet(ok(AiReviews.failed(canRequestAgain = true)))
        show(POST_MINE_PAST, "feed/posts-detail__mine-past.json")
        count("feed.ai-retry-button").assertCountEquals(0)
        tag("feed.ai-failed-button").performClick()
        rule.waitForIdle()
        tag("ai-failed-sheet.message").assertShowsAll(copy["ai.failed.past"])
        count("ai-failed-sheet.retry-button").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-016 지난 주제의 내 게시물이 NONE 이면 새 요청 알약이 없다`() {
        show(POST_MINE_PAST, "feed/posts-detail__mine-past.json")
        assertEquals(1, ai.repo.getCount)
        count("feed.ai-request-button").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-020 AI 시트가 열려도 게시물 상세는 그대로 남고 분석 시작하기는 POST 1회이다`() {
        show(POST_MINE, "feed/posts-detail__mine-today.json")
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.root").assertIsDisplayed()
        tag("feed.root").assertIsDisplayed()
        tag("ai-start-sheet.start-button").performClick()
        rule.waitForIdle()
        assertEquals(listOf(POST_MINE), ai.repo.posts().map { it.postId })
        tag("feed.ai-processing").assertIsDisplayed()
    }

    @Test
    fun `AI 시트가 열려 있을 때 시스템 뒤로 가기는 시트만 닫고 상세는 닫지 않는다`() {
        show(POST_MINE, "feed/posts-detail__mine-today.json")
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        systemBack()
        count("ai-start-sheet.root").assertCountEquals(0)
        assertTrue(backs.isEmpty())
        systemBack()
        assertEquals(1, backs.size)
    }

    @Test
    fun `AI 조회의 401 재인증 필요는 상세의 onLoginRequired 로 알린다`() {
        ai.repo.scriptGet(aiHttpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED))
        show(POST_MINE, "feed/posts-detail__mine-today.json")
        assertEquals(1, logins)
    }

    @Test
    fun `TC-AIR-042 상세를 떠나면 늦게 온 AI 응답은 상태를 바꾸지 않는다`() {
        val gate = CompletableDeferred<Unit>()
        ai.repo.scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate))
        h.repo.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        val aiHolder = ai.holder()
        val holder = h.feed(FeedEntry.FromPush(POST_MINE))
        rule.setContent {
            TestApp(copy) {
                if (onScreen) FeedRoute(holder, images.slot, {}, { _, _ -> }, {}, {}, aiReview = aiHolder)
            }
        }
        rule.waitForIdle()
        onScreen = false
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertNull(aiHolder.state.value.review)
        assertEquals(1, ai.repo.getCount)
    }
}
