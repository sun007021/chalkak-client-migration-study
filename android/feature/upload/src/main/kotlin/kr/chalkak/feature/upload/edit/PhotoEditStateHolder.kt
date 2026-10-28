package kr.chalkak.feature.upload.edit

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PickedPhoto

/** One opened photo for editing (platform adapter owns the bitmaps). */
interface EditImageSession {
    /** EXIF-oriented size of the original (what `PhotoEditTransform` expects as `source`). */
    val size: ImageSize

    /**
     * Auto-adjust analysis of the region [crop] of the [quarterTurns]-turned photo, reduced to a long edge of 256 px
     * (REQ-EDIT-025). Null = the photo cannot be analysed (REQ-EDIT-027). May throw; the holder treats a throw as null.
     */
    suspend fun analyzeAuto(quarterTurns: Int, crop: CropWindow): AutoAdjustments?

    /** Renders [edit] at full (upload) size once; throws when rendering fails (REQ-EDIT-006). The result is not kept. */
    suspend fun renderFull(edit: PhotoEdit)

    fun close()
}

/** Opens a photo for editing: preview source <= 1440 px, EXIF applied (REQ-EDIT-007). Null = cannot be opened. */
interface EditImageSource {
    suspend fun open(photo: PickedPhoto): EditImageSession?
}

enum class EditTab { CROP, ADJUST, FILTER }

/** [id] is unique per occurrence (D-20). */
data class EditToast(val id: Long, val copyKey: String)

/** [edit] is what "완료" would confirm right now (before normalisation). [aspect]'s pixel ratio is [fixedAspect] (null = free). */
data class PhotoEditUiState(
    val ready: Boolean = false,
    val tab: EditTab = EditTab.CROP,
    val aspect: CropAspectRatio = CropAspectRatio.FREE,
    val fixedAspect: Double? = null,
    val quarterTurns: Int = 0,
    val displayedSize: ImageSize? = null,
    val frame: CropFrame = CropFrame.FULL,
    val filter: PhotoFilter = PhotoFilter.ORIGINAL,
    val adjustItem: AdjustItem = AdjustItem.AUTO,
    val adjustments: AdjustmentLayers = AdjustmentLayers(),
    val busy: Boolean = false,
    val toast: EditToast? = null,
    val edit: PhotoEdit = PhotoEdit.IDENTITY,
)

sealed interface PhotoEditEffect {
    /** "완료" accepted: the normalised edit, exactly once. */
    data class Done(val edit: PhotoEdit) : PhotoEditEffect

    /** "취소": every change of this session is discarded. Whether the photo is dropped is the upload screen's decision (REQ-EDIT-003). */
    data object Cancelled : PhotoEditEffect
}

/**
 * Editor screen state (EDIT). Contract used by the tests:
 *  - [start] opens the session once (repeated calls do nothing); with an `initial` edit that has no analysed values the first
 *    analysis runs, with saved analysed values and the same crop it does NOT run again (REQ-EDIT-025). Nothing is rendered by [start].
 *  - tab / ratio / crop / adjust / filter events change [PhotoEditUiState] only; analysis is re-run when the user switches tab after the crop
 *    changed since the last analysis, and when "완료" is pressed with auto on and the crop changed since the last analysis.
 *  - [onDoneClicked] renders full size ONCE through [EditImageSession.renderFull]; on success emits [PhotoEditEffect.Done] with the
 *    normalised edit, on failure keeps the editor open and shows `edit.error.render`; pressing again retries. Repeated presses while busy do nothing.
 *  - [onCancelClicked] emits [PhotoEditEffect.Cancelled] without rendering.
 */
