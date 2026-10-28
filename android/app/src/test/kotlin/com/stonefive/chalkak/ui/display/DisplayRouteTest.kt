package com.stonefive.chalkak.ui.display

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.FIRST_DATE
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.PostHarness
import com.stonefive.chalkak.testing.TODAY
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.YESTERDAY
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.popularQuery
import com.stonefive.chalkak.testing.recentQuery
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.feature.display.DisplayStateHolder
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** `DisplayRoute` over a real `DisplayStateHolder`: taps go through the holder and the screen shows what the holder publishes. */
@RunWith(RobolectricTestRunner::class)
class DisplayRouteTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val h = PostHarness()
    private val images = ImageProbe()
    private val opened = mutableListOf<PostSummary>()

    @After
    fun tearDown() = h.close()

    private fun showRoute(holder: DisplayStateHolder, requestedDate: LocalDate? = null) {
        rule.setContent {
            TestApp(copy) { DisplayRoute(holder, images.slot, onOpenFeed = { opened += it }, requestedDate = requestedDate) }
        }
        rule.waitForIdle()
        tag("display.root").assertIsDisplayed()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    @Test
    fun `TC-DISP-005 다시 시도를 누르면 같은 날짜로 다시 요청하고 내용을 보인다`() {
        h.repo.topics.enqueue(YESTERDAY, PostFixtures.failure("display/topics__500-server-error.json"))
        val holder = h.display(initialDate = YESTERDAY)
        showRoute(holder)
        tag("display.error-state").assertShowsAll(copy["display.error"])
        tag("display.date-label").assertTextEquals(DateFormats.monthDay(YESTERDAY))

        tag("display.retry-button").performClick()
        rule.waitForIdle()

        assertEquals(listOf(YESTERDAY, YESTERDAY), h.repo.topics.calls.toList(), "retry must ask for the same date")
        count("display.error-state").assertCountEquals(0)
        count("display.retry-button").assertCountEquals(0)
        tag("display.featured-pager").assertIsDisplayed()
        tag("display.date-label").assertTextEquals(DateFormats.monthDay(YESTERDAY))
    }

    @Test
    fun `TC-DISP-010 새로고침이 실패해도 사진은 유지하고 토스트만 띄운다`() {
        val holder = h.display()
        showRoute(holder)
        val first = holder.state.value.photos.first().id
        tag("display.item-$first").assertIsDisplayed()

        h.repo.posts.enqueue(recentQuery(), PostFixtures.failure("display/posts-list__500-server-error.json"))
        holder.onTabReselected()
        rule.waitForIdle()

        tag("toast.message").assertIsDisplayed().assertTextEquals(copy["display.error"])
        tag("display.item-$first").assertIsDisplayed()
        tag("display.grid").assertIsDisplayed()
        count("display.error-state").assertCountEquals(0)
        count("display.retry-button").assertCountEquals(0)
        count("display.empty-state").assertCountEquals(0)
    }

    @Test
    fun `TC-DISP-010 다음 페이지가 실패해도 사진은 유지하고 토스트만 띄운다`() {
        val holder = h.display()
        showRoute(holder)
        val first = holder.state.value.photos.first().id

        h.repo.posts.enqueue(recentQuery(page = 2), PostFixtures.failure("display/posts-list__500-server-error.json"))
        holder.onReachedEnd()
        rule.waitForIdle()

        tag("toast.message").assertTextEquals(copy["display.error"])
        tag("display.item-$first").assertIsDisplayed()
        count("display.error-state").assertCountEquals(0)
        count("display.load-more-indicator").assertCountEquals(0)
    }

    @Test
    fun `TC-DISP-011 인기순 탭을 누르면 선택이 옮겨 가고 sort=popular로 요청한다`() {
        val holder = h.display()
        showRoute(holder)
        tag("display.sort-recent-tab").assertIsSelected()

        tag("display.sort-popular-tab").performClick()
        rule.waitForIdle()

        tag("display.sort-popular-tab").assertIsSelected()
        tag("display.sort-recent-tab").assertIsNotSelected()
        tag("display.sort-random-tab").assertIsNotSelected()
        assertTrue(h.repo.posts.calls.any { it.sort == PostSort.POPULAR && it.topicDate == TODAY && it.page == 1 })
    }

    @Test
    fun `TC-DISP-011 랜덤순 탭을 누르면 sort=random으로 요청하고 최신순 탭으로 돌아올 수 있다`() {
        val holder = h.display()
        showRoute(holder)

        tag("display.sort-random-tab").performClick()
        rule.waitForIdle()
        tag("display.sort-random-tab").assertIsSelected()
        assertTrue(h.repo.posts.calls.any { it.sort == PostSort.RANDOM })

        tag("display.sort-recent-tab").performClick()
        rule.waitForIdle()
        tag("display.sort-recent-tab").assertIsSelected()
        tag("display.sort-random-tab").assertIsNotSelected()
    }

    @Test
    fun `TC-DISP-028 이전 버튼으로 최초 전시일까지 가면 이전 버튼이 비활성이 되고 더는 요청하지 않는다`() {
        val holder = h.display(initialDate = FIRST_DATE.plusDays(1))
        showRoute(holder)
        tag("display.prev-date-button").assertIsEnabled()

        tag("display.prev-date-button").performClick()
        rule.waitForIdle()

        tag("display.date-label").assertTextEquals(DateFormats.monthDay(FIRST_DATE))
        tag("display.prev-date-button").assertIsNotEnabled()
        val requests = h.repo.topics.calls.size
        tag("display.prev-date-button").performClick()
        rule.waitForIdle()
        assertEquals(requests, h.repo.topics.calls.size, "no request when the button is disabled")
        tag("display.date-label").assertTextEquals(DateFormats.monthDay(FIRST_DATE))
    }

    @Test
    fun `TC-DISP-029 어제에서 다음 버튼은 오늘로 이동하고 오늘에서는 비활성이다`() {
        val holder = h.display(initialDate = YESTERDAY)
        showRoute(holder)
        tag("display.next-date-button").assertIsEnabled()

        tag("display.next-date-button").performClick()
        rule.waitForIdle()

        tag("display.date-label").assertTextEquals(DateFormats.monthDay(TODAY))
        tag("display.next-date-button").assertIsNotEnabled()
        count("display.featured-pager").assertCountEquals(0)
        tag("display.sort-recent-tab").assertIsSelected()
        val requests = h.repo.topics.calls.size
        tag("display.next-date-button").performClick()
        rule.waitForIdle()
        assertEquals(requests, h.repo.topics.calls.size, "no future date is requested")
    }

    @Test
    fun `TC-DISP-029 날짜 선택 시트에서 고른 날짜의 전시를 연다`() {
        val holder = h.display()
        showRoute(holder)
        tag("display.date-picker-button").performClick()
        tag("display.date-picker-day").assertIsDisplayed()
        // The 26th is offered: tapping it and confirming loads the archive of that day.
        rule.onNode(hasText(copy.format("display.picker.day", "n" to 26)) and hasAnyAncestor(hasTestTag("display.date-picker-day")))
            .performClick()
        tag("display.date-picker-confirm-button").performClick()
        rule.waitForIdle()

        tag("display.date-label").assertTextEquals(DateFormats.monthDay(YESTERDAY))
        tag("display.featured-pager").assertIsDisplayed()
        count("display.date-picker-sheet").assertCountEquals(0)
        assertTrue(h.repo.posts.calls.contains(popularQuery(YESTERDAY)))
    }

    @Test
    fun `TC-DISP-029 다른 화면이 요청한 날짜를 받으면 그 날짜의 전시를 연다`() {
        val holder = h.display()
        showRoute(holder, requestedDate = YESTERDAY)

        tag("display.date-label").assertTextEquals(DateFormats.monthDay(YESTERDAY))
        tag("display.featured-pager").assertIsDisplayed()
        count("display.sort-recent-tab").assertCountEquals(0)
        assertTrue(h.repo.posts.calls.contains(popularQuery(YESTERDAY)))
    }

    @Test
    fun `TC-DISP-060 사진 카드를 누르면 그 게시물로 피드를 연다`() {
        val holder = h.display()
        showRoute(holder)
        val post = holder.state.value.photos.first()

        tag("display.item-${post.id}").performClick()
        rule.waitForIdle()

        assertEquals(listOf(post.id), opened.map { it.id })
    }

    @Test
    fun `TC-DISP-060 화면을 보여 줄 때 전시를 불러온다`() {
        val holder = h.display()
        showRoute(holder)
        assertEquals(listOf(TODAY), h.repo.topics.calls.toList())
        assertTrue(h.repo.posts.calls.contains(recentQuery()))
    }
}
