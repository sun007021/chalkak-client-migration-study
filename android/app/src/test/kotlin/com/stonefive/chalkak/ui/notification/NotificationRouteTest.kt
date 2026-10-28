package com.stonefive.chalkak.ui.notification

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.NotificationRig
import com.stonefive.chalkak.testing.RecordingImage
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.notification.testing.httpFail
import kr.chalkak.core.data.notification.testing.offlineFail
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.feature.notification.NavCommand
import kr.chalkak.feature.notification.NavMode
import kr.chalkak.feature.notification.NotiCopyKeys
import kr.chalkak.feature.notification.NotificationDestination
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** `NotificationRoute` over the real inbox holder, tap handler and a scripted repository (`shared/fixtures/notification`). */
@RunWith(RobolectricTestRunner::class)
class NotificationRouteTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val scope = HolderScope()
    private val noti = NotificationRig()
    private val images = RecordingImage()

    private val toasts = CopyOnWriteArrayList<String>()
    private val navs = CopyOnWriteArrayList<NavCommand>()
    private var logins = 0
    private var backs = 0
    private var onScreen by mutableStateOf(true)

    @After
    fun tearDown() = scope.close()

    private fun show(list: String? = "notifications__page1") {
        list?.let(noti::listFixture)
        val holder = noti.newInboxHolder(scope.scope)
        rule.setContent {
            TestApp(copy) {
                if (onScreen) {
                    NotificationRoute(
                        holder = holder,
                        image = images.slot,
                        showToast = { toasts += it },
                        onNavigate = { navs += it },
                        onRequireLogin = { logins++ },
                        onBack = { backs++ },
                    )
                }
            }
        }
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun count(t: String) = rule.onAllNodesWithTag(t)

    private fun tap(id: String) {
        tag("notifications.item-$id").performClick()
        rule.waitForIdle()
    }

    @Test
    fun `TC-NOTI-002 화면에 들어오면 첫 페이지를 한 번만 요청하고 조회만으로 읽음 요청은 없다`() {
        show()
        tag("notifications.item-${NotificationRig.APPROVED}").assertIsDisplayed()
        assertEquals(listOf(1), noti.repo.listCalls.toList())
        assertTrue(noti.repo.readCalls.isEmpty())
        assertEquals(listOf("notifications"), noti.holderAnalytics.screens.toList())
    }

    @Test
    fun `TC-NOTI-004 첫 응답이 오기 전에는 로딩이 보이고 응답 뒤에는 사라진다`() {
        val gate = CompletableDeferred<Unit>()
        noti.repo.listGates += gate
        show()
        tag("notifications.loading").assertShowsAll(copy[NotiCopyKeys.INBOX_LOADING])
        gate.complete(Unit)
        rule.awaitTag("notifications.list")
        count("notifications.loading").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-005 빈 응답은 빈 상태를 보인다`() {
        show("notifications__empty")
        tag("notifications.empty-state").assertShowsAll(copy[NotiCopyKeys.INBOX_EMPTY_TITLE], copy[NotiCopyKeys.INBOX_EMPTY_BODY])
    }

    @Test
    fun `TC-NOTI-006 첫 로드 실패는 오류 화면이고 다시 시도가 목록을 다시 요청해 항목을 보인다`() {
        noti.repo.listResults += httpFail(500, ErrorCode.INTERNAL_ERROR)
        show("notifications__page1")
        tag("notifications.error-state").assertShowsAll(copy[NotiCopyKeys.INBOX_ERROR])
        tag("notifications.retry-button").performClick()
        rule.waitForIdle()
        assertEquals(listOf(1, 1), noti.repo.listCalls.toList())
        tag("notifications.item-${NotificationRig.APPROVED}").assertIsDisplayed()
        count("notifications.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-007 네트워크 오류는 네트워크 확인 문구를 보인다`() {
        noti.repo.listResults += offlineFail()
        show(null)
        tag("notifications.error-state").assertShowsAll(copy[NotiCopyKeys.NETWORK])
    }

    @Test
    fun `TC-NOTI-015 끝까지 스크롤하면 2페이지를 한 번 요청해 이어 붙이고 더 스크롤해도 중복 요청이 없다`() {
        show()
        noti.listFixture("notifications__page2-last")
        tag("notifications.list").performScrollToIndex(19)
        rule.waitForIdle()
        tag("notifications.list").performScrollToIndex(19)
        rule.waitForIdle()
        assertEquals(listOf(1, 2), noti.repo.listCalls.toList())
        tag("notifications.list").performScrollToIndex(24)
        rule.waitForIdle()
        tag("notifications.item-33333333-3333-4333-8333-333333333325").assertIsDisplayed()
        assertEquals(listOf(1, 2), noti.repo.listCalls.toList())
    }

    @Test
    fun `TC-NOTI-018 다음 페이지 요청이 실패하면 토스트를 띄우고 기존 목록은 그대로다`() {
        show()
        noti.repo.listResults += offlineFail()
        tag("notifications.list").performScrollToIndex(19)
        rule.waitForIdle()
        assertEquals(listOf(copy[NotiCopyKeys.INBOX_MORE_ERROR]), toasts.toList())
        tag("notifications.item-${NotificationRig.APPROVED}").assertIsDisplayed()
    }

    @Test
    fun `TC-NOTI-020 당겨서 새로고침이 실패하면 토스트만 띄우고 기존 목록을 유지한다`() {
        show()
        noti.repo.listResults += offlineFail()
        tag("notifications.list").performTouchInput { swipeDown() }
        rule.waitForIdle()
        assertEquals(listOf(1, 1), noti.repo.listCalls.toList())
        assertEquals(listOf(copy[NotiCopyKeys.INBOX_REFRESH_ERROR]), toasts.toList())
        tag("notifications.item-${NotificationRig.APPROVED}").assertIsDisplayed()
        count("notifications.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-022 로드 중에 화면을 떠나면 응답이 와도 오류 토스트가 없다`() {
        val gate = CompletableDeferred<Unit>()
        noti.repo.listGates += gate
        noti.repo.listResults += offlineFail()
        show(null)
        assertEquals(listOf(1), noti.repo.listCalls.toList())
        onScreen = false
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertTrue(toasts.isEmpty())
        assertEquals(0, logins)
    }

    @Test
    fun `TC-NOTI-027 승인 알림을 탭하면 읽음 PATCH 뒤에 내 게시물 상세로 이동한다`() {
        show()
        tap(NotificationRig.APPROVED)
        assertEquals(listOf(NotificationRig.APPROVED), noti.repo.readCalls.toList())
        assertEquals(
            listOf(NavCommand(NotificationDestination.PostDetail(NotificationRig.POST, openAiFeedbackSheet = false), NavMode.Push)),
            navs.toList(),
        )
    }

    @Test
    fun `TC-NOTI-028 AI 알림을 탭하면 읽음 뒤에 게시물 상세로 가며 AI 시트 자동 열기 플래그가 켜진다`() {
        show()
        tap(NotificationRig.AI_COMPLETED)
        tap(NotificationRig.AI_FAILED)
        assertEquals(listOf(NotificationRig.AI_COMPLETED, NotificationRig.AI_FAILED), noti.repo.readCalls.toList())
        assertEquals(
            List(2) { NavCommand(NotificationDestination.PostDetail(NotificationRig.POST, openAiFeedbackSheet = true), NavMode.Push) },
            navs.toList(),
        )
    }

    @Test
    fun `TC-NOTI-030 공지는 읽음 뒤에 공지 sourceId 가 아니라 알림 id 로 알림 상세를 연다`() {
        show()
        tap(NotificationRig.NOTICE)
        assertEquals(
            listOf(NavCommand(NotificationDestination.NotificationDetail(NotificationRig.NOTICE), NavMode.Push)),
            navs.toList(),
        )
    }

    @Test
    fun `TC-NOTI-031 반려 알림은 읽음 뒤에 알림 상세를 연다`() {
        show()
        tap(NotificationRig.REJECTED)
        assertEquals(listOf(NotificationRig.REJECTED), noti.repo.readCalls.toList())
        assertEquals(
            listOf(NavCommand(NotificationDestination.NotificationDetail(NotificationRig.REJECTED), NavMode.Push)),
            navs.toList(),
        )
    }

    @Test
    fun `TC-NOTI-024 TC-NOTI-025 주제 알림은 홈으로 가고 읽음 호출은 없다`() {
        show("notifications__topic-reminder")
        tap(NotificationRig.TOPIC)
        tap(NotificationRig.REMINDER)
        assertTrue(noti.repo.readCalls.isEmpty())
        assertEquals(
            listOf(
                NavCommand(NotificationDestination.Home(scrollToTopAndRefresh = true), NavMode.Push),
                NavCommand(NotificationDestination.Home(scrollToTopAndRefresh = false), NavMode.Push),
            ),
            navs.toList(),
        )
    }

    @Test
    fun `TC-NOTI-024 알 수 없는 type 항목은 표시되고 탭해도 이동도 읽음 호출도 없다`() {
        show("notifications__unknown-type")
        tag("notifications.item-${NotificationRig.APPROVED}").assertIsDisplayed()
        tap(NotificationRig.APPROVED)
        assertTrue(navs.isEmpty())
        assertTrue(noti.repo.readCalls.isEmpty())
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-NOTI-026 sourceType 과 sourceId 가 null 인 승인 알림은 탭해도 이동도 읽음 호출도 오류도 없다`() {
        show("notifications__null-source")
        tap(NotificationRig.APPROVED)
        assertTrue(navs.isEmpty())
        assertTrue(noti.repo.readCalls.isEmpty())
        assertTrue(toasts.isEmpty())
        tag("notifications.item-unread-${NotificationRig.APPROVED}").assertIsDisplayed()
    }

    @Test
    fun `TC-NOTI-036 읽음에 성공하면 그 항목의 미읽음 점만 사라진다`() {
        show()
        tag("notifications.item-unread-${NotificationRig.APPROVED}").assertIsDisplayed()
        tap(NotificationRig.APPROVED)
        count("notifications.item-unread-${NotificationRig.APPROVED}").assertCountEquals(0)
        tag("notifications.item-unread-${NotificationRig.REJECTED}").assertIsDisplayed()
    }

    @Test
    fun `TC-NOTI-032 읽음이 네트워크 오류면 토스트를 띄우고 이동은 하며 미읽음 점은 그대로다`() {
        show()
        noti.repo.readResults += offlineFail()
        tap(NotificationRig.APPROVED)
        assertEquals(listOf(copy[NotiCopyKeys.READ_ERROR_NETWORK]), toasts.toList())
        assertEquals(1, navs.size)
        tag("notifications.item-unread-${NotificationRig.APPROVED}").assertIsDisplayed()
    }

    @Test
    fun `TC-NOTI-033 읽음이 404 면 토스트를 띄우고 이동 없이 목록을 다시 불러온다`() {
        show()
        noti.listFixture("notifications__page1")
        noti.repo.readResults += httpFail(404)
        tap(NotificationRig.APPROVED)
        assertEquals(listOf(copy[NotiCopyKeys.GONE]), toasts.toList())
        assertTrue(navs.isEmpty())
        assertEquals(listOf(1, 1), noti.repo.listCalls.toList())
    }

    @Test
    fun `TC-NOTI-035 읽음이 401 로 끝나면 로그인 화면으로 보내고 이동하지 않는다`() {
        show()
        noti.repo.readResults += httpFail(401, ErrorCode.REAUTHENTICATION_REQUIRED)
        tap(NotificationRig.APPROVED)
        assertEquals(1, logins)
        assertTrue(navs.isEmpty())
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-NOTI-038 같은 항목을 연타해도 읽음 PATCH 와 이동은 한 번이다`() {
        show()
        val gate = CompletableDeferred<Unit>()
        noti.repo.readGates += gate
        tag("notifications.item-${NotificationRig.APPROVED}").performClick()
        tag("notifications.item-${NotificationRig.APPROVED}").performClick()
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(1, noti.repo.readCalls.size)
        assertEquals(1, navs.size)
    }

    @Test
    fun `TC-NOTI-039 읽음 PATCH 중에 화면을 떠나면 응답이 와도 이동하지 않는다`() {
        show()
        val gate = CompletableDeferred<Unit>()
        noti.repo.readGates += gate
        tag("notifications.item-${NotificationRig.APPROVED}").performClick()
        rule.waitForIdle()
        onScreen = false
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertTrue(navs.isEmpty())
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-NOTI-041 목록을 열어 보기만 해서는 읽음 요청이 없다`() {
        show()
        tag("notifications.list").performScrollToIndex(10)
        rule.waitForIdle()
        assertTrue(noti.repo.readCalls.isEmpty())
    }

    @Test
    fun `뒤로 버튼은 onBack 을 부른다`() {
        show()
        tag("notifications.back-button").performClick()
        assertEquals(1, backs)
    }
}
