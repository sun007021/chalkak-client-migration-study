package com.stonefive.chalkak.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.CountingNonces
import com.stonefive.chalkak.testing.FIXED_CLOCK
import com.stonefive.chalkak.testing.FakeAuth
import com.stonefive.chalkak.testing.FakeBrowser
import com.stonefive.chalkak.testing.FakeGuestFlags
import com.stonefive.chalkak.testing.FakePreloader
import com.stonefive.chalkak.testing.FakeSessionStore
import com.stonefive.chalkak.testing.FakeUpdateChecker
import com.stonefive.chalkak.testing.FakeUpdateLauncher
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.RecordingPush
import com.stonefive.chalkak.testing.ScriptedSocialLogin
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.validSession
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlin.test.assertEquals
import kotlin.test.assertNotSame
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.core.network.StoredSession
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.auth.LoginStateHolder
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
import org.robolectric.annotation.Config

/**
 * Settings inside the whole app host (A9): logout / withdraw / guest login end in the login screen, and a new login gets new settings
 * holders (nothing of the previous account is shown, TC-SET-037).
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1400dp")
class ChalkakRootSettingsTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val holderScope = HolderScope()
    private val rig = MainRig()
    private val controllers = mutableListOf<NavigationController>()

    @After
    fun tearDown() {
        holderScope.close()
        rig.close()
    }

    private fun launch(stored: StoredSession) {
        val signupContext = SignupContext()
        val push = RecordingPush()
        val gate = BootGate(
            scope = holderScope.scope, clock = FIXED_CLOCK, sessionStore = FakeSessionStore(stored), updateChecker = FakeUpdateChecker(),
            updateLauncher = FakeUpdateLauncher(), preloader = FakePreloader(), push = push, resetter = { }, authEvents = emptyFlow(),
        )
        val deps = RootDependencies(
            bootGate = gate,
            newNavigation = { mode, initial -> NavigationController(rig.analytics, mode, listOf(initial)).also { controllers += it } },
            newLoginHolder = { scope ->
                LoginStateHolder(scope, ScriptedSocialLogin(), CountingNonces(), FakeAuth(), FakeGuestFlags(), push, rig.analytics)
            },
            newTermsHolder = { TermsStateHolder(signupContext, rig.analytics) },
            signupContext = signupContext,
            legalDocumentOpener = LegalDocumentOpener(FakeBrowser()),
            main = rig.deps(),
        )
        gate.start()
        rule.setContent { ChalkakTheme { ChalkakRoot(copy, deps) } }
        rule.waitForIdle()
    }

    private fun tap(tag: String) {
        rule.onNodeWithTag(tag).performClick()
        rule.waitForIdle()
    }

    private fun openSettings() {
        rule.awaitTag("bottom-bar.root")
        tap("bottom-bar.tab-settings")
        rule.awaitTag("settings.root")
    }

    @Test
    fun `TC-SET-041 로그아웃을 확인하면 로그인 화면이 열리고 설정과 하단바는 사라진다`() {
        launch(StoredSession.User(validSession()))
        openSettings()
        tap("settings.logout-row")
        tap("settings.logout-confirm-button")
        rule.awaitTag("login.root")
        rule.onNodeWithTag("login.root").assertIsDisplayed()
        rule.onNodeWithTag("settings.root").assertDoesNotExist()
        rule.onNodeWithTag("bottom-bar.root").assertDoesNotExist()
        assertEquals(1, rig.settings.auth.logoutCalls)
        assertEquals(Route.Login, controllers.single().top)
    }

    @Test
    fun `TC-SET-046 회원탈퇴에 성공하면 로그인 화면이 열린다`() {
        launch(StoredSession.User(validSession()))
        openSettings()
        tap("settings.withdraw-row")
        tap("settings.withdraw-confirm-button")
        rule.awaitTag("login.root")
        assertEquals(1, rig.settings.auth.withdrawCalls)
        rule.onNodeWithTag("settings.root").assertDoesNotExist()
    }

    @Test
    fun `TC-AUTH-033 게스트가 설정의 로그인을 누르면 로그인 화면이 열린다`() {
        launch(StoredSession.Guest)
        openSettings()
        tap("settings.login-button")
        rule.awaitTag("login.root")
        rule.onNodeWithTag("login.kakao-button").assertIsDisplayed()
        assertEquals(1, rig.settings.guestFlags.clearCalls)
    }

    @Test
    fun `TC-SET-037 로그아웃 뒤 다시 로그인하면 이전 계정의 사인과 토글을 남기지 않고 새로 조회한다`() {
        launch(StoredSession.User(validSession()))
        openSettings()
        rule.onNodeWithTag("settings.signature-image").assertIsDisplayed()
        tap("settings.logout-row")
        tap("settings.logout-confirm-button")
        rule.awaitTag("login.root")

        val gate = CompletableDeferred<Unit>().also { rig.settings.signatures.currentGate = it }
        rig.settings.pushRepo.loadGate = gate
        tap("login.kakao-button")
        rule.awaitTag("bottom-bar.root")
        tap("bottom-bar.tab-settings")
        rule.awaitTag("settings.root")

        rule.onNodeWithTag("settings.signature-image").assertDoesNotExist()
        rule.onNodeWithTag("settings.push-loading").assertIsDisplayed()
        assertEquals(2, rig.settings.holderSets.size)
        assertNotSame(rig.settings.holderSets[0], rig.settings.holderSets[1])
        gate.complete(Unit)
        rule.waitForIdle()
        rule.onNodeWithTag("settings.signature-image").assertIsDisplayed()
    }
}
