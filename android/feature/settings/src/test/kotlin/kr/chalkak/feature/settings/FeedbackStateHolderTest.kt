package kr.chalkak.feature.settings

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.settings.testing.FakeFeedbackRepository
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FeedbackStateHolderTest {
    private class Rig(
        val holder: FeedbackStateHolder,
        val repo: FakeFeedbackRepository,
        val analytics: RecordingAnalytics,
        val effects: List<FeedbackEffect>,
    ) {
        val state get() = holder.state.value
    }

    private fun TestScope.rig(): Rig {
        val repo = FakeFeedbackRepository()
        val analytics = RecordingAnalytics()
        val holder = FeedbackStateHolder(holderScope(), repo, analytics)
        return Rig(holder, repo, analytics, collectAll(holder.effects))
    }

    private fun TestScope.type(r: Rig, text: String) {
        r.holder.onInputChanged(text)
        runCurrent()
    }

    private fun TestScope.send(r: Rig) {
        r.holder.onSendClicked()
        advanceUntilIdle()
    }

    private val family = "👨‍👩‍👧" // 5 code points, 1 grapheme
    private val grinning = "😀" // 1 code point, 2 UTF-16 units

    // ---- screen / initial -------------------------------------------------------------------

    @Test
    fun `TC-FDBK-001 showing the feedback screen sends screen_view feedback once`() = runTest {
        val r = rig()
        r.holder.onScreenShown()
        runCurrent()
        assertEquals(listOf("feedback"), r.analytics.screens.toList())
    }

    @Test
    fun `TC-FDBK-003 the send button starts disabled`() = runTest {
        val r = rig()
        assertFalse(r.state.sendEnabled)
        assertEquals(0, r.state.count)
        assertEquals("", r.state.input)
    }

    // ---- trim and length --------------------------------------------------------------------

    @Test
    fun `TC-FDBK-004 input of only spaces, tabs, newlines and ideographic spaces cannot be sent and makes no request`() = runTest {
        val r = rig()
        listOf(" ", "   ", "\t", "\n\n", "　", " \t\n　 \r\n").forEach { blank ->
            type(r, blank)
            assertFalse(r.state.sendEnabled, "blank input ${blank.map { it.code }}")
            assertEquals(0, r.state.count)
            send(r)
        }
        assertTrue(r.repo.sent.isEmpty())
    }

    @Test
    fun `TC-FDBK-005 a single code point after trimming can be sent`() = runTest {
        val r = rig()
        type(r, "  가  ")
        assertTrue(r.state.sendEnabled)
        assertEquals(1, r.state.count)
        send(r)
        assertEquals(listOf("가"), r.repo.sent.toList())
    }

    @Test
    fun `TC-FDBK-006 exactly 1000 code points after trimming is sent`() = runTest {
        val r = rig()
        val text = "a".repeat(AppConstants.FEEDBACK_MAX)
        type(r, text)
        assertEquals(1000, r.state.count)
        send(r)
        assertEquals(listOf(text), r.repo.sent.toList())
        assertNull(r.state.error)
    }

    @Test
    fun `TC-FDBK-007 1001 code points after trimming makes no request and shows the invalid-length message`() = runTest {
        val r = rig()
        type(r, "a".repeat(1001))
        assertEquals(1001, r.state.count)
        assertTrue(r.state.sendEnabled, "input is not blocked, validation happens on send (REQ-FDBK-005)")
        send(r)
        assertTrue(r.repo.sent.isEmpty())
        assertEquals("fdbk.error.invalid", r.state.error?.copyKey)
        assertEquals("피드백은 1자 이상 1000자 이하로 입력해 주세요.", Copy["fdbk.error.invalid"])
        assertEquals("a".repeat(1001), r.state.input)
    }

    @Test
    fun `TC-FDBK-008 1002 characters with padding that trim to 1000 are sent, and the server gets the trimmed text`() = runTest {
        val r = rig()
        val core = "나".repeat(1000)
        type(r, " $core\n")
        assertEquals(1000, r.state.count)
        send(r)
        assertEquals(listOf(core), r.repo.sent.toList())
    }

    @Test
    fun `TC-FDBK-009 1000 emoji (2000 UTF-16 units) are allowed and 1001 are refused by code point count`() = runTest {
        val r = rig()
        type(r, grinning.repeat(1000))
        assertEquals(1000, r.state.count)
        send(r)
        assertEquals(1, r.repo.sent.size)
        type(r, grinning.repeat(1001))
        assertEquals(1001, r.state.count)
        send(r)
        assertEquals(1, r.repo.sent.size)
        assertEquals("fdbk.error.invalid", r.state.error?.copyKey)
    }

    @Test
    fun `TC-FDBK-010 a ZWJ family emoji counts as five code points, so 200 pass and 201 do not`() = runTest {
        val r = rig()
        type(r, family.repeat(200))
        assertEquals(1000, r.state.count)
        send(r)
        assertEquals(1, r.repo.sent.size)
        type(r, family.repeat(201))
        assertEquals(1005, r.state.count)
        send(r)
        assertEquals(1, r.repo.sent.size)
    }

    @Test
    fun `TC-FDBK-011 decomposed and precomposed Hangul are counted as typed, without normalization`() = runTest {
        val r = rig()
        val nfc = "한글" // 2 code points
        val nfd = java.text.Normalizer.normalize(nfc, java.text.Normalizer.Form.NFD) // 6 code points
        type(r, nfc)
        assertEquals(2, r.state.count)
        type(r, nfd)
        assertEquals(6, r.state.count)
        send(r)
        assertEquals(listOf(nfd), r.repo.sent.toList())
    }

    @Test
    fun `TC-FDBK-012 only the ends are trimmed and inner newlines and spaces are sent unchanged`() = runTest {
        val r = rig()
        type(r, "  첫 줄\n\n  둘째   줄\t끝 \n")
        send(r)
        assertEquals(listOf("첫 줄\n\n  둘째   줄\t끝"), r.repo.sent.toList())
    }

    @Test
    fun `TC-FDBK-013 the counter always equals the trimmed code point count, also above the limit`() = runTest {
        val r = rig()
        listOf("", "  ", "abc", " abc ", "a$grinning", "x".repeat(1000), "x".repeat(1234)).forEach { text ->
            type(r, text)
            val expected = text.trim().let { it.codePointCount(0, it.length) }
            assertEquals(expected, r.state.count, text.take(10))
        }
    }

    @Test
    fun `TC-FDBK-014 pasting 100000 characters keeps an exact counter, stays responsive and the send is refused`() = runTest {
        val r = rig()
        type(r, "가".repeat(100_000))
        assertEquals(100_000, r.state.count)
        send(r)
        assertTrue(r.repo.sent.isEmpty())
        assertEquals("fdbk.error.invalid", r.state.error?.copyKey)
    }

    // ---- sending ----------------------------------------------------------------------------

    @Test
    fun `TC-FDBK-017 success toasts, closes the screen and empties the input`() = runTest {
        val r = rig()
        type(r, "고마워요")
        send(r)
        assertEquals(listOf<FeedbackEffect>(FeedbackEffect.Done("fdbk.success")), r.effects)
        assertEquals("피드백을 보내주셔서 감사해요.", Copy["fdbk.success"])
        assertEquals("", r.state.input)
        assertEquals(0, r.state.count)
        assertFalse(r.state.sending)
    }

    @Test
    fun `TC-FDBK-018 while sending the state is sending and the button is disabled`() = runTest {
        val r = rig()
        val g = gate()
        r.repo.gate = g
        type(r, "hello")
        r.holder.onSendClicked()
        runCurrent()
        assertTrue(r.state.sending)
        assertFalse(r.state.sendEnabled)
        assertEquals("보내는 중...", Copy["fdbk.sending"])
        g.complete(Unit)
        advanceUntilIdle()
        assertFalse(r.state.sending)
    }

    @Test
    fun `TC-FDBK-019 three taps on send produce one POST`() = runTest {
        val r = rig()
        val g = gate()
        r.repo.gate = g
        type(r, "hello")
        repeat(3) { r.holder.onSendClicked() }
        runCurrent()
        g.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, r.repo.sent.size)
        assertEquals(1, r.effects.size)
    }

    @Test
    fun `TC-FDBK-020 after a successful send nothing of the previous text is left`() = runTest {
        val r = rig()
        type(r, "first")
        send(r)
        assertEquals("", r.state.input)
        assertFalse(r.state.sendEnabled)
        assertNull(r.state.error)
    }

    // ---- failures ---------------------------------------------------------------------------

    @Test
    fun `TC-FDBK-021 a 400 shows the invalid-length copy (not the server message) and keeps the input`() = runTest {
        val r = rig()
        r.repo.results += httpFailure(400, ErrorCode.BUSINESS_ERROR, "피드백 내용이 필요합니다.")
        type(r, "내용")
        send(r)
        assertEquals("fdbk.error.invalid", r.state.error?.copyKey)
        assertNull(r.state.error?.serverMessage)
        assertEquals("내용", r.state.input)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-FDBK-023 REAUTHENTICATION_REQUIRED goes to login`() = runTest {
        val r = rig()
        r.repo.results += httpFailure(401, ErrorCode.REAUTHENTICATION_REQUIRED)
        type(r, "내용")
        send(r)
        assertEquals(listOf<FeedbackEffect>(FeedbackEffect.GoLogin), r.effects)
        assertNull(r.state.error)
    }

    @Test
    fun `TC-FDBK-022 a 401 that survived the refresh also goes to login`() = runTest {
        val r = rig()
        r.repo.results += httpFailure(401, ErrorCode.UNAUTHORIZED)
        type(r, "내용")
        send(r)
        assertEquals(listOf<FeedbackEffect>(FeedbackEffect.GoLogin), r.effects)
    }

    @Test
    fun `TC-FDBK-024 a 500 shows the generic copy, keeps the input and sends exactly one request`() = runTest {
        val r = rig()
        r.repo.results += httpFailure(500, ErrorCode.INTERNAL_ERROR)
        type(r, "내용")
        send(r)
        assertEquals("fdbk.error.generic", r.state.error?.copyKey)
        assertEquals("피드백을 보내지 못했어요. 다시 시도해 주세요.", Copy["fdbk.error.generic"])
        assertEquals("내용", r.state.input)
        assertEquals(1, r.repo.sent.size)
        assertTrue(r.state.sendEnabled)
    }

    @Test
    fun `TC-FDBK-025 a connection failure or timeout shows the network copy, keeps the input and lets the user resend`() = runTest {
        val r = rig()
        r.repo.results += networkFailure(NetworkKind.OFFLINE)
        r.repo.results += networkFailure(NetworkKind.TIMEOUT)
        type(r, "내용")
        send(r)
        assertEquals("common.error.network", r.state.error?.copyKey)
        assertEquals("네트워크 연결을 확인해 주세요.", Copy["common.error.network"])
        assertEquals("내용", r.state.input)
        assertEquals(1, r.repo.sent.size)
        send(r)
        assertEquals("common.error.network", r.state.error?.copyKey)
        assertEquals(2, r.repo.sent.size)
        send(r)
        assertEquals(3, r.repo.sent.size)
        assertEquals(listOf<FeedbackEffect>(FeedbackEffect.Done("fdbk.success")), r.effects)
    }

    @Test
    fun `TC-FDBK-026 a manual resend after a timeout is sent again without de-duplication`() = runTest {
        val r = rig()
        r.repo.results += networkFailure(NetworkKind.TIMEOUT)
        type(r, "같은 내용")
        send(r)
        send(r)
        assertEquals(listOf("같은 내용", "같은 내용"), r.repo.sent.toList())
    }

    @Test
    fun `TC-FDBK-027 503 and 429 show the generic copy with no retry`() = runTest {
        val r = rig()
        r.repo.results += httpFailure(503, ErrorCode.INTERNAL_ERROR)
        r.repo.results += httpFailure(429, ErrorCode.BUSINESS_ERROR)
        type(r, "내용")
        send(r)
        assertEquals("fdbk.error.generic", r.state.error?.copyKey)
        assertEquals(1, r.repo.sent.size)
        send(r)
        assertEquals("fdbk.error.generic", r.state.error?.copyKey)
        assertEquals(2, r.repo.sent.size, "one request per tap, nothing automatic")
    }

    @Test
    fun `TC-FDBK-028 a banned member's 201 is an ordinary success without any ban message`() = runTest {
        val r = rig()
        type(r, "정지 회원")
        send(r)
        assertEquals(listOf<FeedbackEffect>(FeedbackEffect.Done("fdbk.success")), r.effects)
        assertNull(r.state.error)
    }

    @Test
    fun `TC-FDBK-029 leaving the screen while sending shows no error and no effect`() = runTest {
        val r = rig()
        val g = gate()
        r.repo.gate = g
        r.repo.results += networkFailure(NetworkKind.OFFLINE)
        type(r, "내용")
        r.holder.onSendClicked()
        runCurrent()
        r.holder.onScreenGone()
        g.complete(Unit)
        advanceUntilIdle()
        assertNull(r.state.error)
        assertFalse(r.state.sending)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-FDBK-030 an answer that arrives after logout or an account switch causes no toast and no navigation`() = runTest {
        val r = rig()
        val g = gate()
        r.repo.gate = g
        type(r, "내용")
        r.holder.onSendClicked()
        runCurrent()
        r.holder.onAccountChanged()
        g.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.effects.isEmpty())
        assertNull(r.state.error)
    }

    @Test
    fun `TC-FDBK-034 only screen_view feedback is reported and the feedback text never reaches analytics`() = runTest {
        val r = rig()
        r.holder.onScreenShown()
        type(r, "비밀 내용 secret-feedback-text")
        send(r)
        assertEquals(listOf("feedback"), r.analytics.screens.toList())
        assertTrue(r.analytics.tabs.isEmpty())
        assertNotNull(r.effects.singleOrNull())
    }
}
