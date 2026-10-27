package kr.chalkak.feature.onboarding

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SignaturePadStateHolderTest {
    private class Rig(
        val holder: SignaturePadStateHolder,
        val encoder: FakeEncoder,
        val analytics: RecordingAnalytics,
        val effects: List<SignaturePadEffect>,
    ) {
        val state get() = holder.state.value
    }

    private fun TestScope.rig(mode: SignatureMode = SignatureMode.Signup, encoderSize: Int = 100): Rig {
        val encoder = FakeEncoder(encoderSize)
        val analytics = RecordingAnalytics()
        val holder = SignaturePadStateHolder(mode, CANVAS, encoder, analytics)
        return Rig(holder, encoder, analytics, collectAll(holder.effects))
    }

    // ---- availability of buttons ------------------------------------------------------------

    @Test
    fun `TC-SIGN-001 empty pad disables confirm undo and clear`() = runTest {
        val r = rig()
        assertFalse(r.state.hasSignature)
        assertFalse(r.state.canConfirm)
        assertFalse(r.state.canUndo)
        assertFalse(r.state.canClear)
    }

    @Test
    fun `TC-SIGN-002 a single dot counts as a signature`() = runTest {
        val r = rig()
        r.holder.beginStroke(10f, 10f)
        r.holder.endStroke()
        assertTrue(r.state.hasSignature)
        assertTrue(r.state.canConfirm)
        assertEquals(1, r.state.strokes.size)
        assertEquals(1, r.state.strokes.single().points.size)
    }

    @Test
    fun `TC-SIGN-003 a stroke without points is not a signature`() = runTest {
        val r = rig()
        r.holder.addStroke(SignatureStroke(emptyList()))
        assertFalse(r.state.hasSignature)
        assertFalse(r.state.canConfirm)
    }

    @Test
    fun `TC-SIGN-004 a stroke with points enables confirm undo and clear`() = runTest {
        val r = rig()
        r.holder.addStroke(line())
        assertTrue(r.state.hasSignature)
        assertTrue(r.state.canConfirm)
        assertTrue(r.state.canUndo)
        assertTrue(r.state.canClear)
    }

    @Test
    fun `TC-SIGN-004 dragging builds one stroke out of begin extend end`() = runTest {
        val r = rig()
        r.holder.beginStroke(10f, 10f)
        r.holder.extendStroke(20f, 30f)
        r.holder.extendStroke(40f, 50f)
        r.holder.endStroke()
        assertEquals(listOf(SignatureStroke(listOf(SignaturePoint(10f, 10f), SignaturePoint(20f, 30f), SignaturePoint(40f, 50f)))), r.state.strokes)
    }

    // ---- coordinates ------------------------------------------------------------------------

    @Test
    fun `TC-SIGN-005 points outside the canvas are clamped into it`() = runTest {
        val r = rig()
        r.holder.beginStroke(-30f, -1f)
        r.holder.extendStroke(CANVAS.width + 50f, CANVAS.height + 9f)
        r.holder.extendStroke(CANVAS.width, 0f)
        r.holder.endStroke()
        val points = r.state.strokes.single().points
        assertEquals(listOf(SignaturePoint(0f, 0f), SignaturePoint(CANVAS.width, CANVAS.height), SignaturePoint(CANVAS.width, 0f)), points)
    }

    @Test
    fun `TC-SIGN-005 addStroke clamps too`() = runTest {
        val r = rig()
        r.holder.addStroke(stroke(-5f to 500f))
        assertEquals(SignaturePoint(0f, CANVAS.height), r.state.strokes.single().points.single())
    }

    // ---- undo / clear -----------------------------------------------------------------------

    @Test
    fun `TC-SIGN-006 undo removes strokes from the last one and disables everything at zero`() = runTest {
        val r = rig()
        val strokes = listOf(line(20f), line(60f), line(100f))
        strokes.forEach { r.holder.addStroke(it) }
        r.holder.onUndo()
        assertEquals(strokes.take(2), r.state.strokes)
        r.holder.onUndo()
        assertEquals(strokes.take(1), r.state.strokes)
        r.holder.onUndo()
        assertTrue(r.state.strokes.isEmpty())
        assertFalse(r.state.canConfirm)
        assertFalse(r.state.canUndo)
        assertFalse(r.state.canClear)
    }

    @Test
    fun `TC-SIGN-007 clear removes every stroke and drawing can continue`() = runTest {
        val r = rig()
        r.holder.addStroke(line(20f))
        r.holder.addStroke(line(60f))
        r.holder.onClear()
        assertTrue(r.state.strokes.isEmpty())
        assertFalse(r.state.canConfirm)
        r.holder.addStroke(line(80f))
        assertEquals(1, r.state.strokes.size)
        assertTrue(r.state.canConfirm)
    }

    // ---- confirm ----------------------------------------------------------------------------

    @Test
    fun `TC-SIGN-008 confirm opens the preview once even when tapped repeatedly`() = runTest {
        val r = rig()
        r.holder.addStroke(line())
        repeat(3) { r.holder.onConfirm() }
        assertEquals(1, r.effects.size)
        assertIs<SignaturePadEffect.ShowPreview>(r.effects.single())
        assertEquals(1, r.encoder.calls)
    }

    @Test
    fun `TC-SIGN-008 confirm on an empty pad does nothing`() = runTest {
        val r = rig()
        r.holder.onConfirm()
        assertTrue(r.effects.isEmpty())
        assertEquals(0, r.encoder.calls)
    }

    @Test
    fun `TC-SIGN-018 redraw returns to a blank pad that can be confirmed again`() = runTest {
        val r = rig()
        r.holder.addStroke(line())
        r.holder.onConfirm()
        r.holder.onRedraw()
        assertTrue(r.state.strokes.isEmpty())
        assertFalse(r.state.canConfirm)
        r.holder.addStroke(line(90f))
        r.holder.onConfirm()
        assertEquals(2, r.effects.size)
    }

    @Test
    fun `TC-SIGN-014 a PNG of exactly 1 MiB is accepted`() = runTest {
        val r = rig(encoderSize = AppConstants.SIGNATURE_MAX_BYTES.toInt())
        r.holder.addStroke(line())
        r.holder.onConfirm()
        val effect = assertIs<SignaturePadEffect.ShowPreview>(r.effects.single())
        assertEquals(1_048_576, effect.png.size)
        assertNull(r.state.errorCopyKey)
    }

    @Test
    fun `TC-SIGN-015 a PNG one byte over 1 MiB shows the too-large message and keeps the drawing`() = runTest {
        val r = rig(encoderSize = AppConstants.SIGNATURE_MAX_BYTES.toInt() + 1)
        r.holder.addStroke(line())
        r.holder.onConfirm()
        assertTrue(r.effects.isEmpty())
        assertEquals("sign.error.too-large", r.state.errorCopyKey)
        assertEquals("사인 이미지가 1MB를 초과했어요.", Copy["sign.error.too-large"])
        assertEquals(1, r.state.strokes.size)
        assertTrue(r.state.canConfirm)
    }

    @Test
    fun `TC-SIGN-015 after too-large the user can confirm again`() = runTest {
        val r = rig(encoderSize = AppConstants.SIGNATURE_MAX_BYTES.toInt() + 1)
        r.holder.addStroke(line())
        r.holder.onConfirm()
        r.encoder.size = 10
        r.holder.onConfirm()
        assertEquals(1, r.effects.size)
    }

    // ---- analytics --------------------------------------------------------------------------

    @Test
    fun `TC-ONB-049 signup flow sends terms then onboarding_signature then onboarding_signature_preview`() = runTest {
        val analytics = RecordingAnalytics()
        TermsStateHolder(SignupContext(), analytics).onScreenShown()
        val pad = SignaturePadStateHolder(SignatureMode.Signup, CANVAS, FakeEncoder(), analytics)
        pad.onScreenShown()
        pad.onPreviewShown()
        assertEquals(listOf("terms", "onboarding_signature", "onboarding_signature_preview"), analytics.screens.toList())
    }

    @Test
    fun `TC-SIGN-043 change flow sends change_signature then change_signature_preview`() = runTest {
        val r = rig(SignatureMode.Change)
        r.holder.onScreenShown()
        r.holder.onPreviewShown()
        assertEquals(listOf("change_signature", "change_signature_preview"), r.analytics.screens.toList())
    }
}
