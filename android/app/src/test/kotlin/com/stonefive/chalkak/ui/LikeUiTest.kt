package com.stonefive.chalkak.ui

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
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.PostHarness
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.ui.display.DisplayRoute
import com.stonefive.chalkak.ui.feed.FeedRoute
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.feature.display.DisplayStateHolder
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Hearts of the display grid and the detail (LIKE), driven through the real holders and `LikeController`. */
@RunWith(RobolectricTestRunner::class)
class LikeUiTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val h = PostHarness()
    private val images = ImageProbe()
    private val like500 = PostFixtures.failure("like/posts-likes-put__500-server-error.json")

    @After
    fun tearDown() = h.close()

    private fun showDisplay(): Pair<DisplayStateHolder, List<PostSummary>> {
        val holder = h.display()
        rule.setContent { TestApp(copy) { DisplayRoute(holder, images.slot, onOpenFeed = {}) } }
        rule.waitForIdle()
        tag("display.root").assertIsDisplayed()
        return holder to holder.state.value.photos
    }

    private fun showFeed(holder: FeedStateHolder) {
        rule.setContent {
            TestApp(copy) {
                FeedRoute(holder, images.slot, onBack = {}, onDeleted = { _, _ -> }, onClosed = {}, onLoginRequired = {})
            }
        }
        rule.waitForIdle()
        tag("feed.root").assertIsDisplayed()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun describesCount(n: Int) = SemanticsMatcher("content description names the like count $n") { node ->
        node.config.getOrNull(SemanticsProperties.ContentDescription)?.any { it.contains(n.toString()) } == true
    }

    @Test
    fun `TC-LIKE-003 전시 그리드의 하트를 누르면 서버 응답 전에 즉시 선택되고 개수가 1 늘어난다`() {
        val (_, photos) = showDisplay()
        val post = photos.first { !it.isLiked }
        val gate = h.server.hold(post.id)
        tag("display.like-button-${post.id}").assertIsNotSelected()
        tag("display.like-count-${post.id}").assertTextEquals(post.likeCount.toString())

        tag("display.like-button-${post.id}").performClick()
        rule.waitForIdle()

        // The request is still waiting on its gate.
        assertEquals(listOf("PUT ${post.id}"), h.server.calls.toList())
        tag("display.like-button-${post.id}").assertIsSelected()
        tag("display.like-count-${post.id}").assertTextEquals((post.likeCount + 1).toString())

        gate.complete(Unit)
        rule.waitForIdle()
        tag("display.like-button-${post.id}").assertIsSelected()
    }

    @Test
    fun `TC-LIKE-003 이미 좋아요한 하트를 누르면 즉시 해제되고 개수가 1 줄어든다`() {
        val (_, photos) = showDisplay()
        val post = photos.first { it.isLiked }
        h.server.hold(post.id)

        tag("display.like-button-${post.id}").assertIsSelected()
        tag("display.like-button-${post.id}").performClick()
        rule.waitForIdle()

        tag("display.like-button-${post.id}").assertIsNotSelected()
        tag("display.like-count-${post.id}").assertTextEquals((post.likeCount - 1).toString())
    }

    @Test
    fun `TC-LIKE-006 상세의 하트를 누르면 즉시 낙관 반영된다`() {
        h.repo.details.always(POST_OTHER, PostFixtures.detailResult("feed/posts-detail__other.json"))
        val detail = PostFixtures.detail("feed/posts-detail__other.json")
        showFeed(h.feed(FeedEntry.FromPush(POST_OTHER)))
        val gate = h.server.hold(POST_OTHER)

        tag("feed.like-button").assertIsEnabled().assertIsNotSelected()
        tag("feed.like-button").performClick()
        rule.waitForIdle()

        assertEquals(listOf("PUT $POST_OTHER"), h.server.calls.toList())
        tag("feed.like-button").assertIsSelected()
        tag("feed.like-count").assertTextEquals((detail.likeCount + 1).toString())
        gate.complete(Unit)
    }

    @Test
    fun `TC-LIKE-024 상세 확정 전 전시 시드의 하트는 막히고 확정 후에만 허용된다`() {
        val seed = PostFixtures.summary("202")
        val details = kr.chalkak.core.data.post.testing.gated(PostFixtures.detailResult("feed/posts-detail__other.json"))
        h.repo.details.enqueue(seed.id, details)
        showFeed(h.feed(FeedEntry.FromDisplay(seed)))

        tag("feed.like-button").assertIsNotEnabled()
        tag("feed.like-button").performClick()
        rule.waitForIdle()
        assertTrue(h.server.calls.isEmpty(), "no like request before the detail is confirmed")
        assertTrue(h.repo.likeCalls.isEmpty())
        tag("feed.like-button").assertIsNotSelected()
        tag("feed.like-count").assertTextEquals(seed.likeCount.toString())

        details.release()
        rule.waitForIdle()
        tag("feed.like-button").assertIsEnabled()
        tag("feed.like-button").performClick()
        rule.waitForIdle()
        assertEquals(listOf("PUT ${seed.id}"), h.server.calls.toList())
        tag("feed.like-button").assertIsSelected()
    }

    @Test
    fun `TC-LIKE-030 서로 다른 두 사진이 연달아 실패하면 같은 문구 토스트가 두 번 모두 표시된다`() {
        val (holder, photos) = showDisplay()
        val (a, b) = photos.filter { !it.isLiked }.take(2)
        h.server.failNext(a.id, like500)
        h.server.failNext(b.id, like500)

        tag("display.like-button-${a.id}").performClick()
        rule.waitForIdle()
        val first = assertNotNull(holder.state.value.toast)
        tag("toast.message").assertIsDisplayed().assertTextEquals(copy["like.error.generic"])
        // Rolled back.
        tag("display.like-button-${a.id}").assertIsNotSelected()
        tag("display.like-count-${a.id}").assertTextEquals(a.likeCount.toString())

        rule.mainClock.advanceTimeBy(2_000)
        tag("display.like-button-${b.id}").performClick()
        rule.waitForIdle()
        val second = assertNotNull(holder.state.value.toast)
        assertNotEquals(first.id, second.id, "every toast gets its own id")
        assertEquals(first.copyKey, second.copyKey)
        tag("toast.message").assertIsDisplayed().assertTextEquals(copy["like.error.generic"])
        tag("display.like-button-${b.id}").assertIsNotSelected()

        // The first toast's 2.5 s window has passed, the second one's has not: the new id restarted the timer.
        rule.mainClock.advanceTimeBy(1_000)
        tag("toast.message").assertIsDisplayed()
        rule.mainClock.advanceTimeBy(AppConstants.TOAST_DURATION_MS)
        rule.waitForIdle()
        rule.onAllNodesWithTag("toast.message").assertCountEquals(0)
        assertNull(holder.state.value.toast, "the expired toast is handed back to the holder")
    }

    @Test
    fun `TC-LIKE-034 그리드 하트는 selected와 개수를 노출하고 개수는 별도 요소다`() {
        val (_, photos) = showDisplay()
        val liked = photos.first { it.isLiked }
        val plain = photos.first { !it.isLiked }

        tag("display.like-button-${liked.id}").assertIsSelected().assertIsEnabled().assert(describesCount(liked.likeCount))
        tag("display.like-count-${liked.id}").assertTextEquals(liked.likeCount.toString())
        tag("display.like-button-${plain.id}").assertIsNotSelected().assert(describesCount(plain.likeCount))
        tag("display.like-count-${plain.id}").assertTextEquals(plain.likeCount.toString())
    }

    @Test
    fun `TC-LIKE-034 아카이브 추천 카드의 하트도 selected와 개수를 별도 요소로 노출한다`() {
        val holder = h.display(initialDate = com.stonefive.chalkak.testing.YESTERDAY)
        rule.setContent { TestApp(copy) { DisplayRoute(holder, images.slot, onOpenFeed = {}) } }
        rule.waitForIdle()
        tag("display.root").assertIsDisplayed()
        val post = holder.state.value.featured.first()

        val button = tag("display.featured-like-button-${post.id}")
        if (post.isLiked) button.assertIsSelected() else button.assertIsNotSelected()
        button.assert(describesCount(post.likeCount))
        tag("display.featured-like-count-${post.id}").assertTextEquals(post.likeCount.toString())
    }
}
