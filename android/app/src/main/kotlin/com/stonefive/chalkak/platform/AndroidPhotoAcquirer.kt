package com.stonefive.chalkak.platform

import android.content.ActivityNotFoundException
import android.content.Context
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.chalkak.feature.upload.PickerResult
import kr.chalkak.feature.upload.image.PhotoSource
import kr.chalkak.feature.upload.image.PickedPhoto
import java.io.File
import java.util.UUID

/**
 * Android Photo Picker (single image, no permission) and the system camera (`TakePicture` into a FileProvider file of the app cache).
 * `PickedPhoto.id` is the content URI. Without a foreground Activity, a registered launcher or a camera app the result is `Cancelled`.
 */
class AndroidPhotoAcquirer(
    context: Context,
    private val activity: CurrentActivity,
    private val bridge: PhotoPickBridge,
) : PhotoAcquirer {
    private val app = context.applicationContext
    private val captureDir = File(app.cacheDir, CAPTURE_DIR)

    override suspend fun pickFromAlbum(): PickerResult {
        val launcher = bridge.albumLauncher
        if (activity.get() == null || launcher == null) return PickerResult.Cancelled
        val request = bridge.beginAlbum()
        try {
            launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        } catch (e: ActivityNotFoundException) {
            bridge.finishAlbum(request)
            return PickerResult.Cancelled
        }
        val uri = try {
            request.await()
        } finally {
            bridge.finishAlbum(request)
        }
        return uri?.let { PickerResult.Picked(PickedPhoto(it.toString(), PhotoSource.ALBUM)) } ?: PickerResult.Cancelled
    }

    override suspend fun capture(): PickerResult {
        val launcher = bridge.cameraLauncher
        if (activity.get() == null || launcher == null) return PickerResult.Cancelled
        val file = withContext(Dispatchers.IO) { newCaptureFile() }
        val uri = FileProvider.getUriForFile(app, authority(app), file)
        val request = bridge.beginCamera()
        try {
            launcher.launch(uri)
        } catch (e: ActivityNotFoundException) {
            bridge.finishCamera(request)
            file.delete()
            return PickerResult.Cancelled
        }
        val saved = try {
            request.await()
        } catch (e: kotlinx.coroutines.CancellationException) {
            file.delete()
            throw e
        } finally {
            bridge.finishCamera(request)
        }
        if (!saved || file.length() == 0L) {
            file.delete()
            return PickerResult.Cancelled
        }
        return PickerResult.Picked(PickedPhoto(uri.toString(), PhotoSource.CAMERA))
    }

    /** Old captures of earlier visits are removed first; the file of the current visit stays until the cache is cleared. */
    private fun newCaptureFile(): File {
        captureDir.mkdirs()
        val cutoff = System.currentTimeMillis() - STALE_AFTER_MS
        captureDir.listFiles()?.filter { it.lastModified() < cutoff }?.forEach(File::delete)
        return File(captureDir, "capture-${UUID.randomUUID()}.jpg")
    }

    companion object {
        const val CAPTURE_DIR = "captures"
        private const val STALE_AFTER_MS = 24L * 60 * 60 * 1000

        /** Must equal the `authorities` of the FileProvider in the manifest. */
        fun authority(context: Context): String = context.packageName + ".fileprovider"
    }
}
