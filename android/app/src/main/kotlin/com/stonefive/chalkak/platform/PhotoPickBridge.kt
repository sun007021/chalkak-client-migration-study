package com.stonefive.chalkak.platform

import android.net.Uri
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import kotlinx.coroutines.CompletableDeferred

/**
 * Bridge between the Activity result API and the suspending [AndroidPhotoAcquirer], the same shape as [UpdateFlowBridge].
 * `MainActivity` registers `PickVisualMedia` and `TakePicture`, stores the launchers here and forwards the results to
 * [onAlbumResult] / [onCameraResult]; it calls [detach] for each launcher when it is destroyed (the launchers reference that
 * Activity's result registry, so the bridge must not keep them).
 *
 * The bridge outlives the Activity (the app container holds it), so a result that arrives at a re-created Activity still
 * completes the request that was waiting for it.
 */
class PhotoPickBridge {
    @Volatile
    var albumLauncher: ActivityResultLauncher<PickVisualMediaRequest>? = null

    @Volatile
    var cameraLauncher: ActivityResultLauncher<Uri>? = null

    @Volatile
    private var pendingAlbum: CompletableDeferred<Uri?>? = null

    @Volatile
    private var pendingCamera: CompletableDeferred<Boolean>? = null

    /** Drops [registered] when the Activity that owns it is destroyed. A launcher of a newer Activity stays. */
    fun detach(registered: ActivityResultLauncher<*>) {
        if (albumLauncher === registered) albumLauncher = null
        if (cameraLauncher === registered) cameraLauncher = null
    }

    /** A new request replaces an unanswered one (that one is answered with "nothing picked"). */
    internal fun beginAlbum(): CompletableDeferred<Uri?> {
        pendingAlbum?.complete(null)
        return CompletableDeferred<Uri?>().also { pendingAlbum = it }
    }

    internal fun beginCamera(): CompletableDeferred<Boolean> {
        pendingCamera?.complete(false)
        return CompletableDeferred<Boolean>().also { pendingCamera = it }
    }

    internal fun finishAlbum(request: CompletableDeferred<Uri?>) {
        if (pendingAlbum === request) pendingAlbum = null
    }

    internal fun finishCamera(request: CompletableDeferred<Boolean>) {
        if (pendingCamera === request) pendingCamera = null
    }

    fun onAlbumResult(uri: Uri?) {
        pendingAlbum?.complete(uri)
        pendingAlbum = null
    }

    fun onCameraResult(saved: Boolean) {
        pendingCamera?.complete(saved)
        pendingCamera = null
    }
}
