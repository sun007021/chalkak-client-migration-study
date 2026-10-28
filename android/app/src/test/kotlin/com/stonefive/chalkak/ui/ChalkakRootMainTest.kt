package com.stonefive.chalkak.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.FakePreloader
import com.stonefive.chalkak.testing.FakeSessionStore
import com.stonefive.chalkak.testing.FakeUpdateChecker
import com.stonefive.chalkak.testing.FakeUpdateLauncher
import com.stonefive.chalkak.testing.FIXED_CLOCK
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.RecordingPush
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.validSession
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.core.network.StoredSession
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignupContext
import kr.chalkak.feature.onboarding.TermsStateHolder
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

/** The app host hands every main route to [com.stonefive.chalkak.ui.main.MainHost] when `RootDependencies.main` is set. */
@RunWith(RobolectricTestRunner::class)
class ChalkakRootMainTest {
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
        val gate = BootGate(
            scope = holderScope.scope, clock = FIXED_CLOCK, sessionStore = FakeSessionStore(stored), updateChecker = FakeUpdateChecker(),
            updateLauncher = FakeUpdateLauncher(), preloader = FakePreloader(), push = RecordingPush(), resetter = { }, authEvents = emptyFlow(),
        )
        val deps = RootDependencies(
            bootGate = gate,
            newNavigation = { mode, initial -> NavigationController(rig.analytics, mode, listOf(initial)).also { controllers += it } },
            newLoginHolder = { error("login is not reached") },
            newTermsHolder = { TermsStateHolder(signupContext, rig.analytics) },
            signupContext = signupContext,
            legalDocumentOpener = LegalDocumentOpener(com.stonefive.chalkak.testing.FakeBrowser()),
            main = rig.deps(),
        )
        gate.start()
        rule.setContent { ChalkakTheme { ChalkakRoot(copy, deps) } }
        rule.waitForIdle()
    }

    @Test
    fun `TC-NAV-003 회원 세션으로 부팅하면 하단바와 홈이 함께 열리고 홈 탭이 선택되어 있다`() {
        launch(StoredSession.User(validSession()))
        rule.awaitTag("bottom-bar.root")
        rule.onNodeWithTag("bottom-bar.root").assertIsDisplayed()
        rule.onNodeWithTag("bottom-bar.tab-home").assertIsSelected()
        rule.awaitTag("home.hero-photo")
        assertEquals(AccessMode.Member, controllers.single().accessMode)
    }

    @Test
    fun `TC-NAV-016 호스트 루트의 토스트 레이어에 게스트 제한 토스트가 뜬다`() {
        launch(StoredSession.Guest)
        rule.awaitTag("bottom-bar.root")
        rule.onNodeWithTag("bottom-bar.tab-record").performClick()
        rule.awaitTag("toast.message")
        rule.onNodeWithTag("toast.message").assertTextEquals(copy["nav.guest.record"])
    }
}