class PhotoEditStateHolder(
    private val scope: CoroutineScope,
    private val source: EditImageSource,
    private val photo: PickedPhoto,
    private val initial: PhotoEdit = PhotoEdit.IDENTITY,
) {
    private val _state = MutableStateFlow(PhotoEditUiState())
    private val _effects = Channel<PhotoEditEffect>(Channel.UNLIMITED)
    private val jobs = EditJobs(scope) { showToast(EDIT_RENDER_ERROR) }
    private var session: EditImageSession? = null
    private var crop: CropEditor? = null
    private var cropState = CropState()
    private var analyzedFor: Pair<Int, CropWindow>? = null
    private var started = false
    private var finished = false
    private var gone = false
    private var analysisJob: Job? = null
    private var renderJob: Job? = null
    private var toastCounter = 0L

    val state: StateFlow<PhotoEditUiState> get() = _state.asStateFlow()
    val effects: Flow<PhotoEditEffect> get() = _effects.receiveAsFlow()

    fun start() {
        if (started) return
        started = true
        jobs.launch { open() }
    }

    fun onTabSelected(tab: EditTab) {
        if (!_state.value.ready) return
        publish { it.copy(tab = tab) }
        if (analysisIsStale()) startAnalysis()
    }

    /** REQ-EDIT-011/012: largest frame of that ratio on the displayed photo; FREE keeps the frame and releases the ratio; ORIGINAL uses the displayed photo's ratio. */
    fun onAspectRatioSelected(ratio: CropAspectRatio) = changeCrop { select(it, ratio) }

    /** REQ-EDIT-014/015. */
    fun onRotateClicked() = changeCrop { rotate(it) }

    /** Crop "초기화" (REQ-EDIT-016): turns, frame and ratio only. */
    fun onCropResetClicked() = changeCrop { reset() }

    fun onFrameMoved(dx: Double, dy: Double) = changeCrop { move(it, dx, dy) }

    fun onCornerDragged(corner: CropCorner, x: Double, y: Double) = changeCrop { drag(it, corner, x, y) }

    /** REQ-EDIT-021: from another row to AUTO switches strength to 1 only if it was 0; re-selecting AUTO toggles 1 <-> 0. */
    fun onAdjustItemSelected(item: AdjustItem) {
        if (!_state.value.ready) return
        publish { current ->
            val layers = current.adjustments
            val reselected = item == AdjustItem.AUTO && current.adjustItem == AdjustItem.AUTO
            val strength = when {
                item != AdjustItem.AUTO -> layers.autoStrength
                reselected -> if (layers.autoStrength > 0.0) 0.0 else 1.0
                else -> if (layers.autoStrength > 0.0) layers.autoStrength else 1.0
            }
            current.copy(adjustItem = item, adjustments = layers.withAutoStrength(strength))
        }
    }

    fun onAdjustValueChanged(item: AdjustItem, value: Double) {
        if (_state.value.ready) publish { it.copy(adjustments = it.adjustments.withValue(item, value)) }
    }

    /** Adjust "초기화" (REQ-EDIT-024). */
    fun onAdjustResetClicked() {
        if (_state.value.ready) publish { it.copy(adjustments = it.adjustments.cleared()) }
    }

    fun onFilterSelected(filter: PhotoFilter) {
        if (_state.value.ready) publish { it.copy(filter = filter) }
    }

    fun onDoneClicked() {
        val current = _state.value
        if (!current.ready || current.busy || finished) return
        publish { it.copy(busy = true) }
        renderJob = jobs.launch {
            try {
                confirm()
            } finally {
                publish { it.copy(busy = false) }
            }
        }
    }

    fun onCancelClicked() {
        if (finished) return
        finished = true
        renderJob?.cancel()
        analysisJob?.cancel()
        _effects.trySend(PhotoEditEffect.Cancelled)
    }

    fun onToastShown(id: Long) {
        if (_state.value.toast?.id == id) publish { it.copy(toast = null) }
    }

    /** Screen gone: cancels pending work and closes the session. */
    fun onScreenGone() {
        gone = true
        analysisJob?.cancel()
        renderJob?.cancel()
        session?.close()
        session = null
    }

    // ---- internals ------------------------------------------------------------------------------------------

    private suspend fun open() {
        val opened = source.open(photo)
        if (opened == null || gone) {
            opened?.close()
            if (opened == null) showToast(EDIT_RENDER_ERROR)
            return
        }
        session = opened
        val editor = CropEditor(opened.size).also { crop = it }
        cropState = editor.restore(initial)
        if (initial.adjustments.auto.isNotEmpty()) analyzedFor = analysisKey()
        publish {
            it.copy(ready = true, filter = initial.filter, adjustments = initial.adjustments)
        }
        if (initial.adjustments.auto.isEmpty()) startAnalysis()
    }

    private fun changeCrop(change: CropEditor.(CropState) -> CropState) {
        val editor = crop ?: return
        if (!_state.value.ready) return
        cropState = editor.change(cropState)
        publish { it }
    }

    private fun analysisKey(): Pair<Int, CropWindow>? = crop?.let { cropState.quarterTurns to it.window(cropState) }

    private fun analysisIsStale(): Boolean = analysisKey() != analyzedFor

    private fun startAnalysis() {
        analysisJob?.cancel()
        analysisJob = jobs.launch { analyze() }
    }

    /** Re-runs the auto analysis for the current crop. A photo that cannot be analysed leaves the adjustments alone (REQ-EDIT-027). */
    private suspend fun analyze() {
        val opened = session ?: return
        val key = analysisKey() ?: return
        val result = try {
            opened.analyzeAuto(key.first, key.second)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null // REQ-EDIT-027: an unanalysable photo leaves the adjustments alone
        }
        currentCoroutineContext().ensureActive() // a late answer after cancel / screen exit must not touch the state
        analyzedFor = key
        if (result != null) publish { it.copy(adjustments = it.adjustments.withAuto(result.toMap())) }
    }

    private suspend fun confirm() {
        val opened = session ?: return
        if (_state.value.adjustments.autoStrength > 0.0 && analysisIsStale()) {
            analysisJob?.cancel()
            analyze()
        }
        val edit = _state.value.edit.normalized()
        try {
            opened.renderFull(edit)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            showToast(EDIT_RENDER_ERROR)
            return
        }
        currentCoroutineContext().ensureActive() // cancelled while rendering: no Done effect
        finished = true
        _effects.trySend(PhotoEditEffect.Done(edit))
    }

    private fun showToast(copyKey: String) {
        publish { it.copy(toast = EditToast(++toastCounter, copyKey)) }
    }

    /** Applies [change], then refreshes the fields derived from the crop state and [PhotoEditUiState.edit]. */
    private fun publish(change: (PhotoEditUiState) -> PhotoEditUiState) {
        _state.update { current ->
            val changed = change(current)
            val editor = crop ?: return@update changed
            val displayed = editor.displayed(cropState)
            changed.copy(
                aspect = cropState.aspect,
                fixedAspect = cropState.fixedAspect,
                quarterTurns = cropState.quarterTurns,
                displayedSize = displayed,
                frame = cropState.frame,
                edit = PhotoEdit(cropState.quarterTurns, editor.window(cropState), changed.filter, changed.adjustments),
            )
        }
    }

    private companion object {
        const val EDIT_RENDER_ERROR = "edit.error.render"
    }
}

/** Launches the editor's jobs. A job that throws (a bug) is reported to [onUnexpected]; it never reaches the scope's exception handler. */
private class EditJobs(private val scope: CoroutineScope, private val onUnexpected: (Exception) -> Unit) {
    fun launch(block: suspend () -> Unit): Job = scope.launch {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            onUnexpected(e)
        }
    }
}
