package com.stonefive.chalkak.ui.signature

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.FakeSignatures
import com.stonefive.chalkak.testing.FakeUploader
import com.stonefive.chalkak.testing.HolderScope
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.ui.components.ToastLayer
import com.stonefive.chalkak.ui.components.ToastUi
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kr.chalkak.feature.onboarding.CanvasSize
import kr.chalkak.feature.onboarding.FlowError
import kr.chalkak.feature.onboarding.SignatureChangeStateHolder
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignaturePngEncoder
import kr.chalkak.feature.onboarding.SignaturePoint
import kr.chalkak.feature.onboarding.SignatureStroke
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class SignaturePreviewScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val holderScope = HolderScope()
    private val png: ByteArray = SignaturePngEncoder().encode(
        listOf(SignatureStroke(listOf(SignaturePoint(10f, 10f), SignaturePoint(200f, 90f)))),
        CanvasSize(400f, 200f),
    )

    @After
    fun tearDown() = holderScope.close()

    private fun show(mode: SignatureMode, busy: Boolean = false, error: FlowError? = null) = rule.setContent {
        TestApp(copy) {
            SignaturePreviewScreen(
                mode = mode, png = png, busy = busy, error = error,
                onErrorConfirm = {}, onRedraw = {}, onConfirm = {},
            )
        }
    }

    @Test
    fun `TC-ONB-048 가입 모드 미리보기는 제목 이미지 다시 그리기 시작하기를 보이고 변경 안내는 없다`() {
        show(SignatureMode.Signup)
        rule.onNodeWithTag("signature-preview.root").assertIsDisplayed()
        rule.onNodeWithTag("signature-preview.title").assertTextEquals(copy["onb.sign.preview.title"])
        rule.onNodeWithTag("signature-preview.image").assertIsDisplayed()
        rule.onNodeWithTag("signature-preview.redraw-button").assertTextEquals(copy["onb.sign.preview.redraw"])
        rule.onNodeWithTag("signature-preview.confirm-button").assertIsEnabled().assertTextEquals(copy["onb.sign.preview.start"])
        rule.onNodeWithTag("signature-preview.change-notice").assertDoesNotExist()
        rule.onNodeWithTag("signature-preview.loading").assertDoesNotExist()
        rule.onNodeWithTag("signature-preview.error-dialog").assertDoesNotExist()
    }

    @Test
    fun `TC-SIGN-017 변경 모드 미리보기는 사인 변경하기 버튼과 안내 문구를 보인다`() {
        show(SignatureMode.Change)
        rule.onNodeWithTag("signature-preview.title").assertTextEquals(copy["onb.sign.preview.title"])
        rule.onNodeWithTag("signature-preview.image").assertIsDisplayed()
        rule.onNodeWithTag("signature-preview.redraw-button").assertTextEquals(copy["onb.sign.preview.redraw"])
        rule.onNodeWithTag("signature-preview.confirm-button").assertTextEquals(copy["sign.change.confirm"])
        rule.onNodeWithTag("signature-preview.change-notice").assertTextEquals(copy["sign.change.notice"])
    }

    @Test
    fun `TC-ONB-048 요청 중에는 확인 버튼이 비활성이고 진행 표시가 있다`() {
        show(SignatureMode.Signup, busy = true)
        rule.onNodeWithTag("signature-preview.confirm-button").assertIsNotEnabled()
        rule.onNodeWithTag("signature-preview.loading").assertIsDisplayed()
    }

    @Test
    fun `TC-ONB-048 오류가 있으면 오류 알림과 확인 버튼이 있다`() {
        show(SignatureMode.Signup, error = FlowError(1, copyKey = "onb.signup.error.generic"))
        rule.onNodeWithTag("signature-preview.error-dialog").assertIsDisplayed()
        rule.onNodeWithTag("signature-preview.error-dialog-confirm-button").assertIsDisplayed()
    }

    @Test
    fun `TC-SIGN-025 변경 성공 시 토스트 문구는 sign change done 이고 완료 콜백이 한 번 호출된다`() {
        val signatures = FakeSignatures()
        val holder = SignatureChangeStateHolder(holderScope.scope, signatures, FakeUploader())
        val dones = mutableListOf<String>()
        var toast by mutableStateOf<ToastUi?>(null)
        rule.setContent {
            TestApp(copy) {
                ChangeSignaturePreviewRoute(
                    holder = holder, png = png,
                    onDone = { key -> dones += key; toast = ToastUi(1, copy[key]) },
                    onBackToLogin = {}, onBackToDrawing = {}, onRedraw = {},
                )
                ToastLayer(toast = toast, onExpired = {})
            }
        }
        rule.onNodeWithTag("signature-preview.confirm-button").performClick()
        rule.waitForIdle()

        assertEquals(listOf("sign.change.done"), dones)
        assertEquals(1, signatures.confirms)
        rule.onNodeWithTag("toast.message").assertTextEquals(copy["sign.change.done"])
    }
}
