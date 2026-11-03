package kr.chalkak.feature.upload.edit

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.feature.upload.collectAll
import kr.chalkak.feature.upload.holderScope
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PickedPhoto
import kr.chalkak.feature.upload.photo
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

internal class FakeEditSession(override val size: ImageSize = ImageSize(4000, 3000)) : EditImageSession {
    val analyzeCalls = CopyOnWriteArrayList<Pair<Int, CropWindow>>()
    val rendered = CopyOnWriteArrayList<PhotoEdit>()
    var analysis: AutoAdjustments? = AutoAdjustments(exposure = 0.4, contrast = 0.2, highlights = -0.1, shadows = 0.1, blackPoint = 0.3, saturation = 0.05)
    var analyzeThrows = false
    var renderFailures = 0
    var renderGate: CompletableDeferred<Unit>? = null
    var closed = false

    override suspend fun analyzeAuto(quarterTurns: Int, crop: CropWindow): AutoAdjustments? {
        analyzeCalls += quarterTurns to crop
        if (analyzeThrows) throw IllegalStateException("analysis failed")
        return analysis
    }

    override suspend fun renderFull(edit: PhotoEdit) {
        rendered += edit
        renderGate?.await()
        if (renderFailures > 0) {
            renderFailures--
            throw IllegalStateException("render failed")
        }
    }

    override fun close() { closed = true }
}

internal class FakeEditSource(val session: FakeEditSession? = FakeEditSession()) : EditImageSource {
    val opened = CopyOnWriteArrayList<PickedPhoto>()
    override suspend fun open(photo: PickedPhoto): EditImageSession? {
        opened += photo
        return session
    }
}

internal class EditorRig(
    val t: TestScope,
    val holder: PhotoEditStateHolder,
    val source: FakeEditSource,
    val session: FakeEditSession,
    val effects: MutableList<PhotoEditEffect>,
) {
    val s: PhotoEditUiState get() = holder.state.value

    fun idle() = t.advanceUntilIdle()

    fun start() {
        holder.start()
        idle()
    }
}

internal fun TestScope.editorRig(
    initial: PhotoEdit = PhotoEdit.IDENTITY,
    session: FakeEditSession = FakeEditSession(),
    configure: FakeEditSession.() -> Unit = {},
): EditorRig {
    session.configure()
    val source = FakeEditSource(session)
    val holder = PhotoEditStateHolder(holderScope(), source, photo(), initial)
    return EditorRig(this, holder, source, session, collectAll(holder.effects))
}

/** TC-EDIT-001, 003..006, 008, 012, 014, 015, 021, 023, 032, 037, 045: the editor screen state. */
class PhotoEditStateHolderTest {
    private val tol = 1e-9

    private fun assertFrame(expected: CropFrame, actual: CropFrame) {
        assertEquals(expected.centerX, actual.centerX, tol, "centerX $actual")
        assertEquals(expected.centerY, actual.centerY, tol, "centerY $actual")
        assertEquals(expected.width, actual.width, tol, "width $actual")
        assertEquals(expected.height, actual.height, tol, "height $actual")
    }

