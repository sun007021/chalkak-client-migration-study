package com.stonefive.chalkak.ui.login

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.CountingNonces
import com.stonefive.chalkak.testing.FakeAuth
import com.stonefive.chalkak.testing.FakeGuestFlags
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.RecordingAnalytics
import com.stonefive.chalkak.testing.RecordingPush
import com.stonefive.chalkak.testing.ScriptedSocialLogin
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.auth.NonceHasher
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.auth.LoginError
import kr.chalkak.feature.auth.LoginStateHolder
import kr.chalkak.feature.auth.LoginUiState
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class LoginScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val holderScope = HolderScope()
    private val social = ScriptedSocialLogin()
    private val auth = FakeAuth()
    private val homes = mutableListOf<HomeMode>()

    @After
    fun tearDown() = holderScope.close()

    private fun showScreen(state: LoginUiState) = rule.setContent {
        TestApp(copy) { LoginScreen(state = state, onKakaoClick = {}, onGuestClick = {}, onErrorConfirm = {}) }
    }

    private fun showRoute() {
        val holder = LoginStateHolder(
            scope = holderScope.scope, socialLogin = social, nonces = CountingNonces(), auth = auth,
            guestFlags = FakeGuestFlags(), push = RecordingPush(), analytics = RecordingAnalytics(),
        )
        rule.setContent { TestApp(copy) { LoginRoute(holder, onGoHome = { homes += it }, onGoTerms = {}) } }
    }

    @Test
    fun `TC-AUTH-001 로그인 화면은 태그라인 카카오 버튼 게스트 버튼을 copy 문구로 보인다`() {
        showScreen(LoginUiState())
        rule.onNodeWithTag("login.root").assertIsDisplayed()
        rule.onNodeWithTag("login.tagline").assertTextEquals(copy["auth.login.tagline"])
        rule.onNodeWithTag("login.kakao-button").assertIsEnabled().assertTextEquals(copy["auth.login.kakao"])
        rule.onNodeWithTag("login.guest-button").assertIsEnabled().assertTextEquals(copy["auth.login.guest"])
    }

    @Test
    fun `TC-AUTH-001 Apple Google 버튼은 없고 누를 수 있는 것은 카카오와 게스트 둘뿐이다`() {
        showScreen(LoginUiState())
        rule.onAllNodes(hasClickAction()).assertCountEquals(2)
        rule.onNodeWithTag("login.dev-bypass-button").assertDoesNotExist()
    }

    @Test
    fun `TC-AUTH-001 진행 표시와 오류 알림은 해당 상태가 아니면 트리에 없다`() {
        showScreen(LoginUiState())
        rule.onNodeWithTag("login.root").assertIsDisplayed()
        rule.onNodeWithTag("login.loading").assertDoesNotExist()
        rule.onNodeWithTag("login.error-dialog").assertDoesNotExist()
        rule.onNodeWithTag("login.error-dialog-confirm-button").assertDoesNotExist()
    }

    @Test
    fun `TC-AUTH-027 진행 중에는 두 버튼이 비활성이고 진행 표시가 있다`() {
        showScreen(LoginUiState(busy = true))
        rule.onNodeWithTag("login.kakao-button").assertIsNotEnabled()
        rule.onNodeWithTag("login.guest-button").assertIsNotEnabled()
        rule.onNodeWithTag("login.loading").assertIsDisplayed()
    }

    @Test
    fun `TC-AUTH-027 카카오 버튼을 3회 연타해도 SDK와 social-login은 1회이고 진행 중 버튼은 비활성이다`() {
        val sdkGate = CompletableDeferred<Unit>().also { social.gate = it }
        showRoute()

        repeat(3) { rule.onNodeWithTag("login.kakao-button").performClick() }
        rule.waitForIdle()

        assertEquals(1, social.hashedNonces.size, "Kakao SDK must be called once")
        rule.onNodeWithTag("login.kakao-button").assertIsNotEnabled()
        rule.onNodeWithTag("login.guest-button").assertIsNotEnabled()
        rule.onNodeWithTag("login.loading").assertIsDisplayed()

        sdkGate.complete(Unit)
        rule.waitForIdle()
        assertEquals(1, auth.loginCalls.size, "social-login must be requested once")
        assertEquals(listOf(HomeMode.Member), homes)
        assertEquals(NonceHasher.sha256Hex("raw-nonce-1"), social.hashedNonces.single())
    }

    @Test
    fun `TC-AUTH-029 같은 오류가 두 번 나도 알림이 다시 뜬다 W 부분`() {
        auth.default = ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE))
        showRoute()

        repeat(2) {
            rule.onNodeWithTag("login.kakao-button").performClick()
            rule.waitForIdle()
            rule.onNodeWithTag("login.error-dialog").assertIsDisplayed()
            rule.onNodeWithTag("login.error-dialog-confirm-button").performClick()
            rule.waitForIdle()
            rule.onNodeWithTag("login.error-dialog").assertDoesNotExist()
        }
        assertEquals(2, auth.loginCalls.size)
    }

    @Test
    fun `TC-AUTH-029 오류 알림은 제목과 메시지를 copy 문구로 보인다`() {
        var state by mutableStateOf(LoginUiState(error = LoginError(1, copyKey = "auth.login.error.network")))
        rule.setContent {
            TestApp(copy) { LoginScreen(state = state, onKakaoClick = {}, onGuestClick = {}, onErrorConfirm = { state = LoginUiState() }) }
        }
        rule.onNodeWithTag("login.error-dialog").assertIsDisplayed()
        rule.onNodeWithTag("login.error-dialog").assertShowsAll(copy["auth.login.error.title"], copy["auth.login.error.network"])
        rule.onNodeWithTag("login.error-dialog-confirm-button").performClick()
        rule.onNodeWithTag("login.error-dialog").assertDoesNotExist()
    }
}
