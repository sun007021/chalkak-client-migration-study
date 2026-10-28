package com.stonefive.chalkak.ui.main

import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.TEST_APP_VERSION
import com.stonefive.chalkak.testing.LegalWebMode
import com.stonefive.chalkak.testing.apiHttpFailure
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.hasNode
import com.stonefive.chalkak.testing.loadCopy
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.data.settings.NotificationSettings
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.navigation.TermsDocumentKind
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
 * [MainHost] with the settings tab, the feedback screen and the change-signature flow (A9): the real settings / feedback / signature
 * holders over fakes replace the placeholders (`MainDependencies.newSettingsHolders` etc. are set by `MainRig`). Navigation is the real
 * controller's; `screen_view` is its alone (the rig's holders send none). Toasts go through the real `ToastLayer`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1400dp")
class MainHostSettingsTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private var rig = MainRig()

    @After
    fun tearDown() = rig.close()

    private fun launch(mode: AccessMode = AccessMode.Member, setup: MainRig.() -> Unit = {}) {
        rig.close()
        rig = MainRig(mode).apply(setup)
        rig.launch(rule, copy)
        rule.awaitTag(if (mode == AccessMode.Member) "home.hero-photo" else "home.hero-empty")
    }

    private fun node(tag: String) = rule.onNodeWithTag(tag)

    private fun tap(tag: String) {
        node(tag).performClick()
        rule.waitForIdle()
    }

    private fun openSettings() {
        tap("bottom-bar.tab-settings")
        rule.awaitTag("settings.root")
    }

    private fun systemBack() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }

    private fun assertToast(text: String) {
        rule.awaitTag("toast.message")
        node("toast.message").assertTextEquals(text)
    }

    private val fakes get() = rig.settings

    private fun draw() {
        node("signature.canvas").performTouchInput { swipe(Offset(10f, 10f), Offset(width - 10f, height - 10f), 200) }
        rule.waitForIdle()
    }

    /** Settings -> change drawing -> preview. */
    private fun openChangePreview() {
        openSettings()
        tap("settings.signature-change-button")
        rule.awaitTag("signature.root")
        draw()
        tap("signature.submit-button")
        rule.awaitTag("signature-preview.root")
    }

    // ---- 탭 (TC-SET-001, 052, 004) --------------------------------------------------------------------------------------------

    @Test
    fun `TC-SET-001 설정 탭은 실제 설정 화면을 보여 주고 하단바에서 설정이 선택되어 있다`() {
        launch()
        openSettings()
        node("settings.signature-card").assertIsDisplayed()
        node("settings.push-section").assertIsDisplayed()
        node("settings.version-value").assertTextEquals(TEST_APP_VERSION)
        node("bottom-bar.root").assertIsDisplayed()
        node("bottom-bar.tab-settings").assertIsSelected()
        assertFalse(Tab.Settings in rig.otherTabsComposed, "the placeholder tab must not be composed any more")
        assertEquals(1, fakes.signatures.currentCalls)
        assertEquals(1, fakes.pushRepo.loadCalls.size)
    }

    @Test
    fun `TC-SET-052 설정의 screen_view는 컨트롤러가 한 번만 보낸다`() {
        launch()
        openSettings()
        assertEquals(listOf("home", "settings"), rig.analytics.screens.toList())
        assertTrue(rig.postAnalytics.screens.none { it == "settings" })
    }

    @Test
    fun `TC-SET-004 다른 탭에 다녀오면 사인과 푸시 설정을 다시 조회한다`() {
        launch()
        openSettings()
        tap("bottom-bar.tab-home")
        node("settings.root").assertDoesNotExist()
        tap("bottom-bar.tab-settings")
        rule.awaitTag("settings.root")
        assertEquals(2, fakes.signatures.currentCalls)
        assertEquals(2, fakes.pushRepo.loadCalls.size)
        node("settings.signature-image").assertIsDisplayed()
        assertEquals(listOf("home", "settings", "home", "settings"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-NAV-021 게스트의 설정 탭은 로그인 버튼만 보이고 설정 API 호출이 없다`() {
        launch(AccessMode.Guest)
        openSettings()
        node("settings.login-button").assertIsDisplayed().assertTextEquals(copy["settings.guest.login"])
        listOf(
            "settings.signature-card", "settings.push-section", "settings.logout-row", "settings.withdraw-row",
            "settings.feedback-row", "settings.privacy-row", "settings.terms-row", "settings.version-row",
        ).forEach { node(it).assertDoesNotExist() }
        assertEquals(0, fakes.signatures.currentCalls)
        assertEquals(0, fakes.pushRepo.loadCalls.size)
    }

    @Test
    fun `TC-AUTH-033 게스트가 로그인을 누르면 게스트 표시를 지우고 로그인 화면으로 간다`() {
        launch(AccessMode.Guest)
        openSettings()
        tap("settings.login-button")
        assertEquals(1, fakes.guestFlags.clearCalls)
        assertEquals(Route.Login, rig.nav.top)
        assertEquals(listOf("home", "settings", "login"), rig.analytics.screens.toList())
        node("settings.root").assertDoesNotExist()
    }

    // ---- 푸시 설정 연결 (TC-SET-038) ------------------------------------------------------------------------------------------------

    @Test
    fun `TC-SET-038 기기 알림이 꺼진 상태에서 토글을 켜면 시스템 알림 설정을 한 번 열고 저장은 없다`() {
        launch {
            settings.device.permission = NotificationPermission.Denied
            settings.pushRepo.loadResults += ApiResult.Success(NotificationSettings(topic = false, moderation = true, aiReview = true))
        }
        openSettings()
        tap("settings.push-topic-toggle")
        assertEquals(1, rig.settings.systemSettingsOpened.get())
        assertTrue(fakes.pushRepo.updateCalls.isEmpty())
    }

    @Test
    fun `TC-SET-023 토글을 누르면 그 항목 하나만 저장 요청한다`() {
        launch()
        openSettings()
        tap("settings.push-ai-toggle")
        assertEquals(1, fakes.pushRepo.updateCalls.size)
        assertEquals(0, rig.settings.systemSettingsOpened.get())
    }

    // ---- 피드백 (TC-FDBK-001, 017, 020, 029, 030, TC-SET-050) ----------------------------------------------------------------------

    @Test
    fun `TC-SET-050 피드백 보내기를 누르면 피드백 화면이 열리고 screen_view가 한 번 전송되며 하단바는 사라진다`() {
        launch()
        openSettings()
        tap("settings.feedback-row")
        node("feedback.root").assertIsDisplayed()
        assertEquals(Route.Feedback, rig.nav.top)
        node("bottom-bar.root").assertDoesNotExist()
        node("settings.root").assertDoesNotExist()
        assertEquals(listOf("home", "settings", "feedback"), rig.analytics.screens.toList())
        assertEquals(1, fakes.feedbackHolders.size)
    }

    @Test
    fun `TC-NAV-047 뒤로가기와 닫기 버튼은 설정으로 돌아온다`() {
        launch()
        openSettings()
        tap("settings.feedback-row")
        systemBack()
        node("feedback.root").assertDoesNotExist()
        node("settings.root").assertIsDisplayed()
        node("bottom-bar.tab-settings").assertIsSelected()

        tap("settings.feedback-row")
        tap("feedback.close-button")
        node("feedback.root").assertDoesNotExist()
        node("settings.root").assertIsDisplayed()
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
        assertEquals(listOf("home", "settings", "feedback", "settings", "feedback", "settings"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-FDBK-017 전송에 성공하면 토스트를 보이고 설정으로 돌아오며 다시 열면 입력이 비어 있다 (TC-FDBK-020)`() {
        launch()
        openSettings()
        tap("settings.feedback-row")
        node("feedback.input").performTextInput("  앱이 좋아요  ")
        rule.waitForIdle()
        tap("feedback.submit-button")

        assertEquals(listOf("앱이 좋아요"), fakes.feedbackRepo.sent.toList())
        assertToast(copy["fdbk.success"])
        node("feedback.root").assertDoesNotExist()
        node("settings.root").assertIsDisplayed()
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)

        tap("settings.feedback-row")
        node("feedback.counter").assertTextEquals("0/1000")
        node("feedback.submit-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-FDBK-018 전송 중에는 보내는 중이고 연타해도 요청은 한 번이다`() {
        val gate = CompletableDeferred<Unit>()
        launch { settings.feedbackRepo.gate = gate }
        openSettings()
        tap("settings.feedback-row")
        node("feedback.input").performTextInput("내용")
        tap("feedback.submit-button")
        node("feedback.submit-button").assertTextEquals(copy["fdbk.sending"]).assertIsNotEnabled()
        tap("feedback.submit-button")
        tap("feedback.submit-button")
        assertEquals(1, fakes.feedbackRepo.sent.size)
        node("feedback.root").assertIsDisplayed()
        gate.complete(Unit)
        rule.waitForIdle()
        node("settings.root").assertIsDisplayed()
    }

    @Test
    fun `TC-FDBK-029 전송 중 뒤로 가면 설정에 있고 응답이 늦게 와도 토스트도 화면 전환도 없다`() {
        val gate = CompletableDeferred<Unit>()
        launch { settings.feedbackRepo.gate = gate }
        openSettings()
        tap("settings.feedback-row")
        node("feedback.input").performTextInput("내용")
        tap("feedback.submit-button")
        systemBack()
        node("settings.root").assertIsDisplayed()
        gate.complete(Unit)
        rule.waitForIdle()
        assertTrue(rig.shownToasts.none { it == copy["fdbk.success"] })
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
        node("settings.root").assertIsDisplayed()
    }

    @Test
    fun `TC-FDBK-024 전송 실패는 피드백 화면에 머물며 입력을 유지한다`() {
        launch { settings.feedbackRepo.results += apiHttpFailure(500, ErrorCode.INTERNAL_ERROR) }
        openSettings()
        tap("settings.feedback-row")
        node("feedback.input").performTextInput("내용")
        tap("feedback.submit-button")
        node("feedback.error-message").assertTextEquals(copy["fdbk.error.generic"])
        node("feedback.counter").assertTextEquals("2/1000")
        assertEquals(Route.Feedback, rig.nav.top)
        assertTrue(rig.shownToasts.isEmpty())
    }

    // ---- 약관 문서 (TC-SET-047, 048, TC-ANL-011) -------------------------------------------------------------------------------

    @Test
    fun `TC-SET-047 이용약관 행은 문서 시트를 열고 screen_view는 컨트롤러가 한 번 보내며 닫아도 설정을 다시 보내지 않는다`() {
        launch()
        openSettings()
        tap("settings.terms-row")
        rule.awaitTag("legal-doc.sheet")
        node("legal-doc.title").assertTextEquals(copy["onb.terms.doc.title.service"])
        assertEquals(Route.TermsDocument(TermsDocumentKind.TermsOfService), rig.nav.top)
        rule.awaitTag("test.legal-web")
        assertEquals(listOf(LegalDocuments.url(TermsKind.Service)), fakes.legalWebUrls.toList())
        assertEquals(listOf("home", "settings", "terms_of_service"), rig.analytics.screens.toList())

        tap("legal-doc.close-button")
        node("legal-doc.sheet").assertDoesNotExist()
        node("settings.root").assertIsDisplayed()
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
        assertEquals(listOf("home", "settings", "terms_of_service"), rig.analytics.screens.toList())
        assertEquals(1, fakes.signatures.currentCalls, "closing the sheet does not leave the settings screen")
        assertEquals(1, fakes.pushRepo.loadCalls.size)
    }

    @Test
    fun `TC-SET-047 개인정보처리방침 행은 방침 문서를 열고 시스템 뒤로가기로 닫는다`() {
        launch()
        openSettings()
        tap("settings.privacy-row")
        rule.awaitTag("legal-doc.sheet")
        node("legal-doc.title").assertTextEquals(copy["onb.terms.doc.title.privacy"])
        assertEquals(Route.TermsDocument(TermsDocumentKind.PrivacyPolicy), rig.nav.top)
        assertEquals(listOf("home", "settings", "privacy_policy"), rig.analytics.screens.toList())

        systemBack()
        node("legal-doc.sheet").assertDoesNotExist()
        node("settings.root").assertIsDisplayed()
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
        assertEquals(1, rig.analytics.screens.count { it == "privacy_policy" })
    }

    @Test
    fun `TC-SET-048 문서를 불러오지 못하면 오류와 다시 시도가 보이고 다시 시도하면 문서를 새로 불러온다`() {
        launch { settings.legalWebMode = LegalWebMode.Failed }
        openSettings()
        tap("settings.terms-row")
        rule.awaitTag("legal-doc.error-state")
        node("legal-doc.error-state").assertTextEquals(copy["onb.terms.doc.error"])
        node("legal-doc.retry-button").assertTextEquals(copy["onb.terms.doc.retry"])
        assertEquals(1, fakes.legalWebUrls.size)

        fakes.legalWebMode = LegalWebMode.Loaded
        tap("legal-doc.retry-button")
        rule.waitUntil(2_000) { fakes.legalWebUrls.size == 2 }
        node("legal-doc.error-state").assertDoesNotExist()
        node("legal-doc.loading").assertDoesNotExist()
        assertEquals(1, rig.analytics.screens.count { it == "terms_of_service" })
    }

    @Test
    fun `TC-SET-047 문서가 불러오는 중에는 로딩이 보인다`() {
        launch { settings.legalWebMode = LegalWebMode.Pending }
        openSettings()
        tap("settings.terms-row")
        rule.awaitTag("legal-doc.loading")
        node("legal-doc.sheet").assertIsDisplayed()
    }

    // ---- 사인 변경 (TC-SIGN-017, 018, 025, 029, 033, 036, 037, 042, 043, REQ-NAV-033) -----------------------------------------

    @Test
    fun `TC-SIGN-043 변경하기를 누르면 변경 모드 그리기 화면이 열리고 screen_view change_signature를 한 번 보낸다`() {
        launch()
        openSettings()
        tap("settings.signature-change-button")
        node("signature.root").assertIsDisplayed()
        assertEquals(Route.ChangeSignature, rig.nav.top)
        node("bottom-bar.root").assertDoesNotExist()
        node("settings.root").assertDoesNotExist()
        node("signature.canvas-hint").assertIsDisplayed()
        node("signature.submit-button").assertIsNotEnabled()
        assertEquals(listOf("home", "settings", "change_signature"), rig.analytics.screens.toList())
        assertEquals(1, fakes.pads.size)
    }

    @Test
    fun `TC-SIGN-042 그리다 뒤로 가면 설정으로 돌아오고 기존 사인 그대로이며 변경 요청은 없다`() {
        launch()
        openSettings()
        tap("settings.signature-change-button")
        draw()
        node("signature.canvas-hint").assertDoesNotExist()
        systemBack()
        node("signature.root").assertDoesNotExist()
        node("settings.root").assertIsDisplayed()
        node("settings.signature-image").assertIsDisplayed()
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
        assertTrue(fakes.signatures.uploadCalls.isEmpty())
        assertTrue(fakes.signatures.confirmCalls.isEmpty())
        assertTrue(fakes.signatureUploader.calls.isEmpty())

        tap("settings.signature-change-button")
        node("signature.canvas-hint").assertIsDisplayed() // a new visit starts with a blank pad
    }

    @Test
    fun `TC-SIGN-017 사인을 확정하면 변경 모드 미리보기가 쌓이고 screen_view change_signature_preview를 한 번 보낸다`() {
        launch()
        openChangePreview()
        assertEquals(Route.ChangeSignaturePreview, rig.nav.top)
        node("signature-preview.confirm-button").assertTextEquals(copy["sign.change.confirm"])
        node("signature-preview.change-notice").assertTextEquals(copy["sign.change.notice"])
        assertEquals(listOf("home", "settings", "change_signature", "change_signature_preview"), rig.analytics.screens.toList())
        assertTrue(fakes.signatures.uploadCalls.isEmpty())
    }

    @Test
    fun `TC-SIGN-018 다시 그리기는 서버 호출 없이 빈 그리기 화면으로 돌아간다`() {
        launch()
        openChangePreview()
        tap("signature-preview.redraw-button")
        node("signature-preview.root").assertDoesNotExist()
        node("signature.root").assertIsDisplayed()
        node("signature.canvas-hint").assertIsDisplayed()
        assertEquals(Route.ChangeSignature, rig.nav.top)
        assertTrue(fakes.signatures.uploadCalls.isEmpty())
        assertEquals(listOf("home", "settings", "change_signature", "change_signature_preview", "change_signature"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-SIGN-025 변경에 성공하면 설정으로 돌아와 토스트를 보이고 사인을 GET으로 다시 조회한다`() {
        launch {
            settings.signatures.currentResults += ApiResult.Success(kr.chalkak.core.data.onboarding.SignatureImages("https://cdn.example.test/o1.png", "https://cdn.example.test/t1.png"))
            settings.signatures.currentResults += ApiResult.Success(kr.chalkak.core.data.onboarding.SignatureImages("https://cdn.example.test/o2.png", "https://cdn.example.test/t2.png"))
            settings.signatures.currentResults += ApiResult.Success(kr.chalkak.core.data.onboarding.SignatureImages("https://cdn.example.test/o2.png", "https://cdn.example.test/t2.png"))
        }
        openChangePreview()
        tap("signature-preview.confirm-button")

        // uploads -> presigned PUT -> confirm, once each, in this order.
        assertEquals(1, fakes.signatures.uploadCalls.size)
        assertEquals(1, fakes.signatureUploader.calls.size)
        assertEquals(1, fakes.signatures.confirmCalls.size)
        assertToast(copy["sign.change.done"])
        assertEquals("사인 반영까지 시간이 좀 걸릴 수 있어요!", copy["sign.change.done"])
        node("signature-preview.root").assertDoesNotExist()
        node("signature.root").assertDoesNotExist()
        node("settings.root").assertIsDisplayed()
        node("bottom-bar.tab-settings").assertIsSelected()
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
        assertTrue(fakes.signatures.currentCalls >= 2, "the card re-reads GET /users/me/signature after a change")
        assertEquals(1, rig.shownToasts.count { it == copy["sign.change.done"] })
    }

    @Test
    fun `REQ-NAV-033 변경 성공 뒤 뒤로 가면 변경 화면이 아니라 홈으로 간다`() {
        launch()
        openChangePreview()
        tap("signature-preview.confirm-button")
        rule.awaitTag("settings.root")
        assertEquals(listOf(Route.TabRoot(Tab.Home), Route.TabRoot(Tab.Settings)), rig.nav.stack.filterIsInstance<Route.TabRoot>())
        assertTrue(rig.nav.stack.none { it == Route.ChangeSignature || it == Route.ChangeSignaturePreview })
        systemBack()
        node("signature.root").assertDoesNotExist()
        node("signature-preview.root").assertDoesNotExist()
        assertEquals(Route.TabRoot(Tab.Home), rig.nav.top)
    }

    @Test
    fun `TC-SIGN-036 변경하기를 연타하면 uploads 한 번 PUT 한 번 확정 한 번이다`() {
        val gate = CompletableDeferred<Unit>()
        launch { settings.signatures.confirmGate = gate }
        openChangePreview()
        tap("signature-preview.confirm-button")
        node("signature-preview.loading").assertIsDisplayed()
        node("signature-preview.confirm-button").assertIsNotEnabled()
        node("signature-preview.redraw-button").assertIsNotEnabled()
        tap("signature-preview.confirm-button")
        tap("signature-preview.confirm-button")
        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(1, fakes.signatures.uploadCalls.size)
        assertEquals(1, fakes.signatureUploader.calls.size)
        assertEquals(1, fakes.signatures.confirmCalls.size)
    }

    @Test
    fun `TC-SIGN-037 변경 중 뒤로 가면 그리기 화면에 있고 오류도 토스트도 없으며 확정 호출이 없다`() {
        val gate = CompletableDeferred<Unit>()
        launch { settings.signatures.uploadGate = gate }
        openChangePreview()
        tap("signature-preview.confirm-button")
        node("signature-preview.loading").assertIsDisplayed()
        systemBack()
        node("signature-preview.root").assertDoesNotExist()
        node("signature.root").assertIsDisplayed()
        assertEquals(Route.ChangeSignature, rig.nav.top)

        gate.complete(Unit)
        rule.waitForIdle()
        assertTrue(fakes.signatures.confirmCalls.isEmpty())
        assertTrue(rig.shownToasts.isEmpty())
        node("signature-preview.error-dialog").assertDoesNotExist()
        assertEquals(Route.ChangeSignature, rig.nav.top)
    }

    @Test
    fun `TC-SIGN-029 사용할 수 없는 사인이면 그리기 화면으로 돌아간다`() {
        launch {
            settings.signatures.confirmResults += apiHttpFailure(400, ErrorCode.BUSINESS_ERROR, "사용할 수 없는 사인 이미지입니다.")
        }
        openChangePreview()
        tap("signature-preview.confirm-button")
        rule.awaitTag("signature.root")
        node("signature-preview.root").assertDoesNotExist()
        assertEquals(Route.ChangeSignature, rig.nav.top)
        assertTrue(rig.shownToasts.none { it == copy["sign.change.done"] })
    }

    @Test
    fun `TC-SIGN-034 서버 오류면 미리보기에 머물며 오류 알림을 보인다`() {
        launch { settings.signatures.confirmResults += apiHttpFailure(500, ErrorCode.INTERNAL_ERROR) }
        openChangePreview()
        tap("signature-preview.confirm-button")
        node("signature-preview.error-dialog").assertIsDisplayed()
        assertEquals(Route.ChangeSignaturePreview, rig.nav.top)
        tap("signature-preview.error-dialog-confirm-button")
        node("signature-preview.error-dialog").assertDoesNotExist()
        node("signature-preview.confirm-button").assertIsEnabled()
    }

    @Test
    fun `TC-SIGN-033 변경 확정이 401이면 로그인 화면으로 가고 만료 토스트를 보인다`() {
        launch { settings.signatures.confirmResults += apiHttpFailure(401, ErrorCode.UNAUTHORIZED) }
        openChangePreview()
        tap("signature-preview.confirm-button")
        assertEquals(Route.Login, rig.nav.top)
        node("signature-preview.root").assertDoesNotExist()
        assertEquals(1, rig.shownToasts.count { it == copy["sign.error.expired"] })
    }

    // ---- 로그아웃 / 회원탈퇴 (TC-SET-041, 044, 045, 046) ------------------------------------------------------------------------

    @Test
    fun `TC-SET-041 로그아웃을 확인하면 로그아웃 후 로그인 화면으로 가고 취소하면 설정에 남는다`() {
        launch()
        openSettings()
        tap("settings.logout-row")
        node("settings.logout-dialog").assertIsDisplayed()
        tap("settings.logout-cancel-button")
        node("settings.logout-dialog").assertDoesNotExist()
        assertEquals(0, fakes.auth.logoutCalls)
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)

        tap("settings.logout-row")
        tap("settings.logout-confirm-button")
        assertEquals(1, fakes.auth.logoutCalls)
        assertEquals(Route.Login, rig.nav.top)
        node("settings.root").assertDoesNotExist()
        assertEquals(listOf("home", "settings", "login"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-SET-046 회원탈퇴에 성공하면 로그인 화면으로 간다`() {
        launch()
        openSettings()
        tap("settings.withdraw-row")
        node("settings.withdraw-dialog").assertIsDisplayed()
        tap("settings.withdraw-confirm-button")
        assertEquals(1, fakes.auth.withdrawCalls)
        assertEquals(Route.Login, rig.nav.top)
        assertEquals(listOf("home", "settings", "login"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-SET-046 회원탈퇴가 실패하면 설정에 남고 실패 토스트가 뜬다`() {
        launch { settings.auth.withdrawResults += apiHttpFailure(500, ErrorCode.INTERNAL_ERROR) }
        openSettings()
        tap("settings.withdraw-row")
        tap("settings.withdraw-confirm-button")
        assertToast(copy["auth.withdraw.error"])
        assertEquals("요청을 처리하지 못했어요. 다시 시도해 주세요.", copy["auth.withdraw.error"])
        node("settings.root").assertIsDisplayed()
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
    }

    @Test
    fun `TC-SET-045 회원탈퇴 다이얼로그를 취소하면 요청이 없다`() {
        launch()
        openSettings()
        tap("settings.withdraw-row")
        tap("settings.withdraw-cancel-button")
        assertEquals(0, fakes.auth.withdrawCalls)
        assertEquals(Route.TabRoot(Tab.Settings), rig.nav.top)
    }

    @Test
    fun `이미 로그인 화면이면 로그아웃 효과가 다시 로그인 화면을 만들지 않는다`() {
        val gate = CompletableDeferred<Unit>()
        launch { settings.auth.withdrawGate = gate }
        openSettings()
        tap("settings.withdraw-row")
        tap("settings.withdraw-confirm-button")
        // The network layer's AuthEvent.GoToLogin ends the session first (ChalkakRoot turns it into onSessionEnded).
        rule.runOnUiThread { rig.nav.onSessionEnded() }
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(Route.Login, rig.nav.top)
        assertEquals(1, rig.analytics.screens.count { it == "login" })
        assertFalse(rule.hasNode("settings.root"))
        assertEquals(0, rule.onAllNodesWithTag("settings.logout-dialog").fetchSemanticsNodes().size)
        rule.onAllNodesWithTag("toast.message").assertCountEquals(0)
    }
}
