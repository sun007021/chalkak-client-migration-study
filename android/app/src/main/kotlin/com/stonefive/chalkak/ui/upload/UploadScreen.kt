package com.stonefive.chalkak.ui.upload

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.platform.PhotoPreview
import com.stonefive.chalkak.platform.UploadPlatform
import kr.chalkak.feature.upload.PhotoUploadStateHolder
import kr.chalkak.feature.upload.PhotoUploadUiState
import kr.chalkak.feature.upload.SuccessInfo

/** Events of the upload screen. Defaults do nothing so a test overrides only what it needs. */
interface UploadActions {
    fun onClose() = Unit
    fun onAlbumClick() = Unit
    fun onCameraClick() = Unit
    fun onPhotoClick() = Unit
    fun onTitleChange(raw: String) = Unit
    fun onTopicRetry() = Unit
    fun onSubmit() = Unit
}

/**
 * Stateless upload screen (testids `upload.*`). See the PR notes for the full state -> node contract.
 * [preview] is the loaded bitmap of `state.photo` (null while loading / no photo).
 */
@Composable
@Suppress("UNUSED_PARAMETER")
fun UploadScreen(
    state: PhotoUploadUiState,
    preview: PhotoPreview?,
    actions: UploadActions,
    modifier: Modifier = Modifier,
) {
    // STUB (TDD step 1)
}

/** Wires [holder] + [platform] (picker, camera, preview, editor overlay) to [UploadScreen]. Effects: success, reauth. */
@Composable
@Suppress("UNUSED_PARAMETER")
fun UploadRoute(
    holder: PhotoUploadStateHolder,
    platform: UploadPlatform,
    onClose: () -> Unit,
    onShowSuccess: (SuccessInfo) -> Unit,
    onReauthRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // STUB (TDD step 1)
}

/** `upload-success.*`: card with the photo, record message, status message, confirm button. */
@Composable
@Suppress("UNUSED_PARAMETER")
fun UploadSuccessScreen(
    info: SuccessInfo,
    preview: PhotoPreview?,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // STUB (TDD step 1)
}
