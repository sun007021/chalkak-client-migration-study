package com.stonefive.chalkak.ui.settings

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import com.stonefive.chalkak.testing.ImageProbe
import com.stonefive.chalkak.testing.SettingsFakes
import com.stonefive.chalkak.testing.SettingsHarness
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.apiHttpFailure
import com.stonefive.chalkak.testing.loadCopy
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.onboarding.SignatureImages
import kr.chalkak.core.data.settings.NotificationSettings
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.onboarding.LegalDocuments
import kr.chalkak.feature.onboarding.TermsKind
import kr.chalkak.feature.settings.NotificationPermission
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * `SettingsRoute` over the real settings holders (signature card, push switches, account actions) with fakes at the repositories:
 * shown / gone / foreground drive the holders, taps go through them, their effects become toasts and host callbacks.
 * `screen_view` is the navigation controller's in the app: the harness tracker only proves that the route showed the tab once.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1400dp")
class SettingsRouteTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private val images = ImageProbe()
    private val toasts = CopyOnWriteArrayList<String>()
    private val documents = CopyOnWriteArrayList<Pair<TermsKind, String>>()
    private var feedbackOpened = 0
    private var signatureChanges = 0
    private var systemSettings = 0
    private var accountEnded = 0
    private var logins = 0
    private var visible by mutableStateOf(true)
    private var h = SettingsHarness()

    @After
    fun tearDown() = h.close()

    private fun start(mode: HomeMode = HomeMode.Member, setup: SettingsFakes.() -> Unit = {}) {
        h.close()
        h = SettingsHarness(mode, SettingsFakes().apply(setup))
        visible = true
        rule.setContent {
            TestApp(copy) {
                if (visible) {
                    SettingsRoute(
                        holders = h.holders,
                        signatureImage = images.slot,
                        showToast = { toasts += it },
                        onOpenFeedback = { feedbackOpened++ },
                        onChangeSignature = { signatureChanges++ },
                        onShowDocument = { kind, url -> documents += kind to url },
                        onOpenSystemNotificationSettings = { systemSettings++ },
                        onAccountEnded = { accountEnded++ },
                        onLoginRequired = { logins++ },
                    )
                }
            }
        }
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun tap(t: String) {
        tag(t).performClick()
        rule.waitForIdle()
    }

    private val fakes get() = h.fakes
    private val toggles = listOf("settings.push-topic-toggle", "settings.push-moderation-toggle", "settings.push-ai-toggle")

    private fun serverError() = apiHttpFailure(500, ErrorCode.INTERNAL_ERROR)

    private fun unauthorized() = apiHttpFailure(401, ErrorCode.UNAUTHORIZED)

    private fun backgroundAndForeground() {
        rule.activityRule.scenario.moveToState(Lifecycle.State.STARTED)
        rule.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        rule.waitForIdle()
    }

    private fun hide() {
        rule.runOnIdle { visible = false }
        rule.waitForIdle()
    }

    private fun show() {
        rule.runOnIdle { visible = true }
        rule.waitForIdle()
    }

    // ---- 진입 (SET-002, 003, 004, 008, REQ-SET-003) --------------------------------------------------------------------------------

    @Test
    fun `TC-SET-002 설정이 보이면 사인과 푸시 설정을 한 번씩 독립으로 불러오고 화면 표시는 한 번 알린다`() {
        start()
        assertEquals(1, fakes.signatures.currentCalls)
        assertEquals(1, fakes.pushRepo.loadCalls.size)
        assertEquals(listOf("settings"), h.analytics.screens.toList())
        tag("settings.root").assertIsDisplayed()
        toggles.forEach { tag(it).assertIsEnabled().assertIsOn() }
        tag("settings.signature-image").assertIsDisplayed()
        assertTrue("https://cdn.example.test/thumbnail.png" in images.urls)
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-SET-002 푸시 설정 조회가 실패해도 사인 표시를 막지 않는다`() {
        start { pushRepo.loadResults += serverError() }
        tag("settings.signature-image").assertIsDisplayed()
        tag("settings.push-error").assertIsDisplayed()
    }

    @Test
    fun `TC-SET-002 사인 조회가 실패해도 푸시 토글 표시를 막지 않는다`() {
        start { signatures.currentResults += serverError() }
        toggles.forEach { tag(it).assertIsEnabled().assertIsOn() }
        tag("settings.signature-error").assertIsDisplayed()
    }

    @Test
    fun `TC-SET-003 썸네일이 null이면 원본 주소를 그린다`() {
        start { signatures.currentResults += ApiResult.Success(SignatureImages("https://cdn.example.test/only-original.png", null)) }
        assertTrue("https://cdn.example.test/only-original.png" in images.urls)
    }

    @Test
    fun `TC-SET-004 설정이 다시 보일 때마다 다시 조회하고 보이던 사인은 응답이 올 때까지 유지한다`() {
        start()
        hide()
        val gate = CompletableDeferred<Unit>().also { fakes.signatures.currentGate = it }
        show()
        assertEquals(2, fakes.signatures.currentCalls)
        assertEquals(2, fakes.pushRepo.loadCalls.size)
        tag("settings.signature-image").assertIsDisplayed()
        gate.complete(Unit)
        rule.waitForIdle()
        tag("settings.signature-image").assertIsDisplayed()
    }

    @Test
    fun `TC-SET-008 게스트는 설정 API를 부르지 않고 로그인 버튼만 보인다`() {
        start(HomeMode.Guest)
        assertEquals(0, fakes.signatures.currentCalls)
        assertEquals(0, fakes.pushRepo.loadCalls.size)
        tag("settings.login-button").assertIsDisplayed()
        tag("settings.signature-card").assertDoesNotExist()
        tag("settings.push-section").assertDoesNotExist()
        assertEquals(listOf("settings"), h.analytics.screens.toList())
    }

    @Test
    fun `TC-AUTH-033 게스트가 로그인 버튼을 누르면 게스트 표시를 지우고 로그인으로 보낸다`() {
        start(HomeMode.Guest)
        tap("settings.login-button")
        assertEquals(1, fakes.guestFlags.clearCalls)
        assertEquals(1, accountEnded)
    }

    // ---- 사인 카드 실패 (SET-006, SIGN-040) -------------------------------------------------------------------------------------

    @Test
    fun `TC-SET-006 최초 사인 조회가 실패하면 토스트와 오류 표시가 보이고 다시 불러오기를 누르면 재조회한다`() {
        start { signatures.currentResults += serverError() }
        assertEquals(listOf(copy["sign.load.error"]), toasts.toList())
        tag("settings.signature-error").assertIsDisplayed().assertTextEquals(copy["sign.load.error"])
        tag("settings.signature-image").assertDoesNotExist()

        tap("settings.signature-retry-button")
        assertEquals(2, fakes.signatures.currentCalls)
        tag("settings.signature-error").assertDoesNotExist()
        tag("settings.signature-image").assertIsDisplayed()
        assertEquals(1, toasts.size)
    }

    @Test
    fun `TC-SET-005 재조회가 실패해도 보이던 사인을 유지하고 오류 표시로 바꾸지 않는다`() {
        start()
        fakes.signatures.currentResults += serverError()
        hide()
        show()
        tag("settings.signature-image").assertIsDisplayed()
        tag("settings.signature-error").assertDoesNotExist()
    }

    @Test
    fun `TC-SIGN-040 사인 재설정이 필요하면 오류 토스트도 오류 표시도 없고 변경하기가 보인다`() {
        start { signatures.currentResults += apiHttpFailure(400, ErrorCode.SIGNATURE_REGISTRATION_REQUIRED, "register again") }
        assertTrue(toasts.isEmpty())
        tag("settings.signature-error").assertDoesNotExist()
        tag("settings.signature-image").assertDoesNotExist()
        tag("settings.signature-change-button").assertIsDisplayed()
    }

    @Test
    fun `REQ-SET-004 변경하기를 누르면 사인 변경 화면을 요청한다`() {
        start()
        tap("settings.signature-change-button")
        assertEquals(1, signatureChanges)
    }

    @Test
    fun `TC-SET-012 사인 조회가 401이면 로그인 요청만 보내고 토스트는 없다`() {
        start { signatures.currentResults += unauthorized() }
        assertEquals(1, logins)
        assertTrue(toasts.isEmpty())
    }

    // ---- 푸시 설정 (SET-016, 017, 023, 030, REQ-SET-015, 017) ------------------------------------------------------------------

    @Test
    fun `TC-SET-017 설정 로드 중에는 토글이 비활성이고 로딩이 보이다가 끝나면 활성이 된다`() {
        val gate = CompletableDeferred<Unit>()
        start { pushRepo.loadGate = gate }
        tag("settings.push-loading").assertIsDisplayed()
        toggles.forEach { tag(it).assertIsNotEnabled() }
        gate.complete(Unit)
        rule.waitForIdle()
        tag("settings.push-loading").assertDoesNotExist()
        toggles.forEach { tag(it).assertIsEnabled() }
    }

    @Test
    fun `TC-SET-016 설정 로드 실패면 토글은 비활성이고 토스트와 오류 표시가 보이며 재시도하면 다시 불러온다`() {
        start { pushRepo.loadResults += serverError() }
        assertEquals(listOf(copy["settings.push.load-error"]), toasts.toList())
        tag("settings.push-error").assertIsDisplayed().assertTextEquals(copy["settings.push.load-error"])
        toggles.forEach { tag(it).assertIsNotEnabled() }

        tap("settings.push-retry-button")
        assertEquals(2, fakes.pushRepo.loadCalls.size)
        tag("settings.push-error").assertDoesNotExist()
        toggles.forEach { tag(it).assertIsEnabled().assertIsOn() }
        assertEquals(1, toasts.size)
    }

    @Test
    fun `TC-SET-018 서버 값이 꺼진 항목은 꺼진 토글로 보인다`() {
        start { pushRepo.loadResults += ApiResult.Success(NotificationSettings(topic = true, moderation = false, aiReview = true)) }
        tag("settings.push-topic-toggle").assertIsOn()
        tag("settings.push-moderation-toggle").assertIsOff()
        tag("settings.push-ai-toggle").assertIsOn()
    }

    @Test
    fun `TC-SET-023 토글을 누르면 응답 전에 새 값으로 보이고 그 항목 하나만 저장한다`() {
        val gate = CompletableDeferred<Unit>()
        start { pushRepo.updateGates[PushSetting.Topic] = gate }
        tap("settings.push-topic-toggle")
        tag("settings.push-topic-toggle").assertIsOff()
        tag("settings.push-moderation-toggle").assertIsOn()
        assertEquals(listOf(PushSetting.Topic to false), fakes.pushRepo.updateCalls.toList())
        gate.complete(Unit)
        rule.waitForIdle()
        tag("settings.push-topic-toggle").assertIsOff()
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-SET-023 저장이 실패하면 그 토글만 되돌리고 저장 실패 토스트를 보인다`() {
        start { pushRepo.scriptUpdate(PushSetting.AiReview, serverError()) }
        tap("settings.push-ai-toggle")
        tag("settings.push-ai-toggle").assertIsOn()
        tag("settings.push-topic-toggle").assertIsOn()
        assertEquals(listOf(copy["settings.push.save-error"]), toasts.toList())
    }

    @Test
    fun `TC-SET-038 기기 알림이 꺼진 상태에서 켜려 하면 시스템 설정 열기를 한 번 요청하고 값은 그대로다`() {
        start {
            device.permission = NotificationPermission.Denied
            pushRepo.loadResults += ApiResult.Success(NotificationSettings(topic = false, moderation = true, aiReview = true))
        }
        tap("settings.push-topic-toggle")
        assertEquals(1, systemSettings)
        assertTrue(fakes.pushRepo.updateCalls.isEmpty())
        tag("settings.push-topic-toggle").assertIsOff()
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `REQ-SET-016 기기 알림이 꺼져 있어도 끄는 것은 정상 저장이다`() {
        start { device.permission = NotificationPermission.Denied }
        tap("settings.push-topic-toggle")
        assertEquals(0, systemSettings)
        assertEquals(listOf(PushSetting.Topic to false), fakes.pushRepo.updateCalls.toList())
    }

    @Test
    fun `REQ-SET-017 앱이 포그라운드로 돌아오면 기기 알림 권한을 다시 확인하고 토글 값은 그대로다`() {
        start()
        val before = fakes.device.permissionChecks
        backgroundAndForeground()
        assertTrue(fakes.device.permissionChecks > before, "the device permission must be checked again")
        toggles.forEach { tag(it).assertIsOn() }
        assertEquals(1, fakes.pushRepo.loadCalls.size)
    }

    @Test
    fun `TC-SET-030 저장 중에 화면을 떠나면 그 항목은 이전 값으로 돌아가고 토스트는 없다`() {
        val gate = CompletableDeferred<Unit>()
        start { pushRepo.updateGates[PushSetting.Topic] = gate }
        tap("settings.push-topic-toggle")
        tag("settings.push-topic-toggle").assertIsOff()
        hide()
        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(true, h.holders.push.state.value.values[PushSetting.Topic])
        assertTrue(h.holders.push.state.value.saving.isEmpty())
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-SET-034 푸시 설정 조회가 401이면 로그인 요청만 보내고 토스트는 없다`() {
        start { pushRepo.loadResults += unauthorized() }
        assertEquals(1, logins)
        assertTrue(toasts.isEmpty())
    }

    // ---- 행 (FDBK-001, 035, SET-047) ------------------------------------------------------------------------------------------

    @Test
    fun `TC-FDBK-001 회원이 피드백 보내기를 누르면 피드백 화면을 요청한다`() {
        start()
        tap("settings.feedback-row")
        assertEquals(1, feedbackOpened)
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-FDBK-035 게스트의 피드백 진입은 토스트만 보이고 화면 요청이 없다`() {
        start(HomeMode.Guest)
        rule.runOnIdle { h.holders.settings.onFeedbackClicked() }
        rule.waitForIdle()
        assertEquals(listOf(copy["nav.guest.feedback"]), toasts.toList())
        assertEquals(0, feedbackOpened)
    }

    @Test
    fun `TC-SET-047 이용약관과 개인정보처리방침 행은 해당 문서 주소로 문서 열기를 요청한다`() {
        start()
        tap("settings.terms-row")
        tap("settings.privacy-row")
        assertEquals(
            listOf(TermsKind.Service to LegalDocuments.url(TermsKind.Service), TermsKind.Privacy to LegalDocuments.url(TermsKind.Privacy)),
            documents.toList(),
        )
    }

    // ---- 로그아웃 / 회원탈퇴 (SET-041, 044, 045) -----------------------------------------------------------------------------------

    @Test
    fun `TC-SET-041 로그아웃 행은 확인 다이얼로그를 열고 취소하면 아무 일도 없다`() {
        start()
        tap("settings.logout-row")
        tag("settings.logout-dialog").assertIsDisplayed()
        tap("settings.logout-cancel-button")
        tag("settings.logout-dialog").assertDoesNotExist()
        assertEquals(0, fakes.auth.logoutCalls)
        assertEquals(0, accountEnded)
    }

    @Test
    fun `TC-SET-041 로그아웃을 확인하면 로그아웃을 한 번 하고 로그인으로 보낸다`() {
        start()
        tap("settings.logout-row")
        tap("settings.logout-confirm-button")
        tag("settings.logout-dialog").assertDoesNotExist()
        assertEquals(1, fakes.auth.logoutCalls)
        assertEquals(1, accountEnded)
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `TC-SET-044 회원탈퇴 행은 확인 다이얼로그를 열고 확인하면 탈퇴 후 로그인으로 보낸다(TC-AUTH-043)`() {
        start()
        tap("settings.withdraw-row")
        tag("settings.withdraw-dialog").assertIsDisplayed()
        tag("settings.logout-dialog").assertDoesNotExist()
        tap("settings.withdraw-confirm-button")
        assertEquals(1, fakes.auth.withdrawCalls)
        assertEquals(1, accountEnded)
    }

    @Test
    fun `TC-SET-045 회원탈퇴를 취소하면 요청이 없다`() {
        start()
        tap("settings.withdraw-row")
        tap("settings.withdraw-cancel-button")
        assertEquals(0, fakes.auth.withdrawCalls)
        assertEquals(0, accountEnded)
    }

    @Test
    fun `TC-SET-046 회원탈퇴가 실패하면 설정에 남고 실패 토스트를 보인다`() {
        start { auth.withdrawResults += serverError() }
        tap("settings.withdraw-row")
        tap("settings.withdraw-confirm-button")
        assertEquals(listOf(copy["auth.withdraw.error"]), toasts.toList())
        assertEquals(0, accountEnded)
        tag("settings.withdraw-dialog").assertDoesNotExist()
        tag("settings.root").assertIsDisplayed()
    }

    @Test
    fun `TC-AUTH-045 회원탈퇴가 401이면 로그인으로 보내고 실패 토스트는 없다`() {
        start { auth.withdrawResults += unauthorized() }
        tap("settings.withdraw-row")
        tap("settings.withdraw-confirm-button")
        assertEquals(1, accountEnded)
        assertTrue(toasts.isEmpty())
    }

    @Test
    fun `REQ-SET-007 탈퇴 요청이 끝나기 전에는 로그인으로 보내지 않는다`() {
        val gate = CompletableDeferred<Unit>()
        start { auth.withdrawGate = gate }
        tap("settings.withdraw-row")
        tap("settings.withdraw-confirm-button")
        assertEquals(1, fakes.auth.withdrawCalls)
        assertEquals(0, accountEnded)
        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(1, accountEnded)
    }

    @Test
    fun `TC-AUTH-049 탈퇴 실패 응답이 화면을 떠난 뒤 도착하면 토스트를 보이지 않는다`() {
        val gate = CompletableDeferred<Unit>()
        start {
            auth.withdrawGate = gate
            auth.withdrawResults += serverError()
        }
        tap("settings.withdraw-row")
        tap("settings.withdraw-confirm-button")
        hide()
        gate.complete(Unit)
        rule.waitForIdle()
        assertTrue(toasts.isEmpty())
        assertEquals(0, accountEnded)
    }

    @Test
    fun `TC-SET-051 사인과 푸시 조회가 모두 실패해도 계정 피드백 약관 버전 행은 정상이다`() {
        start {
            signatures.currentResults += serverError()
            pushRepo.loadResults += serverError()
        }
        tag("settings.signature-error").assertIsDisplayed()
        tag("settings.push-error").assertIsDisplayed()
        tag("settings.version-value").assertIsDisplayed()
        tap("settings.feedback-row")
        tap("settings.terms-row")
        tap("settings.logout-row")
        tag("settings.logout-dialog").assertIsDisplayed()
        assertEquals(1, feedbackOpened)
        assertEquals(1, documents.size)
    }
}
