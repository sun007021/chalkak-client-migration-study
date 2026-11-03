package com.stonefive.chalkak.ui

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import com.stonefive.chalkak.push.PushNavigationState
import com.stonefive.chalkak.push.PushTapWiring
import com.stonefive.chalkak.testing.FIXED_CLOCK
import com.stonefive.chalkak.testing.FakePreloader
import com.stonefive.chalkak.testing.FakeSessionStore
import com.stonefive.chalkak.testing.FakeUpdateChecker
import com.stonefive.chalkak.testing.FakeUpdateLauncher
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.InMemoryPendingTapStore
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.NOTI_USER_A
import com.stonefive.chalkak.testing.NotificationRig
import com.stonefive.chalkak.testing.RecordingPush
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.pushPayload
import com.stonefive.chalkak.testing.validSession
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.network.StoredSession
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.notification.PushTapQueue
import kr.chalkak.feature.notification.TapSession
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignupContext
import kr.chalkak.feature.onboarding.TermsStateHolder
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * App host + REAL `PushTapQueue`: a push tap is held until the boot gate lets navigation start and no blocking screen is open, then
 * consumed exactly once (read PATCH, then the destination) by `MainHost`. The session view of the queue (`TapSession`) is driven by the
 * test; the container derives it from the boot result and the session store.
 */
@RunWith(RobolectricTestRunner::class)
class ChalkakRootPushTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val holderScope = HolderScope()
    private val rig = MainRig()
    private val controllers = mutableListOf<NavigationController>()
    private val navState = PushNavigationState()
    private val tapSession = MutableStateFlow<TapSession>(TapSession.Unknown)
    private val store = InMemoryPendingTapStore()
    private val bootRelease = CompletableDeferred<Unit>()
    private lateinit var queue: PushTapQueue

    @After
    fun tearDown() {
        holderScope.close()
        rig.close()
    }

    private fun launch(stored: StoredSession = StoredSession.User(validSession()), holdBoot: Boolean = false) {
        rig.posts.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        val signupContext = SignupContext()
        val gate = BootGate(
            scope = holderScope.scope, clock = FIXED_CLOCK,
            sessionStore = FakeSessionStore(stored, readGate = if (holdBoot) bootRelease else null),
            updateChecker = FakeUpdateChecker(), updateLauncher = FakeUpdateLauncher(), preloader = FakePreloader(),
            push = RecordingPush(), resetter = { }, authEvents = emptyFlow(),
        )
        queue = PushTapQueue(
            scope = holderScope.scope,
            store = store,
            handler = rig.noti.tapHandler(),
            session = tapSession,
            mainReady = gate.pushNavigationAllowed,
            blockingScreen = navState.blocking,
            top = { navState.top },
        )
        val deps = RootDependencies(
            bootGate = gate,
            newNavigation = { mode, initial -> NavigationController(rig.analytics, mode, listOf(initial)).also { controllers += it } },
            newLoginHolder = { error("login is not reached") },
            newTermsHolder = { TermsStateHolder(signupContext, rig.analytics) },
            signupContext = signupContext,
            legalDocumentOpener = LegalDocumentOpener(com.stonefive.chalkak.testing.FakeBrowser()),
            main = rig.deps(),
            pushTaps = PushTapWiring(queue, navState),
        )
        gate.start()
        queue.start()
        rule.setContent { ChalkakTheme { ChalkakRoot(copy, deps) } }
        rule.waitForIdle()
    }

    private fun tap(name: String) {
        queue.onTap(pushPayload(name))
        rule.waitForIdle()
    }

    private fun onUi(block: () -> Unit) {
        rule.runOnUiThread(block)
        rule.waitForIdle()
    }

    @Test
    fun `TC-PUSH-062 콜드 스타트 푸시 탭은 부팅이 끝날 때까지 버퍼링했다가 홈 진입 뒤 정확히 한 번 처리된다`() {
        launch(holdBoot = true)
        rule.onNodeWithTag("splash.logo").assertIsDisplayed()
        tapSession.value = TapSession.Member(NOTI_USER_A)
        tap("post-approved")
        assertTrue(rig.noti.repo.readCalls.isEmpty(), "nothing is read while the boot gate has not let navigation start")
        assertEquals(1, store.saves, "the pending tap is persisted while it waits")

        bootRelease.complete(Unit)
        rule.awaitTag("feed.root")
        assertEquals(listOf(NotificationRig.APPROVED), rig.noti.repo.readCalls.toList())
        assertEquals(listOf(Route.TabRoot(kr.chalkak.feature.navigation.Tab.Home), Route.Feed(POST_MINE, FeedSource.ById)), controllers.single().stack)
        assertEquals(null, store.current, "consumed taps are not stored")
        rule.onAllNodesWithTag("feed.root").assertCountEquals(1)
    }

    @Test
    fun `TC-PUSH-062 세션이 아직 정해지지 않았으면 부팅이 끝나도 보류하고 회원으로 정해지면 처리한다`() {
        launch()
        rule.awaitTag("home.hero-photo")
        tap("post-approved")
        assertTrue(rig.noti.repo.readCalls.isEmpty())
        tapSession.value = TapSession.Member(NOTI_USER_A)
        rule.awaitTag("feed.root")
        assertEquals(1, rig.noti.repo.readCalls.size)
    }

    @Test
    fun `TC-PUSH-061 피드백 화면이 열려 있으면 푸시 탭을 보류하고 그 화면을 벗어난 뒤 처리한다`() {
        launch()
        tapSession.value = TapSession.Member(NOTI_USER_A)
        rule.awaitTag("home.hero-photo")
        val nav = controllers.single()
        onUi { nav.open(Route.Feedback) }
        rule.awaitTag("feedback.root")
        assertTrue(navState.blocking.value, "the host mirrors the navigation into the queue's blocking flag")

        tap("post-approved")
        assertTrue(rig.noti.repo.readCalls.isEmpty())
        rule.onNodeWithTag("feedback.root").assertIsDisplayed()

        onUi { nav.onSystemBack() }
        rule.awaitTag("feed.root")
        assertEquals(1, rig.noti.repo.readCalls.size)
    }

    @Test
    fun `TC-PUSH-065 홈에 있을 때 TOPIC 푸시 탭은 읽음 호출 없이 홈 하나만 남기고 새로고침한다`() {
        launch()
        tapSession.value = TapSession.Member(NOTI_USER_A)
        rule.awaitTag("home.hero-photo")
        val before = rig.fakes.home.todayCalls.size
        tap("topic")
        rule.waitUntil(2_000) { rig.fakes.home.todayCalls.size > before }
        assertEquals(1, controllers.single().stack.size)
        assertTrue(rig.noti.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-PUSH-044 알 수 없는 type 푸시 탭은 알림함 목록을 열고 읽음 호출은 없다`() {
        launch()
        tapSession.value = TapSession.Member(NOTI_USER_A)
        rule.awaitTag("home.hero-photo")
        rig.noti.listFixture("notifications__page1")
        tap("unknown-type")
        rule.awaitTag("notifications.list")
        assertTrue(rig.noti.repo.readCalls.isEmpty())
        assertEquals(Route.Notifications, controllers.single().top)
    }
}
