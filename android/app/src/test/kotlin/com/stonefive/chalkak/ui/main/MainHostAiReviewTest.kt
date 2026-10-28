package com.stonefive.chalkak.ui.main

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.aireview.testing.FakeAiReviewRepository
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.Route
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * [MainHost] wiring of the AI feedback holder: one `AiReviewStateHolder` per stacked feed (`MainDependencies.newAiReviewHolder`),
 * entered with the feed, hidden while another screen covers it, finished when the feed entry leaves the stack.
 */
@RunWith(RobolectricTestRunner::class)
class MainHostAiReviewTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private val rig = MainRig()

    @After
    fun tearDown() = rig.close()

    private fun ok(review: AiReview): ApiResult<AiReview> = ApiResult.Success(review)

    private fun launchOnFeed(postId: String = POST_MINE, fixture: String = "feed/posts-detail__mine-today.json", setup: MainRig.() -> Unit = {}) {
        rig.posts.details.always(postId, PostFixtures.detailResult(fixture))
        rig.setup()
        rig.launch(rule, copy)
        rule.awaitTag("home.hero-photo")
        rule.runOnUiThread { rig.nav.open(Route.Feed(postId, FeedSource.ById)) }
        rule.awaitTag("feed.root")
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun systemBack() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }

    @Test
    fun `TC-AIR-011 내 게시물 상세를 열면 AI 홀더가 하나 만들어지고 GET 만 보내며 AI 피드백 받기를 보인다`() {
        launchOnFeed()
        rule.awaitTag("feed.ai-request-button")
        tag("feed.ai-request-button").assertShowsAll(copy["ai.pill.request"])
        assertEquals(1, rig.aiHolders.size)
        assertEquals(listOf(FakeAiReviewRepository.Call("GET", POST_MINE)), rig.aiRepo.calls.toList())
    }

    @Test
    fun `TC-AIR-017 남의 게시물 상세에는 AI 알약이 없고 AI 조회가 0건이다`() {
        launchOnFeed(POST_OTHER, "feed/posts-detail__other.json")
        assertTrue(rig.aiRepo.calls.isEmpty())
        rule.onAllNodesWithTag("feed.ai-request-button").assertCountEquals(0)
    }

    @Test
    fun `TC-AIR-020 홈에서 연 상세의 AI 시트에서 분석 시작하기를 누르면 POST 1회이고 분석중이 된다`() {
        launchOnFeed()
        rule.awaitTag("feed.ai-request-button")
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        tag("ai-start-sheet.root").assertIsDisplayed()
        tag("ai-start-sheet.start-button").performClick()
        rule.waitForIdle()
        assertEquals(1, rig.aiRepo.postCount)
        tag("feed.ai-processing").assertIsDisplayed()
    }

    @Test
    fun `TC-AIR-042 상세를 뒤로 가기로 떠나면 AI 홀더가 끝나 늦게 온 응답이 상태를 바꾸지 않는다`() {
        val gate = CompletableDeferred<Unit>()
        launchOnFeed { aiRepo.scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate)) }
        val holder = rig.aiHolders.single()
        systemBack()
        tag("home.root").assertIsDisplayed()
        gate.complete(Unit)
        rule.waitForIdle()
        assertNull(holder.state.value.review)
        holder.onScreenShown() // finished with the feed entry
        rule.waitForIdle()
        assertEquals(1, rig.aiRepo.getCount)
    }

    @Test
    fun `TC-AIR-042 상세 위에 다른 화면이 덮이면 AI 홀더는 숨기만 하고 돌아오면 같은 홀더가 GET 부터 다시 시작한다`() {
        val gate = CompletableDeferred<Unit>()
        launchOnFeed { aiRepo.scriptGet(FakeAiReviewRepository.Step(ok(AiReviews.completed()), gate)) }
        val holder = rig.aiHolders.single()
        rule.runOnUiThread { rig.nav.open(Route.Notifications) }
        rule.awaitTag("notifications.root")
        gate.complete(Unit)
        rule.waitForIdle()
        assertNull(holder.state.value.review, "answer that arrived while covered is discarded")

        systemBack()
        rule.awaitTag("feed.root")
        rule.waitForIdle()
        assertEquals(1, rig.aiHolders.size)
        assertEquals(2, rig.aiRepo.getCount)
        assertEquals(0, rig.aiRepo.postCount)
    }

    @Test
    fun `AI 시트가 열려 있을 때 시스템 뒤로 가기는 시트만 닫고 상세에 머문다`() {
        launchOnFeed()
        rule.awaitTag("feed.ai-request-button")
        tag("feed.ai-request-button").performClick()
        rule.waitForIdle()
        systemBack()
        rule.onAllNodesWithTag("ai-start-sheet.root").assertCountEquals(0)
        tag("feed.root").assertIsDisplayed()
        assertEquals(FeedSource.ById, (rig.nav.top as Route.Feed).source)
    }
}
