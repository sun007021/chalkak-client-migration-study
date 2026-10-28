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
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.core.data.aireview.testing.AiReviews
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.notification.NavCommand
import kr.chalkak.feature.notification.NavMode
import kr.chalkak.feature.notification.NotiCopyKeys
import kr.chalkak.feature.notification.NotificationDestination
import kr.chalkak.feature.notification.PushNavigationEvent
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * [MainHost] executes what `PushTapQueue` releases (`PushNavigationEvent`): the queue decides WHEN (session, boot, blocking screens),
 * the host decides HOW (stack, replace, scroll and refresh home, AI sheet entry, toast). `rig.noti.pushEvents` stands in for the queue.
 */
@RunWith(RobolectricTestRunner::class)
class MainHostPushTapTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private val rig = MainRig()
    private val home = Route.TabRoot(Tab.Home)

    @After
    fun tearDown() = rig.close()

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun launchHome(setup: MainRig.() -> Unit = {}) {
        rig.posts.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        rig.setup()
        rig.launch(rule, copy)
        rule.awaitTag("home.hero-photo")
    }

    private fun send(destination: NotificationDestination, mode: NavMode = NavMode.Push, toast: String? = null) {
        rig.noti.pushEvents.trySend(PushNavigationEvent.Go(NavCommand(destination, mode), toast))
        rule.waitForIdle()
    }

    private fun post(openAi: Boolean) = NotificationDestination.PostDetail(NotificationRig.POST, openAi)

    // ---- destinations (D-11) -------------------------------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-039 승인 푸시 탭은 내 게시물 상세를 홈 위에 쌓고 AI 시트는 열지 않는다`() {
        launchHome()
        send(post(openAi = false))
        rule.awaitTag("feed.root")
        assertEquals(listOf(home, Route.Feed(POST_MINE, FeedSource.ById)), rig.nav.stack)
        assertEquals(listOf(false), rig.noti.aiOpenFlags.toList())
    }

    @Test
    fun `TC-PUSH-040 AI 결과 푸시 탭은 게시물 상세를 열고 최신 GET 기준으로 AI 결과 시트를 한 번 연다`() {
        launchHome { aiRepo.scriptGet(ApiResult.Success(AiReviews.completed())) }
        send(post(openAi = true))
        rule.awaitTag("ai-result-sheet.root")
        assertEquals(listOf(home, Route.Feed(POST_MINE, FeedSource.ById)), rig.nav.stack)
        assertEquals(listOf(true), rig.noti.aiOpenFlags.toList())
        assertEquals(1, rig.aiRepo.getCount)
    }

    @Test
    fun `TC-PUSH-040 AI 실패 푸시 탭은 실패 시트를 연다`() {
        launchHome { aiRepo.scriptGet(ApiResult.Success(AiReviews.failed(canRequestAgain = false))) }
        send(post(openAi = true))
        rule.awaitTag("ai-failed-sheet.root")
    }

    @Test
    fun `TC-PUSH-042 공지 푸시 탭은 공지 sourceId 가 아니라 알림 id 로 알림 상세를 연다`() {
        launchHome { noti.detailFixture("notice") }
        send(NotificationDestination.NotificationDetail(NotificationRig.NOTICE))
        rule.awaitTag("notification-detail.root")
        assertEquals(listOf(home, Route.NotificationDetail(NotificationRig.NOTICE)), rig.nav.stack)
        assertEquals(listOf(NotificationRig.NOTICE), rig.noti.repo.detailCalls.toList())
        tag("notification-detail.title").assertIsDisplayed()
    }

    @Test
    fun `TC-PUSH-044 알림함 폴백은 알림함 목록을 연다`() {
        launchHome { noti.listFixture("notifications__page1") }
        send(NotificationDestination.Inbox)
        rule.awaitTag("notifications.list")
        assertEquals(listOf(home, Route.Notifications), rig.nav.stack)
        assertTrue(rig.noti.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-PUSH-037 이미 홈이면 TOPIC 푸시는 새 화면을 쌓지 않고 홈을 새로고침한다`() {
        launchHome()
        val before = rig.fakes.home.todayCalls.size
        send(NotificationDestination.Home(scrollToTopAndRefresh = true), NavMode.AlreadyThere)
        rule.waitUntil(2_000) { rig.fakes.home.todayCalls.size > before }
        assertEquals(listOf(home), rig.nav.stack)
        tag("home.root").assertIsDisplayed()
    }

    @Test
    fun `TC-PUSH-037 다른 화면 위에서 TOPIC 푸시는 홈으로 돌아가 홈을 새로고침한다`() {
        launchHome()
        openFeed()
        val before = rig.fakes.home.todayCalls.size
        send(NotificationDestination.Home(scrollToTopAndRefresh = true))
        rule.awaitTag("home.hero-photo")
        assertEquals(listOf(home), rig.nav.stack)
        rule.waitUntil(2_000) { rig.fakes.home.todayCalls.size > before }
    }

    @Test
    fun `TC-PUSH-038 REMINDER 푸시는 다른 탭에서 홈 탭으로 이동한다`() {
        launchHome()
        tag("bottom-bar.tab-display").performClick()
        rule.awaitTag("display.root")
        send(NotificationDestination.Home(scrollToTopAndRefresh = false))
        rule.awaitTag("home.hero-photo")
        assertEquals(Tab.Home, rig.nav.selectedTab)
        assertTrue(rig.noti.repo.readCalls.isEmpty())
    }

    // ---- replace instead of stack (REQ-NAV-031, TC-PUSH-064) ----------------------------------------------------------------

    private fun openFeed() {
        rule.runOnUiThread { rig.nav.open(Route.Feed(POST_MINE, FeedSource.ById)) }
        rule.awaitTag("feed.root")
    }

    @Test
    fun `TC-PUSH-064 같은 게시물 상세가 이미 열려 있으면 푸시 탭은 쌓지 않고 교체하며 새 홀더로 다시 불러온다`() {
        launchHome { aiRepo.scriptGet(ApiResult.Success(AiReviews.completed()), ApiResult.Success(AiReviews.completed())) }
        openFeed()
        assertEquals(1, rig.feedEntries.size)
        send(post(openAi = true), NavMode.ReplaceTop)
        rule.awaitTag("ai-result-sheet.root")
        assertEquals(listOf(home, Route.Feed(POST_MINE, FeedSource.ById)), rig.nav.stack)
        assertEquals(2, rig.feedEntries.size)
        assertEquals(true, rig.noti.aiOpenFlags.last())
    }

    @Test
    fun `TC-PUSH-064 같은 알림 상세가 이미 열려 있으면 푸시 탭은 교체하고 상세를 다시 요청한다`() {
        launchHome { noti.detailFixture("notice"); noti.detailFixture("notice") }
        send(NotificationDestination.NotificationDetail(NotificationRig.NOTICE))
        rule.awaitTag("notification-detail.root")
        send(NotificationDestination.NotificationDetail(NotificationRig.NOTICE), NavMode.ReplaceTop)
        rule.waitForIdle()
        assertEquals(listOf(home, Route.NotificationDetail(NotificationRig.NOTICE)), rig.nav.stack)
        assertEquals(listOf(NotificationRig.NOTICE, NotificationRig.NOTICE), rig.noti.repo.detailCalls.toList())
    }

    @Test
    fun `TC-PUSH-042 푸시로 연 알림 상세에서 알림함으로를 누르면 알림함이 상세를 대체해 열린다`() {
        launchHome {
            noti.detailFixture("rejected")
            noti.listFixture("notifications__page1")
        }
        send(NotificationDestination.NotificationDetail(NotificationRig.REJECTED))
        rule.awaitTag("notification-detail.back-to-inbox-button")
        tag("notification-detail.back-to-inbox-button").performClick()
        rule.awaitTag("notifications.list")
        assertEquals(listOf(home, Route.Notifications), rig.nav.stack)
    }

    // ---- toasts and login ----------------------------------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-054 읽음이 네트워크 실패였던 푸시 탭은 토스트를 띄우고 이동한다`() {
        launchHome()
        send(post(openAi = false), toast = NotiCopyKeys.READ_ERROR_NETWORK)
        rule.awaitTag("feed.root")
        assertEquals(listOf(copy[NotiCopyKeys.READ_ERROR_NETWORK]), rig.shownToasts.toList())
    }

    @Test
    fun `TC-PUSH-055 읽음이 404 인 푸시 탭은 토스트만 띄우고 화면은 그대로다`() {
        launchHome()
        rig.noti.pushEvents.trySend(PushNavigationEvent.Toast(NotiCopyKeys.GONE))
        rule.waitForIdle()
        assertEquals(listOf(copy[NotiCopyKeys.GONE]), rig.shownToasts.toList())
        assertEquals(listOf(home), rig.nav.stack)
    }

    @Test
    fun `TC-PUSH-057 로그인 필요 이벤트는 호스트가 따로 이동하거나 토스트를 띄우지 않는다 - 로그인 이동은 인증 이벤트가 맡는다`() {
        launchHome()
        rig.noti.pushEvents.trySend(PushNavigationEvent.RequireLogin)
        rule.waitForIdle()
        assertEquals(listOf(home), rig.nav.stack)
        tag("home.root").assertIsDisplayed()
        // The host keeps consuming events afterwards.
        send(post(openAi = false))
        rule.awaitTag("feed.root")
        assertTrue(rig.shownToasts.isEmpty())
    }

    // ---- cold start ----------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-062 호스트가 뜨기 전에 풀려난 이벤트는 호스트가 뜬 뒤 정확히 한 번 처리된다`() {
        rig.posts.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        rig.noti.pushEvents.trySend(PushNavigationEvent.Go(NavCommand(post(openAi = false), NavMode.Push)))
        rig.launch(rule, copy)
        rule.awaitTag("feed.root")
        assertEquals(listOf(home, Route.Feed(POST_MINE, FeedSource.ById)), rig.nav.stack)
        assertEquals(1, rig.feedEntries.size)
        rule.onAllNodesWithTag("feed.root").assertCountEquals(1)
    }

    @Test
    fun `TC-PUSH-052 같은 이벤트가 두 번 와도 각각 처리된다`() {
        launchHome { noti.listFixture("notifications__page1") }
        send(NotificationDestination.Inbox)
        rule.awaitTag("notifications.list")
        send(post(openAi = false))
        rule.awaitTag("feed.root")
        send(post(openAi = false), NavMode.ReplaceTop)
        rule.waitForIdle()
        assertEquals(listOf(home, Route.Notifications, Route.Feed(POST_MINE, FeedSource.ById)), rig.nav.stack)
        assertEquals(2, rig.feedEntries.size)
    }
}
