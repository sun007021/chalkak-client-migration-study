package com.stonefive.chalkak.ui.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.feature.onboarding.FlowError
import kr.chalkak.feature.settings.FeedbackUiState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Stateless [FeedbackScreen] (A9): draws the [FeedbackUiState] it is given and reports inputs. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h900dp")
class FeedbackScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val edits = CopyOnWriteArrayList<String>()
    private var sends = 0
    private var closes = 0

    private fun show(state: FeedbackUiState = FeedbackUiState()) = rule.setContent {
        TestApp(copy) {
            FeedbackScreen(
                state = state,
                onInputChange = { edits += it },
                onSend = { sends++ },
                onClose = { closes++ },
            )
        }
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    /** What the holder reports for [text]: raw input plus the trimmed code point count. */
    private fun typed(text: String, sending: Boolean = false, error: FlowError? = null) =
        FeedbackUiState(input = text, count = text.trim().let { it.codePointCount(0, it.length) }, sending = sending, error = error)

    @Test
    fun `TC-FDBK-002 피드백 화면은 안내 문구 보조 설명 플레이스홀더 카운터 보내기 버튼을 보인다`() {
        show()
        tag("feedback.root").assertIsDisplayed()
        tag("feedback.close-button").assertIsDisplayed()
        tag("feedback.guide-text").assertTextEquals(copy["fdbk.intro.title"])
        tag("feedback.guide-body").assertTextEquals(copy["fdbk.intro.body"])
        rule.onNodeWithText(copy["fdbk.field.placeholder"]).assertIsDisplayed()
        assertEquals("내용을 입력해 주세요.", copy["fdbk.field.placeholder"])
        tag("feedback.input").assertIsDisplayed()
        tag("feedback.counter").assertTextEquals("0/1000")
        tag("feedback.submit-button").assertIsDisplayed().assertTextEquals(copy["fdbk.send"])
        tag("feedback.validation-message").assertDoesNotExist()
        tag("feedback.error-message").assertDoesNotExist()
    }

    @Test
    fun `TC-FDBK-003 초기 상태에서는 보내기가 비활성이다`() {
        show()
        tag("feedback.submit-button").assertIsNotEnabled()
        tag("feedback.submit-button").performClick()
        assertEquals(0, sends)
    }

    @Test
    fun `TC-FDBK-003 공백만 입력하면 카운터는 0이고 보내기는 비활성이다`() {
        show(typed("  \t\n　 "))
        tag("feedback.counter").assertTextEquals("0/1000")
        tag("feedback.submit-button").assertIsNotEnabled()
    }

    @Test
    fun `TC-FDBK-005 한 글자 이상이면 보내기가 활성이고 누르면 전송을 요청한다`() {
        show(typed("가"))
        tag("feedback.counter").assertTextEquals("1/1000")
        tag("feedback.submit-button").assertIsEnabled().performClick()
        assertEquals(1, sends)
    }

    @Test
    fun `TC-FDBK-013 카운터는 받은 글자 수를 현재 수 슬래시 1000으로 보이고 1000을 넘어도 그대로 보인다`() {
        show(typed("a".repeat(1001)))
        tag("feedback.counter").assertTextEquals("1001/1000")
        tag("feedback.submit-button").assertIsEnabled()
    }

    @Test
    fun `TC-FDBK-013 카운터는 앞뒤 공백을 뺀 코드포인트 수를 보인다`() {
        show(typed("  👨‍👩‍👧  ")) // five code points
        tag("feedback.counter").assertTextEquals("5/1000")
    }

    @Test
    fun `입력을 바꾸면 새 전체 텍스트로 알린다`() {
        show()
        tag("feedback.input").performTextInput("의견")
        assertEquals(listOf("의견"), edits.toList())
    }

    @Test
    fun `이미 입력이 있으면 플레이스홀더가 없다`() {
        show(typed("안녕"))
        rule.onNodeWithText(copy["fdbk.field.placeholder"]).assertDoesNotExist()
        tag("feedback.input").assertShowsAll("안녕")
    }

    @Test
    fun `TC-FDBK-018 전송 중에는 보내는 중 문구이고 비활성이다`() {
        show(typed("내용", sending = true))
        tag("feedback.submit-button").assertTextEquals(copy["fdbk.sending"]).assertIsNotEnabled()
        assertEquals("보내는 중...", copy["fdbk.sending"])
    }

    @Test
    fun `TC-FDBK-007 길이 검증 오류는 검증 메시지 자리에 보이고 입력은 그대로다`() {
        show(typed("a".repeat(1001), error = FlowError(1, "fdbk.error.invalid")))
        tag("feedback.validation-message").assertIsDisplayed().assertTextEquals(copy["fdbk.error.invalid"])
        tag("feedback.error-message").assertDoesNotExist()
        assertEquals("피드백은 1자 이상 1000자 이하로 입력해 주세요.", copy["fdbk.error.invalid"])
    }

    @Test
    fun `TC-FDBK-024 전송 실패 문구는 오류 메시지 자리에 보인다`() {
        show(typed("내용", error = FlowError(1, "fdbk.error.generic")))
        tag("feedback.error-message").assertIsDisplayed().assertTextEquals(copy["fdbk.error.generic"])
        tag("feedback.validation-message").assertDoesNotExist()
        tag("feedback.submit-button").assertIsEnabled()
    }

    @Test
    fun `TC-FDBK-025 네트워크 오류 문구도 오류 메시지 자리에 보인다`() {
        show(typed("내용", error = FlowError(1, "common.error.network")))
        tag("feedback.error-message").assertTextEquals(copy["common.error.network"])
    }

    @Test
    fun `TC-FDBK-021 서버가 보낸 400 문구는 그대로 보인다`() {
        show(typed("내용", error = FlowError(1, "fdbk.error.invalid", serverMessage = "서버가 준 문구")))
        tag("feedback.validation-message").assertTextEquals("서버가 준 문구")
    }

    @Test
    fun `닫기 버튼은 닫기를 요청한다`() {
        show(typed("내용"))
        tag("feedback.close-button").performClick()
        assertEquals(1, closes)
        assertTrue(edits.isEmpty())
    }
}