    // ---- start ----------------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-001 start opens the photo and runs the first analysis exactly once, however often it is called`() = runTest {
        val rig = editorRig()
        repeat(3) { rig.holder.start() }
        rig.idle()
        assertEquals(1, rig.source.opened.size)
        assertEquals(listOf(0 to CropWindow.FULL), rig.session.analyzeCalls.toList())
        assertTrue(rig.session.rendered.isEmpty(), "building the screen renders nothing")
        assertTrue(rig.s.ready)
    }

    @Test
    fun `TC-EDIT-001 the editor starts on the crop tab, free ratio, auto row selected and auto switched off`() = runTest {
        val rig = editorRig()
        rig.start()
        assertEquals(EditTab.CROP, rig.s.tab)
        assertEquals(CropAspectRatio.FREE, rig.s.aspect)
        assertNull(rig.s.fixedAspect)
        assertEquals(AdjustItem.AUTO, rig.s.adjustItem)
        assertEquals(0.0, rig.s.adjustments.autoStrength, tol)
        assertEquals(0.4, rig.s.adjustments.auto.getValue(AdjustItem.EXPOSURE), tol)
        assertEquals(PhotoFilter.ORIGINAL, rig.s.filter)
        assertEquals(ImageSize(4000, 3000), rig.s.displayedSize)
        assertFrame(CropFrame.FULL, rig.s.frame)
        assertTrue(rig.s.edit.isIdentity)
    }

    @Test
    fun `TC-EDIT-006 reopening with a saved edit restores turns, frame, filter and values and does not analyse again`() = runTest {
        val saved = PhotoEdit(
            quarterTurns = 1,
            crop = CropWindow(0.5, 0.75, 0.5, 1.0),
            filter = PhotoFilter.VINTAGE,
            adjustments = AdjustmentLayers(auto = mapOf(AdjustItem.EXPOSURE to 0.4), autoStrength = 1.0),
        )
        val rig = editorRig(initial = saved)
        rig.start()
        assertEquals(1, rig.s.quarterTurns)
        assertEquals(ImageSize(3000, 4000), rig.s.displayedSize)
        assertFrame(CropFrame(0.25, 0.5, 0.5, 1.0), rig.s.frame)
        assertEquals(PhotoFilter.VINTAGE, rig.s.filter)
        assertEquals(1.0, rig.s.adjustments.autoStrength, tol)
        assertTrue(rig.session.analyzeCalls.isEmpty(), "saved analysis for the same crop is reused (REQ-EDIT-025)")
    }

    @Test
    fun `TC-EDIT-006 a saved edit without analysed values is analysed on open`() = runTest {
        val rig = editorRig(initial = PhotoEdit(filter = PhotoFilter.MONO))
        rig.start()
        assertEquals(1, rig.session.analyzeCalls.size)
    }

    // ---- done / cancel --------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-003 done renders once and hands over the normalised edit exactly once`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onFilterSelected(PhotoFilter.MONO)
        rig.holder.onRotateClicked()
        val expected = rig.s.edit.normalized()
        rig.holder.onDoneClicked()
        rig.holder.onDoneClicked()
        rig.idle()
        assertEquals(1, rig.session.rendered.size)
        assertEquals(listOf<PhotoEditEffect>(PhotoEditEffect.Done(expected)), rig.effects.toList())
        assertEquals(expected, rig.session.rendered.single())
        assertEquals(PhotoFilter.MONO, expected.filter)
        assertEquals(1, expected.quarterTurns)
    }

    @Test
    fun `TC-EDIT-003 done while the render is running is ignored`() = runTest {
        val rig = editorRig()
        rig.start()
        val gate = CompletableDeferred<Unit>()
        rig.session.renderGate = gate
        repeat(4) { rig.holder.onDoneClicked() }
        rig.t.runCurrent()
        assertTrue(rig.s.busy)
        gate.complete(Unit)
        rig.idle()
        assertEquals(1, rig.session.rendered.size)
        assertEquals(1, rig.effects.size)
        assertFalse(rig.s.busy)
    }

    @Test
    fun `TC-EDIT-004 cancel sends only Cancelled and renders nothing`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onFilterSelected(PhotoFilter.COOL)
        rig.holder.onCancelClicked()
        rig.idle()
        assertEquals(listOf<PhotoEditEffect>(PhotoEditEffect.Cancelled), rig.effects.toList())
        assertTrue(rig.session.rendered.isEmpty())
    }

    @Test
    fun `TC-EDIT-045 a filter chosen before cancelling is not handed on, reopening shows the earlier filter`() = runTest {
        val before = PhotoEdit(filter = PhotoFilter.VINTAGE)
        val rig = editorRig(initial = before)
        rig.start()
        rig.holder.onFilterSelected(PhotoFilter.MONO)
        rig.holder.onCancelClicked()
        rig.idle()
        assertTrue(rig.effects.none { it is PhotoEditEffect.Done })
        val reopened = editorRig(initial = before)
        reopened.start()
        assertEquals(PhotoFilter.VINTAGE, reopened.s.filter)
    }

    @Test
    fun `TC-EDIT-008 a failed render keeps the editor open with the render message and done can be tried again`() = runTest {
        val rig = editorRig { renderFailures = 1 }
        rig.start()
        rig.holder.onFilterSelected(PhotoFilter.WARM)
        rig.holder.onDoneClicked()
        rig.idle()
        assertTrue(rig.effects.isEmpty(), "no Done after a failed render")
        assertEquals("edit.error.render", rig.s.toast?.copyKey)
        assertTrue(Copy["edit.error.render"].isNotBlank())
        assertFalse(rig.s.busy)
        assertEquals(PhotoFilter.WARM, rig.s.filter, "edits are kept")
        rig.holder.onDoneClicked()
        rig.idle()
        assertEquals(2, rig.session.rendered.size)
        assertIs<PhotoEditEffect.Done>(rig.effects.single())
    }

    @Test
    fun `TC-EDIT-008 each failure shows a new toast occurrence`() = runTest {
        val rig = editorRig { renderFailures = 2 }
        rig.start()
        rig.holder.onDoneClicked()
        rig.idle()
        val first = assertNotNull(rig.s.toast)
        rig.holder.onDoneClicked()
        rig.idle()
        val second = assertNotNull(rig.s.toast)
        assertTrue(second.id != first.id)
        rig.holder.onToastShown(second.id)
        assertNull(rig.s.toast)
    }

    // ---- crop tab -------------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-014 choosing a ratio starts a new largest frame and drops an earlier adjusted frame`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAspectRatioSelected(CropAspectRatio.R4_5)
        assertEquals(CropAspectRatio.R4_5, rig.s.aspect)
        assertEquals(0.8, rig.s.fixedAspect!!, tol)
        assertFrame(CropFrame(0.5, 0.5, 0.6, 1.0), rig.s.frame)
        rig.holder.onFrameMoved(0.1, 0.0)
        assertEquals(0.6, rig.s.frame.centerX, tol)
        rig.holder.onAspectRatioSelected(CropAspectRatio.R1_1)
        assertFrame(CropFrame(0.5, 0.5, 0.75, 1.0), rig.s.frame)
    }

    @Test
    fun `TC-EDIT-014 free keeps the current frame and releases the ratio, original uses the photo ratio`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAspectRatioSelected(CropAspectRatio.R4_5)
        val frame = rig.s.frame
        rig.holder.onAspectRatioSelected(CropAspectRatio.FREE)
        assertEquals(frame, rig.s.frame)
        assertNull(rig.s.fixedAspect)
        rig.holder.onAspectRatioSelected(CropAspectRatio.ORIGINAL)
        assertEquals(4000.0 / 3000.0, rig.s.fixedAspect!!, tol)
        assertFrame(CropFrame.FULL, rig.s.frame)
    }

    @Test
    fun `TC-EDIT-015 each rotate is a clockwise quarter turn and four bring back the start`() = runTest {
        val rig = editorRig()
        rig.start()
        val sizes = mutableListOf<ImageSize?>()
        val turns = mutableListOf<Int>()
        repeat(4) {
            rig.holder.onRotateClicked()
            turns += rig.s.quarterTurns
            sizes += rig.s.displayedSize
        }
        assertEquals(listOf(1, 2, 3, 0), turns)
        assertEquals(listOf<ImageSize?>(ImageSize(3000, 4000), ImageSize(4000, 3000), ImageSize(3000, 4000), ImageSize(4000, 3000)), sizes)
        assertEquals(0, rig.s.edit.quarterTurns)
        assertTrue(rig.s.edit.isIdentity)
    }

    @Test
    fun `TC-EDIT-015 a fixed ratio is fitted again as large as possible after a turn`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAspectRatioSelected(CropAspectRatio.R4_5)
        rig.holder.onRotateClicked()
        assertEquals(0.8, rig.s.fixedAspect!!, tol)
        assertFrame(CropFrame(0.5, 0.5, 1.0, 0.9375), rig.s.frame)
        rig.holder.onRotateClicked()
        assertFrame(CropFrame(0.5, 0.5, 0.6, 1.0), rig.s.frame)
    }

    @Test
    fun `TC-EDIT-015 original ratio and a full free frame turn together with the photo and swap width and height`() = runTest {
        val original = editorRig()
        original.start()
        original.holder.onAspectRatioSelected(CropAspectRatio.ORIGINAL)
        original.holder.onRotateClicked()
        assertEquals(3000.0 / 4000.0, original.s.fixedAspect!!, tol)
        assertFrame(CropFrame.FULL, original.s.frame)
        val free = editorRig()
        free.start()
        free.holder.onRotateClicked()
        assertNull(free.s.fixedAspect)
        assertFrame(CropFrame.FULL, free.s.frame)
    }

    @Test
    fun `TC-EDIT-012 the crop reset returns turns, frame and ratio and keeps filter and adjustments`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAspectRatioSelected(CropAspectRatio.R4_5)
        rig.holder.onRotateClicked()
        rig.holder.onFilterSelected(PhotoFilter.VINTAGE)
        rig.holder.onAdjustValueChanged(AdjustItem.EXPOSURE, 0.3)
        rig.holder.onCropResetClicked()
        assertEquals(0, rig.s.quarterTurns)
        assertFrame(CropFrame.FULL, rig.s.frame)
        assertEquals(CropAspectRatio.FREE, rig.s.aspect)
        assertNull(rig.s.fixedAspect)
        assertEquals(PhotoFilter.VINTAGE, rig.s.filter)
        assertEquals(0.3, rig.s.adjustments.effective(AdjustItem.EXPOSURE), tol)
    }

    @Test
    fun `TC-EDIT-012 the adjust reset clears strength and touched values and keeps crop and filter`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onRotateClicked()
        rig.holder.onFilterSelected(PhotoFilter.VINTAGE)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        rig.holder.onAdjustValueChanged(AdjustItem.EXPOSURE, 0.3)
        rig.holder.onAdjustResetClicked()
        assertEquals(0.0, rig.s.adjustments.autoStrength, tol)
        assertTrue(rig.s.adjustments.user.isEmpty())
        assertTrue(rig.s.adjustments.isNeutral)
        assertEquals(0.4, rig.s.adjustments.auto.getValue(AdjustItem.EXPOSURE), tol, "the analysis stays")
        assertEquals(1, rig.s.quarterTurns)
        assertEquals(PhotoFilter.VINTAGE, rig.s.filter)
    }

    // ---- adjust tab -----------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-021 entering AUTO from another row switches it on only if it was off, tapping it again toggles`() = runTest {
        val rig = editorRig()
        rig.start()
        assertEquals(0.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO) // already selected: toggles on
        assertEquals(1.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        assertEquals(0.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        assertEquals(1.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAdjustItemSelected(AdjustItem.EXPOSURE)
        assertEquals(AdjustItem.EXPOSURE, rig.s.adjustItem)
        assertEquals(1.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO) // coming from another row, already on: stays on
        assertEquals(1.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        assertEquals(0.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAdjustItemSelected(AdjustItem.WARMTH)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO) // coming from another row, off: switches on
        assertEquals(1.0, rig.s.adjustments.autoStrength, tol)
    }

    @Test
    fun `TC-EDIT-023 the strength slider sets the auto strength clamped to 0 to 1 and keeps touched rows`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAdjustValueChanged(AdjustItem.EXPOSURE, 0.3)
        rig.holder.onAutoStrengthChanged(0.5)
        assertEquals(0.5, rig.s.adjustments.autoStrength, tol)
        assertEquals(0.3, rig.s.adjustments.effective(AdjustItem.EXPOSURE), tol, "touched row stays")
        assertEquals(0.1, rig.s.adjustments.effective(AdjustItem.CONTRAST), tol, "auto 0.2 x 0.5")
        rig.holder.onAutoStrengthChanged(1.7)
        assertEquals(1.0, rig.s.adjustments.autoStrength, tol)
        rig.holder.onAutoStrengthChanged(-0.4)
        assertEquals(0.0, rig.s.adjustments.autoStrength, tol)
        assertEquals(0.2, rig.s.edit.adjustments.auto.getValue(AdjustItem.CONTRAST), tol, "analysis stays")
    }

    @Test
    fun `TC-EDIT-032 auto fills every row with analysis times strength, touched rows stay`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        assertEquals(0.4, rig.s.adjustments.effective(AdjustItem.EXPOSURE), tol)
        assertEquals(0.2, rig.s.adjustments.effective(AdjustItem.CONTRAST), tol)
        assertEquals(-0.1, rig.s.adjustments.effective(AdjustItem.HIGHLIGHTS), tol)
        rig.holder.onAdjustValueChanged(AdjustItem.EXPOSURE, 0.3)
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        assertEquals(0.3, rig.s.adjustments.effective(AdjustItem.EXPOSURE), tol)
        assertEquals(0.0, rig.s.adjustments.effective(AdjustItem.CONTRAST), tol)
        assertEquals(0.3, rig.s.edit.adjustments.effective(AdjustItem.EXPOSURE), tol)
    }

    @Test
    fun `TC-EDIT-032 a photo that cannot be analysed changes nothing when auto is switched on`() = runTest {
        val rig = editorRig { analysis = null }
        rig.start()
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        assertTrue(rig.s.adjustments.isNeutral)
        assertTrue(rig.s.edit.isIdentity)
        val thrown = editorRig { analyzeThrows = true }
        thrown.start()
        thrown.holder.onAdjustItemSelected(AdjustItem.AUTO)
        assertTrue(thrown.s.adjustments.isNeutral)
        assertTrue(thrown.s.ready)
    }

    // ---- analysis scheduling (REQ-EDIT-025) --------------------------------------------------------------------

    @Test
    fun `TC-EDIT-037 the analysis follows the crop, a tab change after a crop change analyses the new region once`() = runTest {
        val rig = editorRig()
        rig.start()
        assertEquals(1, rig.session.analyzeCalls.size)
        rig.holder.onTabSelected(EditTab.ADJUST)
        rig.idle()
        assertEquals(1, rig.session.analyzeCalls.size, "same crop: no new analysis")
        rig.holder.onTabSelected(EditTab.CROP)
        rig.holder.onAspectRatioSelected(CropAspectRatio.R1_1)
        rig.holder.onTabSelected(EditTab.ADJUST)
        rig.idle()
        assertEquals(2, rig.session.analyzeCalls.size)
        val (turns, crop) = rig.session.analyzeCalls.last()
        assertEquals(0, turns)
        assertEquals(0.75, crop.width, tol)
        assertEquals(1.0, crop.height, tol)
        rig.holder.onTabSelected(EditTab.FILTER)
        rig.holder.onTabSelected(EditTab.ADJUST)
        rig.idle()
        assertEquals(2, rig.session.analyzeCalls.size)
    }

    @Test
    fun `TC-EDIT-037 done with auto on analyses again only if the crop changed since the last analysis`() = runTest {
        val unchanged = editorRig()
        unchanged.start()
        unchanged.holder.onAdjustItemSelected(AdjustItem.AUTO)
        unchanged.holder.onDoneClicked()
        unchanged.idle()
        assertEquals(1, unchanged.session.analyzeCalls.size)

        val changed = editorRig()
        changed.start()
        changed.holder.onAdjustItemSelected(AdjustItem.AUTO)
        changed.holder.onAspectRatioSelected(CropAspectRatio.R1_1)
        changed.holder.onDoneClicked()
        changed.idle()
        assertEquals(2, changed.session.analyzeCalls.size)
        assertIs<PhotoEditEffect.Done>(changed.effects.single())
    }

    @Test
    fun `TC-EDIT-037 done with auto off stores no analysed values and does not analyse for the new crop`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAspectRatioSelected(CropAspectRatio.R1_1)
        rig.holder.onDoneClicked()
        rig.idle()
        assertEquals(1, rig.session.analyzeCalls.size)
        val done = assertIs<PhotoEditEffect.Done>(rig.effects.single())
        assertTrue(done.edit.adjustments.auto.isEmpty())
    }

    @Test
    fun `TC-EDIT-037 done with auto on keeps the analysed values so a reopen does not analyse again`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onAdjustItemSelected(AdjustItem.AUTO)
        rig.holder.onDoneClicked()
        rig.idle()
        val done = assertIs<PhotoEditEffect.Done>(rig.effects.single())
        assertEquals(0.4, done.edit.adjustments.auto.getValue(AdjustItem.EXPOSURE), tol)
        assertEquals(1.0, done.edit.adjustments.autoStrength, tol)
        val reopened = editorRig(initial = done.edit)
        reopened.start()
        assertTrue(reopened.session.analyzeCalls.isEmpty())
    }

    @Test
    fun `leaving the screen closes the session and ends pending work`() = runTest {
        val rig = editorRig()
        rig.start()
        rig.holder.onScreenGone()
        rig.idle()
        assertTrue(rig.session.closed)
    }
}
