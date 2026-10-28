package com.stonefive.chalkak.ui.photoedit

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.platform.EditPreviewPainter
import kr.chalkak.feature.upload.edit.AdjustItem
import kr.chalkak.feature.upload.edit.CropAspectRatio
import kr.chalkak.feature.upload.edit.CropCorner
import kr.chalkak.feature.upload.edit.EditTab
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditStateHolder
import kr.chalkak.feature.upload.edit.PhotoEditUiState
import kr.chalkak.feature.upload.edit.PhotoFilter
import kr.chalkak.feature.upload.image.PickedPhoto

/** Events of the editor screen. Defaults do nothing so a test overrides only what it needs. */
interface PhotoEditActions {
    fun onTabSelected(tab: EditTab) = Unit
    fun onRatioSelected(ratio: CropAspectRatio) = Unit
    fun onRotate() = Unit
    fun onCropReset() = Unit
    fun onFrameMoved(dx: Double, dy: Double) = Unit
    fun onCornerDragged(corner: CropCorner, x: Double, y: Double) = Unit
    fun onAdjustItemSelected(item: AdjustItem) = Unit
    fun onAdjustValueChanged(item: AdjustItem, value: Double) = Unit
    fun onAdjustReset() = Unit
    fun onFilterSelected(filter: PhotoFilter) = Unit
    fun onDone() = Unit
    fun onCancel() = Unit

    /** The error alert's confirm button (`id` = `state.toast.id`). */
    fun onErrorConfirm(id: Long) = Unit
}

/** Stateless editor (testids `photo-edit.*`). [preview] draws the photo with `state.edit` applied. */
@Composable
@Suppress("UNUSED_PARAMETER")
fun PhotoEditScreen(
    state: PhotoEditUiState,
    preview: @Composable (Modifier) -> Unit,
    actions: PhotoEditActions,
    modifier: Modifier = Modifier,
) {
    // STUB (TDD step 1)
}

/** Wires [holder]: `start()`, effects (Done / Cancelled), `onScreenGone`. The preview comes from [painter]. */
@Composable
@Suppress("UNUSED_PARAMETER")
fun PhotoEditRoute(
    holder: PhotoEditStateHolder,
    photo: PickedPhoto,
    painter: EditPreviewPainter,
    onDone: (PhotoEdit) -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // STUB (TDD step 1)
}
