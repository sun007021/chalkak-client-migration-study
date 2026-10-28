package com.stonefive.chalkak.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.geometry.Offset
import com.stonefive.chalkak.platform.AndroidSignatureEncoder
import com.stonefive.chalkak.platform.NoopPushRegistrar
import com.stonefive.chalkak.testing.CountingNonces
import com.stonefive.chalkak.testing.FakeAuth
import com.stonefive.chalkak.testing.FakeBrowser
import com.stonefive.chalkak.testing.FakeGuestFlags
import com.stonefive.chalkak.testing.FakePreloader
import com.stonefive.chalkak.testing.FakeSessionStore
import com.stonefive.chalkak.testing.FakeUpdateChecker
import com.stonefive.chalkak.testing.FakeUpdateLauncher
import com.stonefive.chalkak.testing.FakeUploader
import com.stonefive.chalkak.testing.FIXED_CLOCK
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.RecordingAnalytics
import com.stonefive.chalkak.testing.RecordingPush
import com.stonefive.chalkak.testing.ScriptedSocialLogin
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.validSession
import com.stonefive.chalkak.ui.signature.SignaturePadSpace
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.onboarding.SignupRepository
import kr.chalkak.core.data.onboarding.SignupUpload
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.Session
import kr.chalkak.feature.auth.BootGate
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.NavigationController
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.onboarding.LegalDocumentOpener
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignaturePadStateHolder
import kr.chalkak.feature.onboarding.SignupContext
import kr.chalkak.feature.onboarding.SignupStateHolder
import kr.chalkak.feature.onboarding.TermsStateHolder
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Sign-up path of the host: login (SIGN_UP_REQUIRED) -> terms -> drawing -> preview -> account -> member home. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SignupFlowRoutingTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val holderScope = HolderScope()
    private val analytics = RecordingAnalytics()
    private val signupContext = SignupContext()
    private val controllers = mutableListOf<NavigationController>()
    private val uploader = FakeUploader()
    private val confirmed = CopyOnWriteArrayList<String>()

    private val signupRepository = object : SignupRepository {
        override suspend fun requestUpload(idToken: String, rawNonce: String): ApiResult<SignupUpload> =
            ApiResult.Success(SignupUpload("u1", "https://upload.example/1", "signup-token"))

        override suspend fun confirm(signupToken: String): ApiResult<Session> {
            confirmed += signupToken
            return ApiResult.Success(validSession())
        }
    }

    @After
    fun tearDown() = holderScope.close()

    private fun launch() {
        val social = ScriptedSocialLogin()
        val auth = FakeAuth(ApiResult.Success(SocialLoginOutcome.SignUpRequired))
        val gate = BootGate(
            holderScope.scope, FIXED_CLOCK, FakeSessionStore(), FakeUpdateChecker(), FakeUpdateLauncher(), FakePreloader(),
            RecordingPush(), { }, emptyFlow(),
        )
        val deps = RootDependencies(
            bootGate = gate,
            newNavigation = { mode, initial -> NavigationController(analytics, mode, listOf(initial)).also { controllers += it } },
            newLoginHolder = { scope -> LoginStateHolder(scope, social, CountingNonces(), auth, FakeGuestFlags(), RecordingPush(), analytics) },
            newTermsHolder = { TermsStateHolder(signupContext, analytics) },
            signupContext = signupContext,
            legalDocumentOpener = LegalDocumentOpener(FakeBrowser()),
            signup = SignupDependencies(
                newPadHolder = { SignaturePadStateHolder(SignatureMode.Signup, SignaturePadSpace, AndroidSignatureEncoder(), analytics) },
                newSignupHolder = { scope ->
                    SignupStateHolder(scope, signupContext, signupRepository, uploader, auth, NoopPushRegistrar)
                },
            ),
        )
        gate.start()
        rule.setContent { ChalkakTheme { ChalkakRoot(copy, deps) } }
        rule.waitForIdle()
    }

    private fun draw() {
        rule.onNodeWithTag("signature.canvas").performTouchInput { swipe(Offset(10f, 10f), Offset(width - 10f, height - 10f), 200) }
        rule.waitForIdle()
    }

    private fun goToSignature() {
        launch()
        rule.onNodeWithTag("login.kakao-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("terms.agree-all-checkbox").performClick()
        rule.onNodeWithTag("terms.next-button").performClick()
        rule.waitForIdle()
    }

    @Test
    fun `TC-ONB-015 두 항목 동의 후 다음을 누르면 사인 그리기 화면이 열린다`() {
        goToSignature()
        rule.onNodeWithTag("signature.root").assertIsDisplayed()
        assertEquals(Route.OnboardingSignature, controllers.last().top)
    }

    @Test
    fun `TC-SIGN-008 제출하면 미리보기가 스택에 한 번만 쌓인다`() {
        goToSignature()
        draw()
        rule.onNodeWithTag("signature.submit-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("signature-preview.root").assertIsDisplayed()
        assertEquals(listOf(Route.Login, Route.Terms, Route.OnboardingSignature, Route.OnboardingSignaturePreview), controllers.last().stack)
    }

    @Test
    fun `TC-ONB-024 시작하기가 끝나면 약관과 사인 화면이 사라지고 회원 모드 홈이 열린다`() {
        goToSignature()
        draw()
        rule.onNodeWithTag("signature.submit-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("signature-preview.confirm-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("home.root").assertIsDisplayed()
        assertEquals(1, uploader.puts)
        assertEquals(listOf("signup-token"), confirmed.toList())
        assertEquals(AccessMode.Member, controllers.last().accessMode)
        assertEquals(1, controllers.last().stack.size)
        assertFalse(signupContext.isPresent, "idToken and rawNonce are dropped once the account exists")
    }

    @Test
    fun `TC-SIGN-008 다시 그리기는 빈 캔버스의 그리기 화면으로 돌아가고 다시 제출할 수 있다`() {
        goToSignature()
        draw()
        rule.onNodeWithTag("signature.submit-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("signature-preview.redraw-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("signature.root").assertIsDisplayed()
        rule.onNodeWithTag("signature.canvas-hint").assertIsDisplayed()
        draw()
        rule.onNodeWithTag("signature.submit-button").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag("signature-preview.root").assertIsDisplayed()
        assertTrue(signupContext.isPresent)
    }
}
