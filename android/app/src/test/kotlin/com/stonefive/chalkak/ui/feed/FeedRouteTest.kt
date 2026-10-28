package com.stonefive.chalkak.ui.feed

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.PostHarness
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.display.FeedStateHolder
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `FeedRoute` over a real `FeedStateHolder`: dialogs, title input, save and delete flows. */
@RunWith(RobolectricTestRunner::class)
class FeedRouteTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val h = PostHarness()
    private val images = ImageProbe()
    private val mineToday = "feed/posts-detail__mine-today.json"
    private val myDetail = PostFixtures.detail(mineToday)
    private val backs = mutableListOf<Unit>()
    private val deleted = mutableListOf<Pair<String, String>>()
    private val closed = mutableListOf<String>()

    @After
    fun tearDown() = h.close()

    private fun showMine(): FeedStateHolder {
        h.repo.details.always(POST_MINE, PostFixtures.detailResult(mineToday))
        val holder = h.feed(FeedEntry.FromPush(POST_MINE))
        showRoute(holder)
        return holder
    }

    private fun showRoute(holder: FeedStateHolder) {
        rule.setContent {
            TestApp(copy) {
                FeedRoute(
                    holder = holder,
                    remoteImage = images.slot,
                    onBack = { backs += Unit },
                    onDeleted = { id, key -> deleted += id to key },
                    onClosed = { closed += it },
                    onLoginRequired = {},
                )
            }
        }
        rule.waitForIdle()
        tag("feed.root").assertIsDisplayed()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    private fun openEditor() {
        tag("feed.edit-title-button").performClick()
        rule.waitForIdle()
    }

    private fun type(text: String) {
        tag("feed.title-input").performTextClearance()
        tag("feed.title-input").performTextInput(text)
        rule.waitForIdle()
    }

    @Test
    fun `TC-FEED-001 상세 응답이 오면 시드가 확정 내용으로 바뀌고 좋아요가 활성이 된다`() {
        val seed = PostFixtures.summary("202")
        val gate = gated(PostFixtures.detailResult("feed/posts-detail__other.json"))
        h.repo.details.enqueue(seed.id, gate)
        showRoute(h.feed(FeedEntry.FromDisplay(seed)))

        tag("feed.like-button").assertIsNotEnabled()
        gate.release()
        rule.waitForIdle()
        tag("feed.like-button").assertIsEnabled()
        tag("feed.date-label").assertIsDisplayed()
    }

    @Test
    fun `TC-FEED-008 다시 시도를 누르면 같은 게시물을 다시 요청하고 내용을 보인다`() {
        h.repo.details.enqueue(POST_MINE, PostFixtures.failure("feed/posts-detail__500-server-error.json"))
        h.repo.details.always(POST_MINE, PostFixtures.detailResult(mineToday))
        showRoute(h.feed(FeedEntry.FromPush(POST_MINE)))
        tag("feed.error-state").assertShowsAll(copy["feed.error.load"])

        tag("feed.retry-button").performClick()
        rule.waitForIdle()

        assertEquals(listOf(POST_MINE, POST_MINE), h.repo.details.calls.toList())
        count("feed.error-state").assertCountEquals(0)
        tag("feed.photo").assertIsDisplayed()
    }

    @Test
    fun `TC-FEED-018 수정 다이얼로그는 현재 제목을 채우고 취소 저장 버튼이 있으며 취소는 요청이 없다`() {
        showMine()
        count("feed.title-dialog").assertCountEquals(0)
        openEditor()

        tag("feed.title-dialog").assertIsDisplayed().assertShowsAll(copy["feed.edit.title"])
        tag("feed.title-input").assertIsDisplayed().assertTextEquals(requireNotNull(myDetail.title))
        tag("feed.title-save-button").assertIsEnabled().assertTextEquals(copy["feed.edit.save"])
        tag("feed.title-cancel-button").assertIsEnabled().assertTextEquals(copy["feed.edit.cancel"])

        tag("feed.title-cancel-button").performClick()
        rule.waitForIdle()
        count("feed.title-dialog").assertCountEquals(0)
        assertTrue(h.repo.updates.calls.isEmpty())
        assertTrue(h.repo.sentTitles.isEmpty())
    }

    @Test
    fun `TC-FEED-018 비워 둔 입력에는 제목을 입력해 주세요 플레이스홀더가 보인다`() {
        showMine()
        openEditor()
        tag("feed.title-input").performTextClearance()
        rule.waitForIdle()
        tag("feed.title-dialog").assertShowsAll(copy["feed.edit.placeholder"])
    }

    @Test
    fun `TC-FEED-019 이모지 10개는 입력되고 11번째는 입력되지 않는다`() {
        showMine()
        openEditor()
        val emoji = "😀"
        tag("feed.title-input").performTextClearance()
        repeat(10) { tag("feed.title-input").performTextInput(emoji) }
        rule.waitForIdle()
        tag("feed.title-input").assertTextEquals(emoji.repeat(10))

        tag("feed.title-input").performTextInput(emoji)
        rule.waitForIdle()
        tag("feed.title-input").assertTextEquals(emoji.repeat(10))
    }

    @Test
    fun `TC-FEED-020 결합 이모지 2개 뒤 한 글자는 막히고 열한 글자 붙여넣기는 열 code point까지만 들어간다`() {
        showMine()
        openEditor()
        // 👨‍👩‍👧 = 5 code points (3 people + 2 joiners): two of them already fill the 10 code points.
        val family = "👨‍👩‍👧"
        tag("feed.title-input").performTextClearance()
        tag("feed.title-input").performTextInput(family)
        tag("feed.title-input").performTextInput(family)
        rule.waitForIdle()
        tag("feed.title-input").assertTextEquals(family + family)
        tag("feed.title-input").performTextInput(copy["feed.edit.save"].take(1))
        rule.waitForIdle()
        tag("feed.title-input").assertTextEquals(family + family)

        val eleven = "가나다라마바사아자차카"
        type(eleven)
        tag("feed.title-input").assertTextEquals(eleven.take(10))
    }

    @Test
    fun `TC-FEED-024 저장에 성공하면 토스트가 한 번 뜨고 다이얼로그가 닫히며 새 제목이 보인다`() {
        h.repo.updates.always(POST_MINE, PostFixtures.titleResult("feed/posts-title-update__200.json"))
        val newTitle = requireNotNull(PostFixtures.title("feed/posts-title-update__200.json").title)
        showMine()
        openEditor()
        type(newTitle)

        tag("feed.title-save-button").performClick()
        rule.waitForIdle()

        assertEquals(listOf(POST_MINE to newTitle), h.repo.sentTitles.toList())
        count("feed.title-dialog").assertCountEquals(0)
        count("toast.message").assertCountEquals(1)
        tag("toast.message").assertTextEquals(copy["feed.edit.success"])
        tag("feed.title").assertTextEquals(newTitle)
    }

    @Test
    fun `TC-FEED-025 저장 중에는 저장 중 문구로 비활성이고 연타해도 요청은 한 번이다`() {
        val gate = gated(PostFixtures.titleResult("feed/posts-title-update__200.json"))
        h.repo.updates.enqueue(POST_MINE, gate)
        showMine()
        openEditor()
        count("feed.title-saving").assertCountEquals(0)

        repeat(3) { tag("feed.title-save-button").performClick() }
        rule.waitForIdle()

        tag("feed.title-save-button").assertIsNotEnabled().assertTextEquals(copy["feed.edit.saving"])
        tag("feed.title-saving").assertIsDisplayed()
        assertEquals(1, h.repo.updates.calls.size)

        gate.release()
        rule.waitForIdle()
        count("feed.title-dialog").assertCountEquals(0)
        count("feed.title-saving").assertCountEquals(0)
        assertEquals(1, h.repo.updates.calls.size)
    }

    @Test
    fun `TC-FEED-035 삭제 버튼을 누르면 확인창이 뜨고 취소하면 요청이 없다`() {
        showMine()
        count("feed.delete-dialog").assertCountEquals(0)
        tag("feed.delete-button").performClick()
        rule.waitForIdle()

        tag("feed.delete-dialog").assertIsDisplayed()
        tag("feed.delete-title").assertTextEquals(copy["feed.delete.title"])
        tag("feed.delete-body").assertTextEquals(copy["feed.delete.body"])
        tag("feed.delete-confirm-button").assertIsEnabled().assertTextEquals(copy["feed.delete.confirm"])
        tag("feed.delete-cancel-button").assertIsEnabled().assertTextEquals(copy["feed.delete.cancel"])

        tag("feed.delete-cancel-button").performClick()
        rule.waitForIdle()
        count("feed.delete-dialog").assertCountEquals(0)
        assertTrue(h.repo.deletes.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-035 삭제를 확인하면 진행 표시와 함께 요청이 한 번 나가고 성공하면 삭제 결과를 알린다`() {
        val gate = gated(ApiResult.Success(Unit))
        h.repo.deletes.enqueue(POST_MINE, gate)
        val holder = showMine()
        tag("feed.delete-button").performClick()
        rule.waitForIdle()

        // The dialog closes with the first tap, so a second tap on the button is impossible; a second confirmation
        // (a double event before the UI caught up) must still not send another request.
        tag("feed.delete-confirm-button").performClick()
        holder.onDeleteConfirmed()
        rule.waitForIdle()

        count("feed.delete-dialog").assertCountEquals(0)
        tag("feed.deleting").assertIsDisplayed()
        assertEquals(1, h.repo.deletes.calls.size)

        gate.release()
        rule.waitForIdle()
        assertEquals(listOf(POST_MINE to "feed.delete.success"), deleted.toList())
        count("feed.deleting").assertCountEquals(0)
    }

    @Test
    fun `TC-FEED-058 뒤로 버튼은 뒤로 가기를 알린다`() {
        showMine()
        tag("feed.back-button").performClick()
        rule.waitForIdle()
        assertEquals(1, backs.size)
    }
}
