package com.stonefive.chalkak.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.FakePreloader
import com.stonefive.chalkak.testing.FakeSessionStore
import com.stonefive.chalkak.testing.FakeUpdateChecker
import com.stonefive.chalkak.testing.FakeUpdateLauncher
import com.stonefive.chalkak.testing.FIXED_CLOCK
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.RecordingPush
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.auth.UpdateCheckResult
import kr.chalkak.feature.auth.UpdateFlowResult
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

/** REQ-BOOT-009: the update gate asks the host to close the app when the update flow is cancelled or fails. */
@RunWith(RobolectricTestRunner::class)
class ChalkakRootUpdateExitTest {
    @get:Rule
    val rule = createComposeRule()

    private val holderScope = HolderScope()
    private var exits = 0

    @After
    fun tearDown() = holderScope.close()

    private fun launch(result: UpdateFlowResult) {
        val signupContext = SignupContext()
        val gate = BootGate(
            scope = holderScope.scope, clock = FIXED_CLOCK, sessionStore = FakeSessionStore(),
            updateChecker = FakeUpdateChecker(UpdateCheckResult.UpdateRequired), updateLauncher = FakeUpdateLauncher(result),
            preloader = FakePreloader(), push = RecordingPush(), resetter = { }, authEvents = emptyFlow(),
        )
        val deps = RootDependencies(
            bootGate = gate,
            newNavigation = { _, _ -> error("navigation is not reached") },
            newLoginHolder = { error("login is not reached") },
            newTermsHolder = { TermsStateHolder(signupContext, com.stonefive.chalkak.testing.RecordingAnalytics()) },
            signupContext = signupContext,
            legalDocumentOpener = LegalDocumentOpener(com.stonefive.chalkak.testing.FakeBrowser()),
            onExitApp = { exits++ },
        )
        gate.start()
        rule.setContent { ChalkakTheme { ChalkakRoot(loadCopy(), deps) } }
        rule.awaitTag("update-gate.update-button")
    }

    @Test
    fun `TC-BOOT-031 REQ-BOOT-009 업데이트 취소 결과는 호스트의 앱 종료 콜백을 호출한다`() {
        launch(UpdateFlowResult.Cancelled)
        rule.onNodeWithTag("update-gate.update-button").performClick()
        rule.waitUntil(5_000) { exits == 1 }
        assertEquals(1, exits)
    }

    @Test
    fun `TC-BOOT-031 REQ-BOOT-009 스토어 이동에 성공하면 앱을 종료하지 않고 게이트가 유지된다`() {
        launch(UpdateFlowResult.Completed)
        rule.onNodeWithTag("update-gate.update-button").performClick()
        rule.waitForIdle()
        assertEquals(0, exits)
        rule.onNodeWithTag("update-gate.dialog").assertExists()
    }

    @Test
    fun `TC-BOOT-031 REQ-BOOT-009 취소 버튼은 앱 종료 콜백을 호출한다`() {
        launch(UpdateFlowResult.Completed)
        rule.onNodeWithTag("update-gate.cancel-button").performClick()
        rule.waitUntil(5_000) { exits == 1 }
        assertEquals(1, exits)
    }
}
