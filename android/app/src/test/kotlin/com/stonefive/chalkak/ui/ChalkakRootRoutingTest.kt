package com.stonefive.chalkak.ui

import androidx.compose.runtime.SideEffect
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.CountingNonces
import com.stonefive.chalkak.testing.FakeAuth
import com.stonefive.chalkak.testing.FakeBrowser
import com.stonefive.chalkak.testing.FakeGuestFlags
import com.stonefive.chalkak.testing.FakePreloader
import com.stonefive.chalkak.testing.FakeSessionStore
import com.stonefive.chalkak.testing.FakeUpdateChecker
import com.stonefive.chalkak.testing.FakeUpdateLauncher
import com.stonefive.chalkak.testing.FIXED_CLOCK
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.RecordingAnalytics
import com.stonefive.chalkak.testing.RecordingPush
import com.stonefive.chalkak.testing.ScriptedSocialLogin
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.validSession
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.StoredSession
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.auth.UpdateCheckResult
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
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
 * App host routing (boot gate -> navigation controller -> screens) with real holders and fakes at the ports.
 * The gate is started by the test (the host only collects its state).
 */
@RunWith(RobolectricTestRunner::class)
class ChalkakRootRoutingTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val holderScope = HolderScope()
    private val analytics = RecordingAnalytics()

    private val store = FakeSessionStore()
    private val updateChecker = FakeUpdateChecker()
    private val preloader = FakePreloader()
    private val push = RecordingPush()
    private val social = ScriptedSocialLogin()
    private val auth = FakeAuth()
    private val signupContext = SignupContext()

    /** Navigation controllers created by the host, in order. */
    private val controllers = mutableListOf<NavigationController>()
    private var homeDrawn = 0
    private val homeModes = mutableListOf<AccessMode>()

    @After
    fun tearDown() = holderScope.close()

    private fun launch() {
        val gate = BootGate(
            scope = holderScope.scope, clock = FIXED_CLOCK, sessionStore = store, updateChecker = updateChecker,
            updateLauncher = FakeUpdateLauncher(), preloader = preloader, push = push, resetter = { }, authEvents = emptyFlow(),
        )
        val deps = RootDependencies(
            bootGate = gate,
            newNavigation = { mode, initial -> NavigationController(analytics, mode, listOf(initial)).also { controllers += it } },
            newLoginHolder = { scope ->
                LoginStateHolder(scope, social, CountingNonces(), auth, FakeGuestFlags(), push, analytics)
            },
            newTermsHolder = { TermsStateHolder(signupContext, analytics) },
            signupContext = signupContext,
            legalDocumentOpener = LegalDocumentOpener(FakeBrowser()),
            mainContent = { mode ->
                SideEffect { homeDrawn++; homeModes += mode }
                MainPlaceholder()
            },
        )
        gate.start()
        rule.setContent { ChalkakTheme { ChalkakRoot(copy, deps) } }
        rule.waitForIdle()
    }

    private fun assertOnly(visible: String) {
        val all = listOf("splash.logo", "update-gate.dialog", "login.root", "terms.root", "home.root")
        all.forEach { tag ->
            if (tag == visible) rule.onNodeWithTag(tag).assertIsDisplayed() else rule.onNodeWithTag(tag).assertDoesNotExist()
        }
    }

    @Test
    fun `TC-BOOT-001 세션도 게스트 플래그도 없으면 스플래시 뒤 로그인 화면이 열리고 홈은 한 번도 그려지지 않는다`() {
        store.stored = StoredSession.None
        launch()
        assertOnly("login.root")
        assertEquals(0, homeDrawn, "home must never be drawn")
        assertEquals(1, controllers.size)
        assertEquals(Route.Login, controllers.single().top)
    }

    @Test
    fun `TC-BOOT-015 세션을 읽는 동안에는 로그인 화면이 번쩍이지 않고 스플래시가 유지된다`() {
        val readGate = CompletableDeferred<Unit>().also { store.readGate = it }
        launch()
        assertOnly("splash.logo")
        assertEquals(0, homeDrawn)

        readGate.complete(Unit)
        rule.waitForIdle()
        assertOnly("login.root")
    }

    @Test
    fun `TC-BOOT-016 강제 업데이트가 필요하면 닫을 수 없는 다이얼로그만 뜨고 유효한 세션이어도 홈 진입이 막힌다`() {
        store.stored = StoredSession.User(validSession())
        updateChecker.result = UpdateCheckResult.UpdateRequired
        launch()
        assertOnly("update-gate.dialog")
        assertEquals(0, homeDrawn)
        assertTrue(controllers.isEmpty() || controllers.none { it.top is Route.TabRoot }, "no main stack may be shown")
        assertEquals(0, push.calls, "no push registration while the gate is closed")
    }

    @Test
    fun `TC-BOOT-002 유효한 회원 세션이면 로그인 화면 없이 회원 모드 홈이 열린다 화면 라우팅`() {
        store.stored = StoredSession.User(validSession())
        launch()
        assertOnly("home.root")
        assertEquals(listOf(AccessMode.Member), homeModes.distinct())
    }

    @Test
    fun `TC-BOOT-003 게스트 플래그만 있으면 게스트 모드 홈이 열린다 화면 라우팅`() {
        store.stored = StoredSession.Guest
        launch()
        assertOnly("home.root")
        assertEquals(listOf(AccessMode.Guest), homeModes.distinct())
    }

    @Test
    fun `TC-AUTH-008 로그인 성공이면 로그인 화면이 사라지고 회원 모드 홈이 열린다 화면 라우팅`() {
        launch()
        rule.onNodeWithTag("login.kakao-button").performClick()
        rule.waitForIdle()
        assertOnly("home.root")
        assertEquals(listOf(AccessMode.Member), homeModes.distinct())
    }

    @Test
    fun `TC-AUTH-010 SIGN_UP_REQUIRED면 약관 화면이 열리고 가입 컨텍스트가 메모리에 담긴다 화면 라우팅`() {
        auth.default = ApiResult.Success(SocialLoginOutcome.SignUpRequired)
        launch()
        rule.onNodeWithTag("login.kakao-button").performClick()
        rule.waitForIdle()
        assertOnly("terms.root")
        assertTrue(signupContext.isPresent)
        assertEquals(Route.Terms, controllers.last().top)
        assertEquals(0, homeDrawn)
    }

    @Test
    fun `TC-ONB-017 약관 화면에서 뒤로 버튼을 누르면 로그인 화면으로 돌아가고 가입 컨텍스트가 폐기된다 화면 라우팅`() {
        auth.default = ApiResult.Success(SocialLoginOutcome.SignUpRequired)
        launch()
        rule.onNodeWithTag("login.kakao-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("terms.back-button").performClick()
        rule.waitForIdle()
        assertOnly("login.root")
        assertTrue(!signupContext.isPresent)
    }

    @Test
    fun `TC-BOOT-003 로그인 화면의 게스트 버튼은 게스트 모드 홈을 연다 화면 라우팅`() {
        launch()
        rule.onNodeWithTag("login.guest-button").performClick()
        rule.waitForIdle()
        assertOnly("home.root")
        assertEquals(listOf(AccessMode.Guest), homeModes.distinct())
    }

    @Test
    fun `TC-AUTH-008 내비게이션 컨트롤러 상태가 바뀌면 화면이 따라간다 세션 종료는 로그인 인증은 홈`() {
        store.stored = StoredSession.User(validSession())
        launch()
        assertOnly("home.root")
        val nav = controllers.single()

        nav.onSessionEnded()
        rule.waitForIdle()
        assertOnly("login.root")

        nav.onAuthenticated()
        rule.waitForIdle()
        assertOnly("home.root")
    }
}
