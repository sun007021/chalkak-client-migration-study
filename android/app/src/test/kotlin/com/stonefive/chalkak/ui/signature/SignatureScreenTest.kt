package com.stonefive.chalkak.ui.signature

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.loadCopy
import kr.chalkak.feature.onboarding.SignatureMode
import kr.chalkak.feature.onboarding.SignaturePadUiState
import kr.chalkak.feature.onboarding.SignaturePoint
import kr.chalkak.feature.onboarding.SignatureStroke
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class SignatureScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val calls = mutableListOf<String>()

    private fun show(state: SignaturePadUiState, mode: SignatureMode = SignatureMode.Signup) = rule.setContent {
        TestApp(copy) {
            SignatureScreen(
                mode = mode, state = state,
                onUndo = { calls += "undo" }, onClear = { calls += "clear" }, onConfirm = { calls += "confirm" }, onBack = { calls += "back" },
                onBeginStroke = { _, _ -> }, onExtendStroke = { _, _ -> }, onEndStroke = {},
            )
        }
    }

    private val oneStroke = SignaturePadUiState(strokes = listOf(SignatureStroke(listOf(SignaturePoint(10f, 10f), SignaturePoint(50f, 40f)))))

    @Test
    fun `TC-SIGN-001 획이 없으면 제출 되돌리기 전체 지우기가 모두 비활성이다`() {
        show(SignaturePadUiState())
        rule.onNodeWithTag("signature.submit-button").assertIsNotEnabled()
        rule.onNodeWithTag("signature.undo-button").assertIsNotEnabled()
        rule.onNodeWithTag("signature.clear-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-SIGN-001 그리기 화면은 제목 안내 캔버스 힌트 버튼 문구를 copy로 보인다`() {
        show(SignaturePadUiState())
        rule.onNodeWithTag("signature.root").assertIsDisplayed()
        rule.onNodeWithTag("signature.title").assertTextEquals(copy["onb.sign.title"])
        rule.onNodeWithTag("signature.guide-text").assertTextEquals(copy["onb.sign.guide"])
        rule.onNodeWithTag("signature.canvas").assertIsDisplayed()
        rule.onNodeWithTag("signature.canvas-hint").assertTextEquals(copy["onb.sign.pad-hint"])
        rule.onNodeWithTag("signature.submit-button").assertTextEquals(copy["onb.sign.confirm"])
        rule.onNodeWithTag("signature.undo-button").assertTextEquals(copy["onb.sign.undo"])
        rule.onNodeWithTag("signature.clear-button").assertTextEquals(copy["onb.sign.clear"])
        rule.onNodeWithTag("signature.back-button").assertIsDisplayed()
        rule.onNodeWithTag("signature.error-message").assertDoesNotExist()
    }

    @Test
    fun `TC-SIGN-001 획이 생기면 세 버튼이 활성이 되고 캔버스 힌트는 트리에서 사라진다`() {
        show(oneStroke)
        rule.onNodeWithTag("signature.submit-button").assertIsEnabled()
        rule.onNodeWithTag("signature.undo-button").assertIsEnabled()
        rule.onNodeWithTag("signature.clear-button").assertIsEnabled()
        rule.onNodeWithTag("signature.canvas-hint").assertDoesNotExist()
    }

    @Test
    fun `TC-SIGN-001 활성 버튼은 각자의 콜백을 한 번씩 호출한다`() {
        show(oneStroke)
        rule.onNodeWithTag("signature.undo-button").performClick()
        rule.onNodeWithTag("signature.clear-button").performClick()
        rule.onNodeWithTag("signature.submit-button").performClick()
        rule.onNodeWithTag("signature.back-button").performClick()
        assertEquals(listOf("undo", "clear", "confirm", "back"), calls)
    }

    @Test
    fun `TC-SIGN-001 비활성 제출 버튼은 콜백을 호출하지 않는다`() {
        show(SignaturePadUiState())
        rule.onNodeWithTag("signature.submit-button").performClick()
        assertEquals(emptyList(), calls)
    }

    @Test
    fun `TC-SIGN-001 용량 초과 오류는 오류 메시지 요소에 copy 문구로 보이고 획은 유지된다`() {
        show(oneStroke.copy(errorCopyKey = "sign.error.too-large"))
        rule.onNodeWithTag("signature.error-message").assertTextEquals(copy["sign.error.too-large"])
        rule.onNodeWithTag("signature.submit-button").assertIsEnabled()
    }
}
