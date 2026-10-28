package kr.chalkak.feature.upload.edit

import kr.chalkak.feature.upload.image.ImageSize

/** Crop-tab state: quarter turns, the frame on the displayed (turned) photo, and the ratio choice (REQ-EDIT-010..016). */
internal data class CropState(
    val quarterTurns: Int = 0,
    val frame: CropFrame = CropFrame.FULL,
    val aspect: CropAspectRatio = CropAspectRatio.FREE,
    val fixedAspect: Double? = null,
)

/** Pure crop operations on [CropState] for one opened photo of EXIF-oriented size [source]. */
internal class CropEditor(private val source: ImageSize) {
    fun displayed(state: CropState): ImageSize = PhotoEditTransform.rotatedSize(source, state.quarterTurns)

    /** The crop window of the original that [state] currently selects. */
    fun window(state: CropState): CropWindow = PhotoEditTransform.cropWindowFor(source, state.quarterTurns, state.frame)

    /** Reopens a saved edit: turns and frame come back, the ratio choice is not saved so it is FREE. */
    fun restore(edit: PhotoEdit): CropState {
        val turns = edit.quarterTurns.mod(PhotoEdit.QUARTER_TURNS)
        return CropState(turns, PhotoEditTransform.frameFor(source, turns, edit.crop))
    }

    fun select(state: CropState, ratio: CropAspectRatio): CropState = when (ratio) {
        CropAspectRatio.FREE -> state.copy(aspect = ratio, fixedAspect = null)
        CropAspectRatio.ORIGINAL -> fit(state.copy(aspect = ratio), displayed(state).let { it.width.toDouble() / it.height })
        else -> fit(state.copy(aspect = ratio), requireNotNull(ratio.widthUnits).toDouble() / requireNotNull(ratio.heightUnits))
    }

    fun rotate(state: CropState): CropState {
        val turned = state.copy(quarterTurns = (state.quarterTurns + 1).mod(PhotoEdit.QUARTER_TURNS))
        val size = displayed(turned)
        return when (state.aspect) {
            // The frame turns with the photo, so the same region of the original stays selected.
            CropAspectRatio.FREE -> turned.copy(frame = PhotoEditTransform.frameFor(source, turned.quarterTurns, window(state)))
            CropAspectRatio.ORIGINAL -> fit(turned, size.width.toDouble() / size.height)
            else -> fit(turned, requireNotNull(state.fixedAspect))
        }
    }

    fun move(state: CropState, dx: Double, dy: Double): CropState = state.copy(frame = CropGeometry.move(state.frame, dx, dy))

    fun drag(state: CropState, corner: CropCorner, x: Double, y: Double): CropState =
        state.copy(frame = CropGeometry.resize(state.frame, corner, x, y, displayed(state), state.fixedAspect))

    fun reset(): CropState = CropState()

    private fun fit(state: CropState, aspect: Double): CropState =
        state.copy(fixedAspect = aspect, frame = CropGeometry.largestFrame(displayed(state), aspect))
}
