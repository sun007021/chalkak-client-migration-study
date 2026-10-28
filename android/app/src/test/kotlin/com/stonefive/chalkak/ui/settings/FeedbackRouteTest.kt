package com.stonefive.chalkak.ui.settings

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.stonefive.chalkak.testing.FeedbackHarness
import com.stonefive.chalkak.testing.SettingsFakes
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.apiHttpFailure
import com.stonefive.chalkak.testing.loadCopy
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * `FeedbackRoute` over the real `FeedbackStateHolder` (fake `FeedbackRepository`): typing and sending go through the holder, its effects
 * become the success toast, the close request and the login request. Leaving the screen cancels a running request.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h900dp")
class FeedbackRouteTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private val toasts = CopyOnWriteArrayList<String>()
    private var closes = 0
    private var logins = 0
    private var visible by mutableStateOf(true)
    private var h = FeedbackHarness()

    @After
    fun tearDown() = h.close()

    private fun start(setup: SettingsFakes.() -> Unit = {}) {
        h.close()
        h = FeedbackHarness(SettingsFakes().apply(setup))
        visible = true
        rule.setContent {
            TestApp(copy) {
                if (visible) {
                    FeedbackRoute(
                        holder = h.holder,
                        showToast = { toasts += it },
                        onClose = { closes++ },
                        onLoginRequired = { logins++ },
                    )
                }
            }
        }
        rule.waitForIdle()
    }

    private fun tag(t: String) = rule.onNodeWithTag(t)

    private fun type(text: String) {
        tag("feedback.input").performTextInput(text)
        rule.waitForIdle()
    }

    private fun send() {
        tag("feedback.submit-button").performClick()
        rule.waitForIdle()
    }

    private val repo get() = h.fakes.feedbackRepo

    @Test
    fun `TC-FDBK-001 화면이 보이면 화면 표시를 한 번 알리고 요청은 없다`() {
        start()
        assertEquals(listOf("feedback"), h.analytics.screens.toList())
        assertTrue(repo.sent.isEmpty())
        tag("feedback.root").assertIsDisplayed()
    }

    @Test
    fun `TC-FDBK-003 입력하면 카운터가 바뀌고 보내기가 활성이 된다`() {
        start()
        tag("feedback.submit-button").assertIsNotEnabled()
        type("안녕하세요")
        tag("feedback.counter").assertTextEquals("5/1000")
        tag("feedback.submit-button").assertIsEnabled()
    }

    @Test
    fun `TC-FDBK-013 카운터는 앞뒤 공백을 뺀 코드포인트 수와 항상 같다`() {
        start()
        type("  가나다  ")
        tag("feedback.counter").assertTextEquals("3/1000")
        type("👨‍👩‍👧")
        tag("feedback.counter").assertTextEquals("8/1000")
    }

    @Test
    fun `TC-FDBK-017 전송에 성공하면 trim한 내용을 한 번 보내고 감사 토스트 후 화면을 닫는다`() {
        start()
        type("  좋은 앱이에요  ")
        send()
        assertEquals(listOf("좋은 앱이에요"), repo.sent.toList())
        assertEquals(listOf(copy["fdbk.success"]), toasts.toList())
        assertEquals("피드백을 보내주셔서 감사해요.", copy["fdbk.success"])
        assertEquals(1, closes)
        assertEquals(0, logins)
    }

    @Test
    fun `TC-FDBK-018 전송 중에는 보내는 중 문구와 비활성이고 연타해도 한 번만 보낸다 (TC-FDBK-019)`() {
        val gate = CompletableDeferred<Unit>()
        start { feedbackRepo.gate = gate }
        type("내용")
        send()
        tag("feedback.submit-button").assertTextEquals(copy["fdbk.sending"]).assertIsNotEnabled()
        tag("feedback.submit-button").performClick()
        tag("feedback.submit-button").performClick()
        rule.waitForIdle()
        assertEquals(1, repo.sent.size)
        assertEquals(0, closes)
        assertTrue(toasts.isEmpty())

        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(1, closes)
        assertEquals(1, toasts.size)
    }

    @Test
    fun `TC-FDBK-007 1001자는 요청 없이 검증 메시지를 보이고 입력을 유지한다`() {
        start()
        type("a".repeat(1001))
        tag("feedback.counter").assertTextEquals("1001/1000")
        send()
        assertTrue(repo.sent.isEmpty())
        tag("feedback.validation-message").assertIsDisplayed().assertTextEquals(copy["fdbk.error.invalid"])
        tag("feedback.counter").assertTextEquals("1001/1000")
        assertEquals(0, closes)
    }

    @Test
    fun `TC-FDBK-006 정확히 1000자는 허용되어 요청이 나간다`() {
        start()
        type("가".repeat(1000))
        tag("feedback.counter").assertTextEquals("1000/1000")
        send()
        assertEquals(1, repo.sent.size)
        assertEquals(1000, repo.sent.single().length)
    }

    @Test
    fun `TC-FDBK-014 10만 자를 붙여넣어도 카운터가 정확하고 전송은 거부된다`() {
        start()
        type("가".repeat(100_000))
        tag("feedback.counter").assertTextEquals("100000/1000")
        send()
        assertTrue(repo.sent.isEmpty())
        tag("feedback.validation-message").assertIsDisplayed()
    }

    @Test
    fun `TC-FDBK-024 서버 오류면 일반 실패 문구를 보이고 입력을 유지하며 다시 보낼 수 있다`() {
        start { feedbackRepo.results += apiHttpFailure(500, ErrorCode.INTERNAL_ERROR) }
        type("내용")
        send()
        tag("feedback.error-message").assertIsDisplayed().assertTextEquals(copy["fdbk.error.generic"])
        tag("feedback.counter").assertTextEquals("2/1000")
        tag("feedback.submit-button").assertIsEnabled()
        assertEquals(0, closes)
        assertTrue(toasts.isEmpty())

        send()
        assertEquals(listOf("내용", "내용"), repo.sent.toList())
        assertEquals(1, closes)
    }

    @Test
    fun `TC-FDBK-025 연결 실패면 네트워크 문구를 보이고 입력을 유지한다`() {
        start { feedbackRepo.results += ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE)) }
        type("내용")
        send()
        tag("feedback.error-message").assertTextEquals(copy["common.error.network"])
        assertEquals(1, repo.sent.size)
    }

    @Test
    fun `TC-FDBK-023 401이면 로그인을 요청하고 토스트도 닫기도 없다`() {
        start { feedbackRepo.results += apiHttpFailure(401, ErrorCode.UNAUTHORIZED) }
        type("내용")
        send()
        assertEquals(1, logins)
        assertEquals(0, closes)
        assertTrue(toasts.isEmpty())
        tag("feedback.error-message").assertDoesNotExist()
    }

    @Test
    fun `TC-FDBK-029 전송 중 화면을 떠나면 오류도 토스트도 닫기 요청도 없다`() {
        val gate = CompletableDeferred<Unit>()
        start { feedbackRepo.gate = gate }
        type("내용")
        send()
        rule.runOnIdle { visible = false }
        rule.waitForIdle()
        gate.complete(Unit)
        rule.waitForIdle()
        assertTrue(toasts.isEmpty())
        assertEquals(0, closes)
        assertEquals(0, logins)
        assertTrue(h.holder.state.value.error == null)
    }

    @Test
    fun `TC-NAV-047 닫기 버튼은 닫기를 요청하고 요청은 보내지 않는다`() {
        start()
        type("쓰던 내용")
        tag("feedback.close-button").performClick()
        rule.waitForIdle()
        assertEquals(1, closes)
        assertTrue(repo.sent.isEmpty())
    }
}
