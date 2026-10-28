package com.stonefive.chalkak.ui.main

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.NotificationRig
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.hasNode
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.notification.NotiCopyKeys
import kr.chalkak.feature.notification.OsPermissionState
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * [MainHost] wiring of the notification screens: the home bell opens the inbox, inbox rows route by the D-11 table (feed, AI sheet,
 * notification detail, home), the detail's "알림함으로", and the OS permission prompt timing. Real holders over a scripted repository.
 */
@RunWith(RobolectricTestRunner::class)
class MainHostNotificationTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private var rig = MainRig()

    @After
    fun tearDown() = rig.close()

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun launchHome(setup: MainRig.() -> Unit = {}) {
        rig.setup()
        rig.launch(rule, copy)
        rule.awaitTag("home.hero-photo")
    }

    private fun openInbox(list: String = "notifications__page1") {
        rig.noti.listFixture(list)
        tag("home.notification-button").performClick()
        rule.awaitTag("notifications.list")
        rule.waitForIdle()
    }

    private fun tapRow(id: String) {
        tag("notifications.item-$id").performClick()
        rule.waitForIdle()
    }

    private fun systemBack() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }

    private fun feedSetup(): MainRig.() -> Unit = {
        posts.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
    }

    // ---- entry point ----------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-001 홈의 알림 벨을 누르면 알림 목록이 열리고 screen_view notifications 는 한 번이다`() {
        launchHome()
        openInbox()
        tag("notifications.root").assertIsDisplayed()
        tag("notifications.item-${NotificationRig.APPROVED}").assertIsDisplayed()
        assertEquals(Route.Notifications, rig.nav.top)
        assertEquals(1, rig.analytics.screens.count { it == "notifications" })
        assertEquals(listOf(1), rig.noti.repo.listCalls.toList())
    }

    @Test
    fun `TC-NOTI-001 알림 목록의 뒤로 버튼은 홈으로 돌아간다`() {
        launchHome()
        openInbox()
        tag("notifications.back-button").performClick()
        rule.waitForIdle()
        assertEquals(Route.TabRoot(Tab.Home), rig.nav.top)
        tag("home.root").assertIsDisplayed()
    }

    // ---- inbox row -> destination (D-11) -------------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-027 승인 알림 항목을 누르면 읽음 뒤에 내 게시물 상세가 열린다`() {
        launchHome(feedSetup())
        openInbox()
        tapRow(NotificationRig.APPROVED)
        rule.awaitTag("feed.root")
        assertEquals(Route.Feed(POST_MINE, FeedSource.ById), rig.nav.top)
        assertEquals(listOf(NotificationRig.APPROVED), rig.noti.repo.readCalls.toList())
        assertEquals(listOf(false), rig.noti.aiOpenFlags.toList())
    }

    @Test
    fun `TC-NOTI-028 AI 알림 항목을 누르면 게시물 상세가 열리고 AI 홀더가 시트 자동 열기 플래그로 만들어져 결과 시트가 열린다`() {
        launchHome(feedSetup())
        rig.aiRepo.scriptGet(ApiResult.Success(AiReviews.completed()))
        openInbox()
        tapRow(NotificationRig.AI_COMPLETED)
        rule.awaitTag("feed.root")
        rule.awaitTag("ai-result-sheet.root")
        assertEquals(listOf(true), rig.noti.aiOpenFlags.toList())
        assertEquals(Route.Feed(POST_MINE, FeedSource.ById), rig.nav.top)
    }

    @Test
    fun `TC-NOTI-028 AI 시트 자동 열기는 그 게시물 상세 한 번만이고 같은 게시물을 일반 경로로 다시 열면 시트는 닫혀 있다`() {
        launchHome(feedSetup())
        rig.aiRepo.scriptGet(ApiResult.Success(AiReviews.completed()), ApiResult.Success(AiReviews.completed()))
        openInbox()
        tapRow(NotificationRig.AI_COMPLETED)
        rule.awaitTag("ai-result-sheet.root")
        systemBack() // closes the sheet
        rig.noti.listFixture("notifications__page1") // the inbox reloads silently when it is shown again (holder contract)
        systemBack() // feed -> inbox
        rule.awaitTag("notifications.list")
        tapRow(NotificationRig.APPROVED)
        rule.awaitTag("feed.root")
        rule.onAllNodesWithTag("ai-result-sheet.root").assertCountEquals(0)
        assertEquals(listOf(true, false), rig.noti.aiOpenFlags.toList())
    }

    @Test
    fun `TC-NOTI-030 공지 항목을 누르면 알림 id 로 알림 상세가 열린다`() {
        launchHome { noti.detailFixture("notice") }
        openInbox()
        tapRow(NotificationRig.NOTICE)
        rule.awaitTag("notification-detail.root")
        assertEquals(Route.NotificationDetail(NotificationRig.NOTICE), rig.nav.top)
        assertEquals(listOf(NotificationRig.NOTICE), rig.noti.repo.detailCalls.toList())
        tag("notification-detail.title").assertIsDisplayed()
        assertEquals(1, rig.analytics.screens.count { it == "notification_detail" })
    }

    @Test
    fun `TC-NOTI-031 반려 항목의 알림 상세에서 알림함으로를 누르면 아래에 있던 알림함으로 돌아가고 목록을 조용히 다시 불러온다`() {
        launchHome { noti.detailFixture("rejected") }
        openInbox()
        rig.noti.listFixture("notifications__page1")
        tapRow(NotificationRig.REJECTED)
        rule.awaitTag("notification-detail.root")
        tag("notification-detail.back-to-inbox-button").performClick()
        rule.awaitTag("notifications.list")
        assertEquals(Route.Notifications, rig.nav.top)
        assertEquals(listOf(Route.TabRoot(Tab.Home), Route.Notifications), rig.nav.stack)
        assertEquals(listOf(1, 1), rig.noti.repo.listCalls.toList())
        tag("notifications.item-${NotificationRig.APPROVED}").assertIsDisplayed()
        assertTrue(rig.shownToasts.isEmpty())
    }

    @Test
    fun `TC-NOTI-025 주제 항목을 누르면 알림 목록이 닫히고 홈이 보이며 읽음 호출은 없다`() {
        launchHome()
        openInbox("notifications__topic-reminder")
        tapRow(NotificationRig.TOPIC)
        rule.awaitTag("home.hero-photo")
        assertEquals(listOf(Route.TabRoot(Tab.Home)), rig.nav.stack)
        assertTrue(rig.noti.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-NOTI-032 읽음이 네트워크 오류여도 상세로 이동하고 토스트를 띄운다`() {
        launchHome(feedSetup())
        openInbox()
        rig.noti.repo.readResults += kr.chalkak.core.data.notification.testing.offlineFail()
        tapRow(NotificationRig.APPROVED)
        rule.awaitTag("feed.root")
        assertEquals(listOf(copy[NotiCopyKeys.READ_ERROR_NETWORK]), rig.shownToasts.toList())
    }

    @Test
    fun `TC-NOTI-033 읽음이 404 면 토스트만 띄우고 알림함에 머문다`() {
        launchHome(feedSetup())
        openInbox()
        rig.noti.listFixture("notifications__page1")
        rig.noti.repo.readResults += kr.chalkak.core.data.notification.testing.httpFail(404)
        tapRow(NotificationRig.APPROVED)
        assertEquals(Route.Notifications, rig.nav.top)
        assertEquals(listOf(copy[NotiCopyKeys.GONE]), rig.shownToasts.toList())
    }

    // ---- unread dot ----------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-054 항목을 읽고 홈으로 돌아오면 미읽음 점이 다시 조회되어 사라진다`() {
        launchHome {
            fakes.home.unreadHandler = { ApiResult.Success(true) }
            noti.detailFixture("notice")
        }
        tag("home.notification-unread-dot").assertIsDisplayed()
        rig.fakes.home.unreadHandler = { ApiResult.Success(false) }
        rig.fakes.home.unreadCalls.clear()
        openInbox()
        tapRow(NotificationRig.NOTICE)
        rule.awaitTag("notification-detail.root")
        systemBack()
        systemBack()
        rule.awaitTag("home.hero-photo")
        rule.waitUntil(2_000) { !rule.hasNode("home.notification-unread-dot") }
        assertTrue(rig.fakes.home.unreadCalls.size >= 1)
    }

    @Test
    fun `TC-NOTI-050 TC-PUSH-071 푸시를 받으면 보이는 홈의 unread-status 를 한 번 다시 조회해 점이 생긴다`() {
        launchHome()
        val before = rig.fakes.home.unreadCalls.size
        rig.fakes.home.unreadHandler = { ApiResult.Success(true) }
        rig.noti.homeUnread.refresh()
        rule.waitUntil(2_000) { rule.hasNode("home.notification-unread-dot") }
        assertEquals(before + 1, rig.fakes.home.unreadCalls.size)
    }

    @Test
    fun `TC-NOTI-050 알림함이 홈을 덮고 있어도 푸시 수신은 홈의 미읽음을 다시 조회한다`() {
        launchHome()
        openInbox()
        val before = rig.fakes.home.unreadCalls.size
        rig.noti.homeUnread.refresh()
        rule.waitForIdle()
        assertEquals(before + 1, rig.fakes.home.unreadCalls.size)
    }

    // ---- OS permission prompt (PUSH-001..004, 007, 008) -----------------------------------------------------------------------

    @Test
    fun `TC-PUSH-001 인증 사용자의 최초 홈 진입에서 앱 안내 없이 OS 권한 요청만 한 번 호출된다`() {
        launchHome()
        rule.waitForIdle()
        assertEquals(1, rig.noti.permission.requests)
        assertTrue(rig.noti.promptStore.requested)
        rule.onAllNodesWithTag("push-permission.dialog").assertCountEquals(0)
    }

    @Test
    fun `TC-PUSH-003 홈을 벗어났다 다시 들어와도 권한 요청은 다시 하지 않는다`() {
        launchHome()
        rule.waitForIdle()
        tag("bottom-bar.tab-display").performClick()
        rule.awaitTag("display.root")
        tag("bottom-bar.tab-home").performClick()
        rule.awaitTag("home.hero-photo")
        rule.waitForIdle()
        assertEquals(1, rig.noti.permission.requests)
        assertEquals(1, rig.noti.promptStore.marks)
    }

    @Test
    fun `TC-PUSH-002 OS 권한이 이미 결정된 상태면 요청도 앱 안내도 없고 플래그만 저장한다 - Android 는 OS 대화상자만 쓴다`() {
        launchHome { noti.permission.state = OsPermissionState.Denied }
        rule.waitForIdle()
        assertEquals(0, rig.noti.permission.requests)
        assertTrue(rig.noti.promptStore.requested)
        rule.onAllNodesWithTag("push-permission.dialog").assertCountEquals(0)
    }

    @Test
    fun `TC-PUSH-008 Android 12 이하는 런타임 권한 요청 없이 홈이 열린다`() {
        launchHome { noti.permission.state = OsPermissionState.NotRequired }
        rule.waitForIdle()
        assertTrue(rig.noti.permission.stateCalls >= 1, "the permission flow runs on the first authenticated home")
        assertEquals(0, rig.noti.permission.requests)
        tag("home.root").assertIsDisplayed()
    }

    @Test
    fun `TC-PUSH-007 권한 요청 자체가 실패하면 알림 권한 요청 실패 토스트를 띄운다`() {
        launchHome { noti.permission.failure = IllegalStateException("no activity") }
        rule.waitForIdle()
        assertEquals(listOf(copy[NotiCopyKeys.PERM_ERROR]), rig.shownToasts.toList())
        tag("home.root").assertIsDisplayed()
    }

    @Test
    fun `TC-PUSH-009 사용자가 거부해도 앱은 정상 동작하고 토스트도 없다`() {
        launchHome { noti.permission.result = kr.chalkak.feature.notification.PermissionRequestResult.Denied }
        rule.waitForIdle()
        assertEquals(1, rig.noti.permission.requests)
        assertTrue(rig.shownToasts.isEmpty())
        tag("home.root").assertIsDisplayed()
    }

    @Test
    fun `TC-PUSH-004 게스트는 권한 요청도 안내도 없다`() {
        rig.close()
        rig = MainRig(AccessMode.Guest)
        rig.launch(rule, copy)
        rule.awaitTag("home.root")
        rule.waitForIdle()
        assertEquals(0, rig.noti.permission.requests)
        assertEquals(0, rig.noti.promptStore.marks)
        rule.onAllNodesWithTag("push-permission.dialog").assertCountEquals(0)
    }
}
