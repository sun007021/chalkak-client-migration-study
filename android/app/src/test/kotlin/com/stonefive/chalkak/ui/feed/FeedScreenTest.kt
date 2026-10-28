package com.stonefive.chalkak.ui.feed

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.height
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.PostHarness
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_MINE_PAST
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import kr.chalkak.feature.display.FeedStatus
import kr.chalkak.feature.display.FeedUiState
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Stateless `FeedScreen` over real `FeedUiState`s from `FeedStateHolder` + `shared/fixtures/feed`. */
@RunWith(RobolectricTestRunner::class)
class FeedScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val h = PostHarness()
    private val images = ImageProbe()
    private val mineToday = "feed/posts-detail__mine-today.json"
    private val mineTodayId = POST_MINE

    @After
    fun tearDown() = h.close()

    private fun serve(path: String, id: String) = h.repo.details.always(id, PostFixtures.detailResult(path))

    /** A shown holder: [entry] open, the detail already answered. */
    private fun opened(entry: FeedEntry): FeedStateHolder {
        val holder = h.feed(entry)
        holder.onScreenShown()
        return holder
    }

    private fun show(state: FeedUiState, callbacks: FeedCallbacks = FeedCallbacks()) {
        rule.setContent { TestApp(copy) { FeedScreen(state, callbacks, images.slot) } }
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    private fun dateLabel(month: Int, day: Int) = copy.format("feed.date-label", "M" to month, "d" to day)

    // The copy placeholder is literally {제목}.
    private fun photoAlt(title: String) = copy.format("feed.photo-alt", "제목" to title)

    @Test
    fun `TC-FEED-001 전시 시드는 즉시 보이고 상세가 확정되기 전에는 좋아요가 비활성이다`() {
        val seed = PostFixtures.summary("202")
        val gate = gated(PostFixtures.detailResult("feed/posts-detail__other.json"))
        h.repo.details.enqueue(POST_OTHER, gate)
        val holder = opened(FeedEntry.FromDisplay(seed))
        var state by mutableStateOf(holder.state.value)
        assertFalse(state.confirmed)
        rule.setContent { TestApp(copy) { FeedScreen(state, FeedCallbacks(), images.slot) } }

        tag("feed.root").assertIsDisplayed()
        tag("feed.photo").assertIsDisplayed()
        tag("feed.title").assertTextEquals(requireNotNull(seed.title))
        tag("feed.like-count").assertTextEquals(seed.likeCount.toString())
        tag("feed.like-button").assertIsNotEnabled().assertIsNotSelected()
        assertTrue(images.drewUrl(seed.originalImageUrl) || images.drewUrl(seed.thumbnailOrOriginalUrl))
        count("feed.loading").assertCountEquals(0)

        gate.release()
        state = holder.state.value
        rule.waitForIdle()
        assertTrue(state.confirmed)
        tag("feed.like-button").assertIsEnabled()
        tag("feed.date-label").assertTextEquals(dateLabel(10, 27))
    }

    @Test
    fun `TC-FEED-001 푸시로 연 상세는 응답 전에 로딩만 보이고 사진은 없다`() {
        h.repo.details.enqueue(POST_MINE, gated(PostFixtures.detailResult(mineToday)))
        val holder = opened(FeedEntry.FromPush(POST_MINE))
        assertEquals(FeedStatus.Loading, holder.state.value.status)
        show(holder.state.value)

        tag("feed.loading").assertIsDisplayed()
        count("feed.photo").assertCountEquals(0)
        count("feed.error-state").assertCountEquals(0)
        count("feed.not-found-state").assertCountEquals(0)
        tag("feed.back-button").assertIsDisplayed()
    }

    @Test
    fun `TC-FEED-007 404이면 게시물을 찾을 수 없어요 화면이고 오류 화면과 조작 버튼은 없다`() {
        h.repo.details.always(POST_OTHER, PostFixtures.failure("feed/posts-detail__404-not-found.json"))
        val holder = opened(FeedEntry.FromPush(POST_OTHER))
        assertEquals(FeedStatus.NotFound, holder.state.value.status)
        show(holder.state.value)

        tag("feed.not-found-state").assertIsDisplayed().assertShowsAll(copy["feed.error.not-found"])
        tag("feed.back-button").assertIsDisplayed()
        listOf("feed.error-state", "feed.retry-button", "feed.loading", "feed.like-button", "feed.edit-title-button", "feed.delete-button")
            .forEach { count(it).assertCountEquals(0) }
        // Going back is what drops the post from the list: the holder marks it removed.
        assertTrue(h.changes.isRemoved(POST_OTHER))
    }

    @Test
    fun `TC-FEED-008 잘못된 ID 400은 일반 오류 문구와 다시 시도를 보인다`() {
        h.repo.details.always(POST_OTHER, PostFixtures.failure("feed/posts-detail__400-invalid-id.json"))
        val holder = opened(FeedEntry.FromPush(POST_OTHER))
        show(holder.state.value)

        tag("feed.error-state").assertIsDisplayed().assertShowsAll(copy["feed.error.load"])
        tag("feed.retry-button").assertIsDisplayed().assertIsEnabled()
        count("feed.not-found-state").assertCountEquals(0)
        count("feed.photo").assertCountEquals(0)
    }

    @Test
    fun `TC-FEED-008 500도 같은 일반 오류이고 연결 실패는 네트워크 문구다`() {
        h.repo.details.always(POST_OTHER, PostFixtures.failure("feed/posts-detail__500-server-error.json"))
        show(opened(FeedEntry.FromPush(POST_OTHER)).state.value)
        tag("feed.error-state").assertShowsAll(copy["feed.error.load"])
        tag("feed.retry-button").assertIsDisplayed()
    }

    @Test
    fun `TC-FEED-008 연결 실패이면 네트워크 연결을 확인해 주세요를 보인다`() {
        h.repo.details.always(POST_OTHER, PostFixtures.network())
        show(opened(FeedEntry.FromPush(POST_OTHER)).state.value)
        tag("feed.error-state").assertShowsAll(copy["common.error.network"])
        tag("feed.retry-button").assertIsDisplayed()
    }

    @Test
    fun `TC-FEED-013 날짜 라벨 제목 사진 설명 사인을 보이고 날짜는 기기 시간대와 무관하다`() {
        serve(mineToday, mineTodayId)
        val detail = PostFixtures.detail(mineToday)
        withDevice(zoneId = "Pacific/Kiritimati") {
            val holder = opened(FeedEntry.FromPush(mineTodayId))
            show(holder.state.value)

            tag("feed.date-label").assertTextEquals(dateLabel(10, 27))
            tag("feed.title").assertTextEquals(requireNotNull(detail.title))
            tag("feed.photo").assertIsDisplayed().assertContentDescriptionEquals(photoAlt(requireNotNull(detail.title)))
            tag("feed.signature-image").assertIsDisplayed()
            assertTrue(images.drewUrl(detail.originalImageUrl), "the photo uses the original image")
            assertTrue(images.drewUrl(detail.signatureOriginalImageUrl), "the signature is drawn over the photo")
        }
    }

    @Test
    fun `TC-FEED-013 제목이 없으면 무제와 제목 없는 작품 설명을 보인다`() {
        val path = "feed/posts-detail__no-title.json"
        h.repo.details.always("22222222-2222-4222-8222-222222222204", PostFixtures.detailResult(path))
        val holder = opened(FeedEntry.FromPush("22222222-2222-4222-8222-222222222204"))
        show(holder.state.value)

        tag("feed.title").assertTextEquals(copy["feed.title-none"])
        tag("feed.photo").assertContentDescriptionEquals(copy["feed.photo-alt-none"])
        tag("feed.date-label").assertTextEquals(dateLabel(10, 27))
    }

    @Test
    fun `TC-FEED-014 사인 이미지를 불러오지 못해도 사진과 제목은 정상이고 사인만 생략된다`() {
        serve(mineToday, mineTodayId)
        val detail = PostFixtures.detail(mineToday)
        images.fails = { it == detail.signatureOriginalImageUrl }
        show(opened(FeedEntry.FromPush(mineTodayId)).state.value)

        tag("feed.photo").assertIsDisplayed()
        tag("feed.title").assertIsDisplayed()
        tag("feed.like-button").assertIsDisplayed()
        // The slot draws nothing for a failed url; the tag travels with the modifier handed to the slot.
        count("feed.signature-image").assertCountEquals(0)
        assertTrue(images.drewUrl(detail.signatureOriginalImageUrl))
        count("feed.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-FEED-016 내 게시물이고 주제가 오늘이면 수정 버튼이 있고 수정 요청은 보내지 않는다`() {
        serve(mineToday, mineTodayId)
        show(opened(FeedEntry.FromPush(mineTodayId)).state.value)
        tag("feed.edit-title-button").assertIsDisplayed().assertIsEnabled()
        assertTrue(h.repo.updates.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-016 지난 주제의 내 게시물에는 수정 버튼이 없다`() {
        serve("feed/posts-detail__mine-past.json", POST_MINE_PAST)
        show(opened(FeedEntry.FromPush(POST_MINE_PAST)).state.value)
        count("feed.edit-title-button").assertCountEquals(0)
        tag("feed.delete-button").assertIsDisplayed()
        assertTrue(h.repo.updates.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-016 남의 게시물에는 수정 버튼이 없다`() {
        serve("feed/posts-detail__other.json", POST_OTHER)
        show(opened(FeedEntry.FromPush(POST_OTHER)).state.value)
        tag("feed.title").assertIsDisplayed()
        count("feed.edit-title-button").assertCountEquals(0)
        assertTrue(h.repo.updates.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-034 삭제 버튼은 내 게시물에만 있고 남의 게시물에서는 삭제 요청을 보내지 않는다`() {
        serve(mineToday, mineTodayId)
        show(opened(FeedEntry.FromPush(mineTodayId)).state.value)
        tag("feed.delete-button").assertIsDisplayed().assertIsEnabled()
        assertTrue(h.repo.deletes.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-034 남의 게시물에는 삭제 버튼이 없다`() {
        serve("feed/posts-detail__other.json", POST_OTHER)
        show(opened(FeedEntry.FromPush(POST_OTHER)).state.value)
        tag("feed.like-button").assertIsDisplayed()
        count("feed.delete-button").assertCountEquals(0)
        count("feed.delete-dialog").assertCountEquals(0)
        assertTrue(h.repo.deletes.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-053 짧은 제목과 열 글자 제목은 한 줄로 보이고 빈 제목은 무제다`() {
        serve(mineToday, mineTodayId)
        val holder = opened(FeedEntry.FromPush(mineTodayId))
        var state by mutableStateOf(holder.state.value)
        rule.setContent { TestApp(copy) { FeedScreen(state, FeedCallbacks(), images.slot) } }

        fun titleHeight(): Float {
            rule.waitForIdle()
            return tag("feed.title").getBoundsInRoot().height.value
        }
        fun retitle(title: String?) {
            h.changes.titleChanged(mineTodayId, title)
            state = holder.state.value
        }

        retitle("가")
        tag("feed.title").assertTextEquals("가")
        val oneLine = titleHeight()
        val ten = "가나다라마바사아자차"
        retitle(ten)
        tag("feed.title").assertTextEquals(ten)
        assertEquals(oneLine, titleHeight(), 1f, "a ten character title must not wrap")
        retitle(null)
        tag("feed.title").assertTextEquals(copy["feed.title-none"])
        assertEquals(oneLine, titleHeight(), 1f)
    }

    @Test
    fun `TC-FEED-058 상세 화면의 testID가 모두 존재한다`() {
        serve(mineToday, mineTodayId)
        show(opened(FeedEntry.FromPush(mineTodayId)).state.value)
        listOf(
            "feed.root", "feed.back-button", "feed.photo", "feed.signature-image", "feed.date-label", "feed.title",
            "feed.like-button", "feed.like-count", "feed.edit-title-button", "feed.delete-button",
        ).forEach { tag(it).assertIsDisplayed() }
        listOf(
            "feed.loading", "feed.error-state", "feed.retry-button", "feed.not-found-state", "feed.title-dialog",
            "feed.delete-dialog", "feed.title-saving", "feed.deleting", "toast.container",
        ).forEach { count(it).assertCountEquals(0) }
    }

    @Test
    fun `TC-LIKE-034 상세 좋아요 버튼은 selected와 개수를 노출하고 개수는 별도 요소다`() {
        serve("feed/posts-detail__other.json", POST_OTHER)
        val detail = PostFixtures.detail("feed/posts-detail__other.json")
        show(opened(FeedEntry.FromPush(POST_OTHER)).state.value)

        tag("feed.like-button").assertIsNotSelected().assertIsEnabled().assert(describesCount(detail.likeCount))
        tag("feed.like-count").assertTextEquals(detail.likeCount.toString())
    }

    @Test
    fun `TC-LIKE-034 좋아요한 게시물의 상세 하트는 selected다`() {
        val liked = PostFixtures.detail("feed/posts-detail__other.json").copy(isLiked = true, likeCount = 39)
        h.repo.details.always(POST_OTHER, kr.chalkak.core.network.ApiResult.Success(liked))
        show(opened(FeedEntry.FromPush(POST_OTHER)).state.value)
        tag("feed.like-button").assertIsSelected().assert(describesCount(39))
        tag("feed.like-count").assertTextEquals("39")
    }

    private fun describesCount(n: Int) = SemanticsMatcher("content description names the like count $n") { node ->
        node.config.getOrNull(SemanticsProperties.ContentDescription)?.any { it.contains(n.toString()) } == true
    }
}
