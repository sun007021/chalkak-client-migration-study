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
import kr.chalkak.feature.notification.NotiCopyKeys
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** `NotificationDetailRoute` over the real detail holder and a scripted repository. */
@RunWith(RobolectricTestRunner::class)
class NotificationDetailRouteTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val scope = HolderScope()
    private val noti = NotificationRig()
    private val images = RecordingImage()
    private val id = NotificationRig.REJECTED

    private val toasts = CopyOnWriteArrayList<String>()
    private var closes = 0
    private var opensInbox = 0
    private var invalidations = 0
    private var logins = 0
    private var onScreen by mutableStateOf(true)

    @After
    fun tearDown() = scope.close()

    private fun show(inboxIsBelow: Boolean = false, detail: String? = "rejected") {
        detail?.let(noti::detailFixture)
        val holder = noti.newDetailHolder(scope.scope)
        rule.setContent {
            TestApp(copy) {
                if (onScreen) {
                    NotificationDetailRoute(
                        holder = holder,
                        notificationId = id,
                        inboxIsBelow = inboxIsBelow,
                        image = images.slot,
                        showToast = { toasts += it },
                        onClose = { closes++ },
                        onOpenInbox = { opensInbox++ },
                        onInvalidateInbox = { invalidations++ },
                        onRequireLogin = { logins++ },
                    )
                }
            }
        }
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    @Test
    fun `TC-NOTI-048 화면에 들어오면 알림 id 로 상세를 한 번 요청하고 읽음 요청은 보내지 않는다`() {
        show()
        tag("notification-detail.title").assertIsDisplayed()
        assertEquals(listOf(id), noti.repo.detailCalls.toList())
        assertTrue(noti.repo.readCalls.isEmpty())
        assertEquals(listOf("notification_detail"), noti.holderAnalytics.screens.toList())
    }

    @Test
    fun `TC-NOTI-042 알림함이 아래에 없으면 알림함으로 버튼이 알림함을 연다`() {
        show(inboxIsBelow = false)
        tag("notification-detail.back-to-inbox-button").performClick()
        rule.waitForIdle()
        assertEquals(1, opensInbox)
        assertEquals(0, closes)
    }

    @Test
    fun `TC-NOTI-042 알림함이 이미 아래에 있으면 알림함으로 버튼은 상세만 닫는다`() {
        show(inboxIsBelow = true)
        tag("notification-detail.back-to-inbox-button").performClick()
        rule.waitForIdle()
        assertEquals(1, closes)
        assertEquals(0, opensInbox)
    }

    @Test
    fun `뒤로 버튼은 상세를 닫는다`() {
        show()
        tag("notification-detail.back-button").performClick()
        assertEquals(1, closes)
    }

    @Test
    fun `TC-NOTI-045 상세가 404 면 안내 토스트와 알림함 무효화와 미읽음 재조회가 일어난다`() {
        noti.repo.detailResults += httpFail(404)
        show(detail = null)
        tag("notification-detail.not-found-state").assertShowsAll(copy[NotiCopyKeys.GONE])
        assertEquals(listOf(copy[NotiCopyKeys.GONE]), toasts.toList())
        assertEquals(1, invalidations)
        assertEquals(1, noti.unread.calls)
    }

    @Test
    fun `TC-NOTI-046 오류 상태에서 다시 시도를 누르면 상세를 다시 요청해 내용을 보인다`() {
        noti.repo.detailResults += offlineFail()
        show()
        tag("notification-detail.error-state").assertShowsAll(copy[NotiCopyKeys.NETWORK])
        tag("notification-detail.retry-button").performClick()
        rule.waitForIdle()
        assertEquals(listOf(id, id), noti.repo.detailCalls.toList())
        tag("notification-detail.title").assertIsDisplayed()
        rule.onAllNodesWithTag("notification-detail.error-state").assertCountEquals(0)
    }

    @Test
    fun `TC-NOTI-035 상세가 401 로 끝나면 로그인 화면으로 보낸다`() {
        noti.repo.detailResults += httpFail(401, ErrorCode.REAUTHENTICATION_REQUIRED)
        show(detail = null)
        assertEquals(1, logins)
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `화면을 떠나면 진행 중인 상세 요청의 응답이 와도 토스트나 무효화가 없다`() {
        val gate = CompletableDeferred<Unit>()
        noti.repo.detailGates += gate
        noti.repo.detailResults += httpFail(404)
        show(detail = null)
        assertEquals(listOf(id), noti.repo.detailCalls.toList())
        onScreen = false
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertTrue(toasts.isEmpty())
        assertEquals(0, invalidations)
    }

    @Test
    fun `로딩 중에는 로딩 표시가 보이고 응답 뒤에는 사라진다`() {
        val gate = CompletableDeferred<Unit>()
        noti.repo.detailGates += gate
        show()
        tag("notification-detail.loading").assertIsDisplayed()
        gate.complete(Unit)
        rule.awaitTag("notification-detail.title")
        rule.onAllNodesWithTag("notification-detail.loading").assertCountEquals(0)
    }
}
