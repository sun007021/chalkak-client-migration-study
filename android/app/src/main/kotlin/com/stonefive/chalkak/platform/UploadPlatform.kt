package com.stonefive.chalkak.platform

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import kr.chalkak.feature.upload.PickerResult
import kr.chalkak.feature.upload.edit.EditImageSource
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoFilter
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PickedPhoto

/**
 * System UI that hands a photo back. Android Photo Picker (single image, no permission) and the system camera intent
 * (or CameraX) sit behind this; `Cancelled` = the user backed out. Implementations bridge an activity-result launcher to a suspend call.
 */
interface PhotoAcquirer {
    suspend fun pickFromAlbum(): PickerResult

    suspend fun capture(): PickerResult
}

/** A decoded, display-sized bitmap of a picked photo. [size] is the EXIF-oriented ORIGINAL size (its ratio is what the screen shows). */
class PhotoPreview(val image: ImageBitmap, val size: ImageSize)

/** Loads the preview of [photo]; null = cannot be decoded. */
fun interface PhotoPreviewLoader {
    suspend fun load(photo: PickedPhoto): PhotoPreview?
}

/** Draws the edit preview (crop, rotation, adjustments, filter via GPU / ColorMatrix) for the editor. */
interface EditPreviewPainter {
    @Composable
    fun Preview(photo: PickedPhoto, edit: PhotoEdit, modifier: Modifier)
}

/** Everything the upload flow needs from the platform. */
class UploadPlatform(
    val acquirer: PhotoAcquirer,
    val previews: PhotoPreviewLoader,
    val editSource: EditImageSource,
    val editPainter: EditPreviewPainter,
)

/**
 * 4x5 `android.graphics.ColorMatrix` arrays of the filters (same values as `PhotoFilter.matrix`, additive column in 0..255 units).
 * Each array is built once and cached (the same instance comes back on every call). Null for ORIGINAL.
 */
object FilterColorMatrices {
    @Suppress("UNUSED_PARAMETER")
    fun of(filter: PhotoFilter): FloatArray? = null // STUB (TDD step 1)
}
