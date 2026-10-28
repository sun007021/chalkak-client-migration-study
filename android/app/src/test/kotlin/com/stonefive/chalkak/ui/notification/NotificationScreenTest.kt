package com.stonefive.chalkak.ui.notification

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import com.stonefive.chalkak.testing.RecordingImage
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.data.notification.NotificationItem
import kr.chalkak.core.data.notification.testing.NotificationFixtureModels
import kr.chalkak.feature.notification.InboxPhase
import kr.chalkak.feature.notification.InboxRow
import kr.chalkak.feature.notification.InboxUiState
import kr.chalkak.feature.notification.NotiCopyKeys
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Stateless `NotificationScreen` over states of `NotificationInboxStateHolder` (testids.md `notifications.*`). */
@RunWith(RobolectricTestRunner::class)
class NotificationScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val images = RecordingImage()

    private val backs = CopyOnWriteArrayList<Unit>()
    private val clicks = CopyOnWriteArrayList<String>()
    private val scrolls = CopyOnWriteArrayList<Int>()
    private val refreshes = CopyOnWriteArrayList<Unit>()
    private val retries = CopyOnWriteArrayList<Unit>()

    private fun rowOf(item: NotificationItem) = InboxRow(
        id = item.id,
        type = item.type,
        title = item.title,
        body = item.body,
        thumbnailImageUrl = item.thumbnailImageUrl,
        timeText = DateFormats.notificationTime(item.createdAt),
        unread = item.readAt == null,
        readAt = item.readAt,
    )

    private fun rows(fixture: String = "notifications__page1") =
        NotificationFixtureModels.page("notification/$fixture.json").items.map(::rowOf)

    private fun show(state: InboxUiState) {
        rule.setContent {
            TestApp(copy) {
                NotificationScreen(
                    state = state,
                    callbacks = NotificationCallbacks(
                        onBack = { backs += Unit },
                        onRowClick = { clicks += it },
                        onScrolledTo = { scrolls += it },
                        onRefresh = { refreshes += Unit },
                        onRetry = { retries += Unit },
                    ),
                    image = images.slot,
                )
            }
        }
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    @Test
    fun `TC-NOTI-004 로딩 중에는 로딩 문구가 보이고 목록 빈 상태 오류는 없다`() {
        show(InboxUiState(phase = InboxPhase.Loading))
        tag("notifications.root").assertIsDisplayed()
        tag("notifications.loading").assertShowsAll(copy[NotiCopyKeys.INBOX_LOADING])
        count("notifications.empty-state").assertCountEquals(0)
        count("notifications.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-005 빈 응답이면 빈 상태 제목과 본문이 보이고 로딩은 없다`() {
        show(InboxUiState(phase = InboxPhase.Empty))
        tag("notifications.empty-state").assertShowsAll(copy[NotiCopyKeys.INBOX_EMPTY_TITLE], copy[NotiCopyKeys.INBOX_EMPTY_BODY])
        count("notifications.loading").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-006 콘텐츠 없는 목록 실패는 오류 화면과 다시 시도를 보이고 다시 시도가 콜백을 부른다`() {
        show(InboxUiState(phase = InboxPhase.Error, errorCopyKey = NotiCopyKeys.INBOX_ERROR))
        tag("notifications.error-state").assertShowsAll(copy[NotiCopyKeys.INBOX_ERROR])
        tag("notifications.retry-button").assertShowsAll(copy[NotiCopyKeys.INBOX_RETRY]).performClick()
        assertEquals(1, retries.size)
    }

    @Test
    fun `TC-NOTI-007 네트워크 오류는 네트워크 확인 문구를 보인다`() {
        show(InboxUiState(phase = InboxPhase.Error, errorCopyKey = NotiCopyKeys.NETWORK))
        tag("notifications.error-state").assertShowsAll(copy[NotiCopyKeys.NETWORK])
    }

    @Test
    fun `TC-NOTI-011 항목은 제목 본문 시각 썸네일을 보이고 미읽음 점은 readAt 이 null 인 항목에만 있다`() {
        val all = rows()
        show(InboxUiState(phase = InboxPhase.Content, rows = all, hasNext = true, currentPage = 1))
        tag("notifications.list").assertIsDisplayed()
        val first = all.first()
        tag("notifications.item-${first.id}").assertIsDisplayed()
        tag("notifications.item-title-${first.id}").assertShowsAll(first.title)
        tag("notifications.item-body-${first.id}").assertShowsAll(first.body)
        tag("notifications.item-time-${first.id}").assertShowsAll("10월 27일 10:30")
        tag("notifications.item-thumbnail-${first.id}").assertIsDisplayed()
        assertTrue(first.thumbnailImageUrl in images.urls, "thumbnail url is handed to the image slot")
        tag("notifications.item-unread-${first.id}").assertIsDisplayed()
        // Row 06 (READ_APPROVED) has readAt: no dot.
        val read = all.first { it.id == "33333333-3333-4333-8333-333333333306" }
        tag("notifications.item-${read.id}").assertIsDisplayed()
        count("notifications.item-unread-${read.id}").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-011 썸네일이 null 인 항목은 대체 이미지를 요청한다`() {
        val notice = rows().first { it.thumbnailImageUrl == null }
        show(InboxUiState(phase = InboxPhase.Content, rows = listOf(notice)))
        tag("notifications.item-thumbnail-${notice.id}").assertIsDisplayed()
        assertTrue(null in images.urls, "null url = the slot draws its fallback")
    }

    @Test
    fun `TC-NOTI-011 항목을 탭하면 그 항목 id 로 콜백이 불린다`() {
        val all = rows()
        show(InboxUiState(phase = InboxPhase.Content, rows = all))
        tag("notifications.item-${all[1].id}").performClick()
        assertEquals(listOf(all[1].id), clicks.toList())
    }

    @Test
    fun `TC-NOTI-011 뒤로 버튼이 콜백을 부른다`() {
        show(InboxUiState(phase = InboxPhase.Empty))
        tag("notifications.back-button").performClick()
        assertEquals(1, backs.size)
    }

    @Test
    fun `TC-NOTI-015 끝에서 네 번째 근처까지 스크롤하면 마지막으로 보인 인덱스를 알린다`() {
        val all = rows() // 20 rows
        show(InboxUiState(phase = InboxPhase.Content, rows = all, hasNext = true, currentPage = 1))
        assertTrue(scrolls.all { it < all.size - 4 }, "nothing near the end is visible at first: $scrolls")
        tag("notifications.list").performScrollToIndex(all.lastIndex)
        rule.waitForIdle()
        assertTrue(scrolls.any { it >= all.size - 4 }, "the last visible index reaches the near-end zone: $scrolls")
    }

    @Test
    fun `TC-NOTI-015 다음 페이지를 불러오는 중이면 하단 로딩 표시가 있고 아니면 없다`() {
        val all = rows()
        show(InboxUiState(phase = InboxPhase.Content, rows = all, hasNext = true, currentPage = 1, loadingMore = true))
        tag("notifications.list").performScrollToIndex(all.lastIndex)
        tag("notifications.load-more-indicator").assertIsDisplayed()
    }

    @Test
    fun `TC-NOTI-019 새로고침 중이면 새로고침 표시가 있고 목록은 그대로다`() {
        val all = rows()
        show(InboxUiState(phase = InboxPhase.Content, rows = all, hasNext = true, currentPage = 1, refreshing = true))
        tag("notifications.refresh-indicator").assertIsDisplayed()
        tag("notifications.item-${all.first().id}").assertIsDisplayed()
    }

    @Test
    fun `TC-NOTI-019 새로고침 중이 아니면 새로고침 표시가 없다`() {
        show(InboxUiState(phase = InboxPhase.Content, rows = rows(), currentPage = 1))
        tag("notifications.list").assertIsDisplayed()
        count("notifications.refresh-indicator").assertCountEquals(0)
        count("notifications.load-more-indicator").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-019 목록을 아래로 당기면 새로고침 콜백이 불린다`() {
        show(InboxUiState(phase = InboxPhase.Content, rows = rows(), hasNext = true, currentPage = 1))
        tag("notifications.list").performTouchInput { swipeDown() }
        rule.waitForIdle()
        assertEquals(1, refreshes.size)
    }
}
