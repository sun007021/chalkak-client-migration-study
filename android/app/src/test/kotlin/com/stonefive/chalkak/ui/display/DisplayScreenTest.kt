package com.stonefive.chalkak.ui.display

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.height
import com.stonefive.chalkak.testing.FIRST_DATE
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.PostHarness
import com.stonefive.chalkak.testing.TODAY
import com.stonefive.chalkak.testing.YESTERDAY
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.popularQuery
import com.stonefive.chalkak.testing.recentQuery
import java.time.LocalDate
import kotlin.math.abs
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.feature.display.DisplayStatus
import kr.chalkak.feature.display.DisplayUiState
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Stateless `DisplayScreen`: states are real `DisplayUiState`s produced by `DisplayStateHolder` over `shared/fixtures/display`,
 * rendered without a Route (interaction through the holder is in `DisplayRouteTest`).
 */
@RunWith(RobolectricTestRunner::class)
class DisplayScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val h = PostHarness()
    private val images = ImageProbe()

    @After
    fun tearDown() = h.close()

    private fun show(state: DisplayUiState, callbacks: DisplayCallbacks = DisplayCallbacks()) {
        rule.setContent { TestApp(copy) { DisplayScreen(state, callbacks, images.slot) } }
    }

    /** First screen of [date] (null = today), fully loaded. */
    private fun loaded(date: LocalDate? = null): DisplayUiState {
        val holder = h.display(initialDate = date)
        holder.onScreenShown()
        return holder.state.value
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    @Test
    fun `TC-DISP-001 첫 로딩 중에는 진행 표시만 있고 날짜 이동 버튼은 비활성이다`() {
        val gate = gated(PostFixtures.topicResult("display/topics__open-2026-10-27.json"))
        h.repo.topics.enqueue(TODAY, gate)
        val holder = h.display()
        holder.onScreenShown()
        var state by mutableStateOf(holder.state.value)
        assertEquals(DisplayStatus.Loading, state.status)
        rule.setContent { TestApp(copy) { DisplayScreen(state, DisplayCallbacks(), images.slot) } }

        tag("display.root").assertIsDisplayed()
        tag("display.loading").assertIsDisplayed()
        tag("display.prev-date-button").assertIsNotEnabled()
        tag("display.next-date-button").assertIsNotEnabled()
        count("display.grid").assertCountEquals(0)
        count("display.empty-state").assertCountEquals(0)
        count("display.error-state").assertCountEquals(0)

        gate.release()
        state = holder.state.value
        rule.waitForIdle()
        count("display.loading").assertCountEquals(0)
        tag("display.grid").assertIsDisplayed()
        tag("display.prev-date-button").assertIsEnabled()
    }

    @Test
    fun `TC-DISP-005 posts 500이면 요청한 날짜를 유지한 오류 상태와 다시 시도 버튼을 보인다`() {
        h.repo.posts.enqueue(popularQuery(YESTERDAY), PostFixtures.failure("display/posts-list__500-server-error.json"))
        val state = loaded(YESTERDAY)
        assertEquals(DisplayStatus.Error, state.status)
        show(state)

        tag("display.error-state").assertIsDisplayed().assertShowsAll(copy["display.error"])
        tag("display.retry-button").assertIsDisplayed().assertIsEnabled().assertTextEquals(copy["display.retry"])
        tag("display.date-label").assertTextEquals(DateFormats.monthDay(YESTERDAY))
        count("display.loading").assertCountEquals(0)
        count("display.empty-state").assertCountEquals(0)
        count("display.grid").assertCountEquals(0)
    }

    @Test
    fun `TC-DISP-005 topics 500도 같은 오류 상태다`() {
        h.repo.topics.enqueue(TODAY, PostFixtures.failure("display/topics__500-server-error.json"))
        show(loaded())
        tag("display.error-state").assertShowsAll(copy["display.error"])
        tag("display.retry-button").assertIsDisplayed()
    }

    @Test
    fun `TC-DISP-005 연결 실패면 네트워크 연결 확인 문구와 다시 시도를 보인다`() {
        h.repo.topics.enqueue(TODAY, PostFixtures.network())
        show(loaded())
        tag("display.error-state").assertShowsAll(copy["common.error.network"])
        tag("display.retry-button").assertIsDisplayed()
    }

    @Test
    fun `TC-DISP-006 오늘 주제가 404이면 오류가 아니라 빈 상태이고 다시 시도는 없다`() {
        h.repo.topics.always(TODAY, PostFixtures.failure("display/topics__404-not-found.json"))
        val state = loaded()
        assertEquals(DisplayStatus.Empty, state.status)
        show(state)

        tag("display.empty-state").assertIsDisplayed().assertShowsAll(copy["display.empty"])
        count("display.error-state").assertCountEquals(0)
        count("display.retry-button").assertCountEquals(0)
        count("display.loading").assertCountEquals(0)
        // Empty is not Loading: the dates can still be changed.
        tag("display.prev-date-button").assertIsEnabled()
    }

    @Test
    fun `TC-DISP-011 오늘 전시는 정렬 탭 3개를 보이고 기본은 최신순 선택이다`() {
        show(loaded())

        tag("display.sort-recent-tab").assertIsDisplayed().assertTextEquals(copy["display.sort.recent"]).assertIsSelected()
        tag("display.sort-popular-tab").assertIsDisplayed().assertTextEquals(copy["display.sort.popular"]).assertIsNotSelected()
        tag("display.sort-random-tab").assertIsDisplayed().assertTextEquals(copy["display.sort.random"]).assertIsNotSelected()
        tag("display.description").assertTextEquals(copy["display.header.desc-latest"])
        count("display.featured-pager").assertCountEquals(0)
    }

    @Test
    fun `TC-DISP-011 선택된 정렬이 바뀌면 selected 표시가 따라간다`() {
        val holder = h.display(initialSort = PostSort.POPULAR)
        holder.onScreenShown()
        show(holder.state.value)
        tag("display.sort-popular-tab").assertIsSelected()
        tag("display.sort-recent-tab").assertIsNotSelected()
        tag("display.sort-random-tab").assertIsNotSelected()
    }

    @Test
    fun `TC-DISP-013 과거 날짜는 정렬 탭을 숨기고 상위 5개 추천 페이저와 안내 문구를 보인다`() {
        val state = loaded(YESTERDAY)
        assertTrue(state.isArchive)
        assertEquals(5, state.featured.size)
        show(state)

        tag("display.featured-pager").assertIsDisplayed()
        tag("display.featured-item-${state.featured.first().id}").assertIsDisplayed()
        tag("display.featured-like-button-${state.featured.first().id}").assertIsDisplayed()
        tag("display.featured-like-count-${state.featured.first().id}").assertIsDisplayed()
        tag("display.grid").assertIsDisplayed()
        count("display.sort-recent-tab").assertCountEquals(0)
        count("display.sort-popular-tab").assertCountEquals(0)
        count("display.sort-random-tab").assertCountEquals(0)
        tag("display.description").assertTextEquals(copy["display.header.desc-archive"])
        // The second header line ("display.grid.title") has no testID: it is checked as text inside the screen root.
        tag("display.root").assertShowsAll(copy["display.grid.title"])
    }

    @Test
    fun `TC-DISP-028 최초 전시일에서는 이전 버튼이 비활성이고 다음은 활성이다`() {
        val state = loaded(FIRST_DATE)
        show(state)
        tag("display.date-label").assertTextEquals(DateFormats.monthDay(FIRST_DATE))
        tag("display.prev-date-button").assertIsNotEnabled()
        tag("display.next-date-button").assertIsEnabled()
    }

    @Test
    fun `TC-DISP-028 최초 전시일 다음 날에는 이전 버튼이 활성이다`() {
        show(loaded(FIRST_DATE.plusDays(1)))
        tag("display.prev-date-button").assertIsEnabled()
        tag("display.next-date-button").assertIsEnabled()
    }

    @Test
    fun `TC-DISP-029 오늘에서는 다음 버튼이 비활성이고 어제에서는 활성이다`() {
        show(loaded())
        tag("display.next-date-button").assertIsNotEnabled()
        tag("display.prev-date-button").assertIsEnabled()
    }

    @Test
    fun `TC-DISP-029 어제에서는 다음 버튼이 활성이다`() {
        show(loaded(YESTERDAY))
        tag("display.next-date-button").assertIsEnabled()
        tag("display.prev-date-button").assertIsEnabled()
    }

    @Test
    fun `TC-DISP-036 날짜 선택 시트는 최초 전시일과 오늘 사이의 연 월 일만 보인다`() {
        show(loaded())
        count("display.date-picker-sheet").assertCountEquals(0)
        tag("display.date-picker-button").performClick()

        tag("display.date-picker-sheet").assertIsDisplayed().assertShowsAll(copy["display.picker.title"])
        fun inWheel(wheel: String, text: String) = hasText(text) and hasAnyAncestor(hasTestTag(wheel))
        fun year(n: Int) = copy.format("display.picker.year", "n" to n)
        fun month(n: Int) = copy.format("display.picker.month", "n" to n)
        fun day(n: Int) = copy.format("display.picker.day", "n" to n)

        // The range 2026-09-17 .. 2026-10-27 has a single year; the shown date (10-27) is selected.
        rule.onNode(inWheel("display.date-picker-year", year(2026))).assertIsDisplayed()
        rule.onNode(inWheel("display.date-picker-year", year(2025))).assertDoesNotExist()
        rule.onNode(inWheel("display.date-picker-year", year(2027))).assertDoesNotExist()
        // First year starts in September, the last year ends in October.
        rule.onNode(inWheel("display.date-picker-month", month(10))).assertIsDisplayed()
        rule.onNode(inWheel("display.date-picker-month", month(9))).assertIsDisplayed()
        rule.onNode(inWheel("display.date-picker-month", month(8))).assertDoesNotExist()
        rule.onNode(inWheel("display.date-picker-month", month(11))).assertDoesNotExist()
        // Last month ends today (27), so the day after today is not offered.
        rule.onNode(inWheel("display.date-picker-day", day(27))).assertIsDisplayed()
        rule.onNode(inWheel("display.date-picker-day", day(26))).assertIsDisplayed()
        rule.onNode(inWheel("display.date-picker-day", day(28))).assertDoesNotExist()
    }

    @Test
    fun `TC-DISP-036 시트에서 월을 고르고 확인하면 고른 날짜가 한 번 전달되고 시트가 닫힌다`() {
        val picked = mutableListOf<LocalDate>()
        show(loaded(), DisplayCallbacks(onDateSelected = { picked += it }))
        tag("display.date-picker-button").performClick()

        rule.onNode(hasText(copy.format("display.picker.month", "n" to 9)) and hasAnyAncestor(hasTestTag("display.date-picker-month")))
            .performClick()
        tag("display.date-picker-confirm-button").performClick()
        rule.waitForIdle()

        // 10-27 moved to September keeps day 27 (September has 17..30 selectable).
        assertEquals(listOf(LocalDate.of(2026, 9, 27)), picked)
        count("display.date-picker-sheet").assertCountEquals(0)
    }

    @Test
    fun `TC-DISP-041 날짜 라벨은 응답 topicDate의 M월 d일이고 기기 시간대와 무관하다`() {
        // A device far ahead of KST must not move the label to the next day.
        withDevice(zoneId = "Pacific/Kiritimati") {
            val state = loaded()
            assertEquals(PostFixtures.topic("display/topics__open-2026-10-27.json").date, state.topic?.date)
            show(state)
            tag("display.date-label").assertTextEquals(DateFormats.monthDay(LocalDate.of(2026, 10, 27)))
            tag("display.topic-title").assertTextEquals(requireNotNull(state.topic).title)
        }
    }

    @Test
    fun `TC-DISP-041 최초 전시일의 라벨도 응답 날짜 그대로다`() {
        h.repo.topics.always(FIRST_DATE, PostFixtures.topicResult("display/topics__first-date-2026-09-17.json"))
        show(loaded(FIRST_DATE))
        tag("display.date-label").assertTextEquals(DateFormats.monthDay(FIRST_DATE))
    }

    @Test
    fun `TC-DISP-043 아카이브 사진이 5개 미만이면 있는 만큼만 추천에 쓰고 깨지지 않는다`() {
        h.repo.posts.always(popularQuery(YESTERDAY), PostFixtures.pageResult("display/posts-list__popular-3.json"))
        val state = loaded(YESTERDAY)
        assertEquals(3, state.featured.size)
        show(state)

        tag("display.featured-pager").assertIsDisplayed()
        tag("display.featured-item-${state.featured.first().id}").assertIsDisplayed()
        // The pager has no 4th page: nothing beyond the three posts is tagged as featured.
        val extra = PostFixtures.page("display/posts-list__popular-page1.json").posts.map { it.id } - state.featured.map { it.id }.toSet()
        extra.forEach { count("display.featured-item-$it").assertCountEquals(0) }
        count("display.error-state").assertCountEquals(0)
        count("display.empty-state").assertCountEquals(0)
    }

    @Test
    fun `TC-DISP-057 서로 다른 비율의 사진을 2열로 놓고 사진 비율을 유지하며 열 높이가 균형을 이룬다`() {
        h.repo.posts.always(recentQuery(), PostFixtures.pageResult("display/posts-list__mixed-ratio.json"))
        val state = loaded()
        images.ratiosOf(state.photos)
        show(state)
        rule.waitForIdle()

        val items = state.photos.mapNotNull { post ->
            rule.onAllNodesWithTag("display.item-${post.id}").fetchSemanticsNodes().firstOrNull()?.let {
                post to rule.onNodeWithTag("display.item-${post.id}").getBoundsInRoot()
            }
        }
        assertTrue(items.size >= 4, "several cards must be laid out, got ${items.size}")
        val lefts = items.map { it.second.left }.distinctBy { (it.value * 2).toInt() }
        assertEquals(2, lefts.size, "two columns expected, got lefts=$lefts")

        val heights = items.groupBy { (it.second.left.value * 2).toInt() }.mapValues { (_, cards) -> cards.sumOf { it.second.height.value.toDouble() } }
        val tallest = items.maxOf { it.second.height.value }
        assertTrue(abs(heights.values.max() - heights.values.min()) <= tallest + 1f, "unbalanced columns: $heights")

        // The image keeps its own ratio (the slot sizes itself by ratio; the card must not squeeze or stretch it).
        state.photos.forEach { post ->
            val ratio = Regex("original-(\\d+)x(\\d+)").find(post.originalImageUrl)?.let { it.groupValues[1].toFloat() / it.groupValues[2].toFloat() }
                ?: return@forEach
            val size = images.sizes[post.thumbnailImageUrl] ?: images.sizes[post.originalImageUrl] ?: return@forEach
            assertEquals(ratio, size.width.toFloat() / size.height, 0.03f, "ratio of ${post.id}")
        }
    }

    @Test
    fun `TC-DISP-060 전시 화면의 testID가 모두 존재한다`() {
        val state = loaded()
        val post = state.photos.first()
        show(state)

        listOf(
            "display.root", "display.date-label", "display.prev-date-button", "display.next-date-button", "display.date-picker-button",
            "display.topic-title", "display.description", "display.sort-recent-tab", "display.sort-popular-tab", "display.sort-random-tab",
            "display.grid", "display.item-${post.id}", "display.like-button-${post.id}", "display.like-count-${post.id}",
        ).forEach { id -> tag(id).assertIsDisplayed() }
        listOf("display.loading", "display.empty-state", "display.error-state", "display.retry-button", "display.featured-pager").forEach {
            count(it).assertCountEquals(0)
        }
    }

    @Test
    fun `TC-DISP-060 새로고침과 다음 페이지 진행 표시는 해당 상태에서만 있고 사진은 유지된다`() {
        val holder = h.display()
        holder.onScreenShown()
        val first = holder.state.value.photos.map { it.id }
        assertTrue(first.isNotEmpty())
        val refresh = gated(PostFixtures.pageResult("display/posts-list__recent-page1.json"))
        h.repo.posts.enqueue(recentQuery(), refresh)
        holder.onTabReselected()
        var state by mutableStateOf(holder.state.value)
        assertTrue(state.isRefreshing)
        rule.setContent { TestApp(copy) { DisplayScreen(state, DisplayCallbacks(), images.slot) } }

        tag("display.refresh-indicator").assertIsDisplayed()
        tag("display.item-${first.first()}").assertIsDisplayed()
        count("display.loading").assertCountEquals(0)
        count("display.load-more-indicator").assertCountEquals(0)

        refresh.release()
        val page2 = gated(PostFixtures.pageResult("display/posts-list__recent-page2.json"))
        h.repo.posts.enqueue(recentQuery(page = 2), page2)
        holder.onReachedEnd()
        state = holder.state.value
        rule.waitForIdle()
        assertTrue(state.isPaging)
        count("display.refresh-indicator").assertCountEquals(0)
        tag("display.load-more-indicator").assertExists()

        page2.release()
        state = holder.state.value
        rule.waitForIdle()
        count("display.load-more-indicator").assertCountEquals(0)
    }

}
