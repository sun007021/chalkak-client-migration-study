package com.stonefive.chalkak.platform

import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.stonefive.chalkak.copy.Copy
import kr.chalkak.core.common.Clock
import kr.chalkak.feature.upload.AppToaster
import kr.chalkak.feature.upload.CameraAvailability
import kr.chalkak.feature.upload.GallerySaver
import kr.chalkak.feature.upload.PickerResult
import kr.chalkak.feature.upload.TempImage
import kr.chalkak.feature.upload.TempImageStore
import kr.chalkak.feature.upload.edit.EditImageSession
import kr.chalkak.feature.upload.edit.EditImageSource
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.DecodedImage
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PhotoCodec
import kr.chalkak.feature.upload.image.PickedPhoto
import kr.chalkak.feature.upload.image.WebpCompressor
import java.io.File
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** App-private files of the encoded WebP (`cache/upload-temp`). The id is the file name. */
class AndroidTempImageStore(private val directory: File) : TempImageStore {
    override suspend fun save(bytes: ByteArray): TempImage = withContext(Dispatchers.IO) {
        directory.mkdirs()
        val file = File(directory, "${UUID.randomUUID()}.webp")
        file.writeBytes(bytes)
        TempImage(file.name)
    }

    override suspend fun read(file: TempImage): ByteArray = withContext(Dispatchers.IO) { File(directory, file.id).readBytes() }

    override fun delete(file: TempImage) {
        File(directory, file.id).delete()
    }
}

/**
 * Copies a captured photo into `Pictures/Chalkak/chalkak-photo-*.jpg` through MediaStore (REQ-UPL-016). From API 29 no permission is
 * needed; below it `WRITE_EXTERNAL_STORAGE` must already be granted, otherwise this throws and the holder reports the failure.
 */
class AndroidGallerySaver(context: Context, private val sources: PhotoSources, private val clock: Clock) : GallerySaver {
    private val app = context.applicationContext

    override suspend fun saveCapture(photo: PickedPhoto): Boolean = withContext(Dispatchers.IO) {
        val bytes = sources.bytes(photo) ?: return@withContext false
        val name = "chalkak-photo-" + NAME_TIME.format(clock.now()) + ".jpg"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) saveScoped(name, bytes) else saveLegacy(name, bytes)
    }

    private fun saveScoped(name: String, bytes: ByteArray): Boolean {
        val resolver = app.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + FOLDER)
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val target = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return false
        try {
            resolver.openOutputStream(target)?.use { it.write(bytes) } ?: error("no output stream")
            resolver.update(target, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            return true
        } catch (e: Exception) {
            resolver.delete(target, null, null)
            throw e
        }
    }

    @Suppress("DEPRECATION")
    private fun saveLegacy(name: String, bytes: ByteArray): Boolean {
        val folder = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FOLDER)
        if (!folder.isDirectory && !folder.mkdirs()) return false
        val file = File(folder, name)
        file.writeBytes(bytes)
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
            put(MediaStore.Images.Media.DATA, file.absolutePath)
        }
        return app.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) != null
    }

    private companion object {
        const val FOLDER = "Chalkak"
        val NAME_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss", Locale.US).withZone(ZoneId.systemDefault())
    }
}

/** Plain Android toast from the app context (it outlives the upload screen). */
class AndroidToaster(context: Context, private val copy: Copy) : AppToaster {
    private val app = context.applicationContext
    private val main = Handler(Looper.getMainLooper())

    override fun show(copyKey: String) {
        main.post { Toast.makeText(app, copy[copyKey], Toast.LENGTH_SHORT).show() }
    }
}

/** Everything the upload holders need from the platform, plus the UI-facing [UploadPlatform]. */
class UploadAdapters(
    val platform: UploadPlatform,
    val codec: PhotoCodec,
    val compressor: WebpCompressor,
    val files: TempImageStore,
    val gallery: GallerySaver,
    val toaster: AppToaster,
    val camera: CameraAvailability,
) {
    companion object {
        fun android(context: Context, activity: CurrentActivity, bridge: PhotoPickBridge, copy: Copy, clock: Clock): UploadAdapters {
            val app = context.applicationContext
            val sources = PhotoSources(app.contentResolver)
            val bitmaps = OrientedBitmaps(sources)
            val codec = AndroidPhotoCodec(bitmaps)
            val previews = PhotoPreviews(bitmaps)
            return UploadAdapters(
                platform = UploadPlatform(
                    acquirer = AndroidPhotoAcquirer(app, activity, bridge, clock),
                    previews = AndroidPhotoPreviewLoader(previews),
                    editSource = AndroidEditImageSource(previews, codec),
                    editPainter = ComposeEditPreviewPainter(previews),
                ),
                codec = codec,
                compressor = AndroidWebpCompressor(),
                files = AndroidTempImageStore(File(app.cacheDir, "upload-temp")),
                gallery = AndroidGallerySaver(app, sources, clock),
                toaster = AndroidToaster(app, copy),
                camera = CameraAvailability { app.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) },
            )
        }

        /** Inert stand-ins for JVM tests that never reach the upload flow: nothing can be picked, decoded or saved. */
        fun headless(): UploadAdapters {
            val codec = object : PhotoCodec {
                override suspend fun readBounds(photo: PickedPhoto): ImageSize? = null
                override suspend fun decode(photo: PickedPhoto, sampleSize: Int): DecodedImage = error("headless")
                override suspend fun render(source: DecodedImage, edit: PhotoEdit): DecodedImage = error("headless")
                override suspend fun scale(source: DecodedImage, target: ImageSize): DecodedImage = error("headless")
            }
            val memory = ConcurrentHashMap<String, ByteArray>()
            return UploadAdapters(
                platform = UploadPlatform(
                    acquirer = object : PhotoAcquirer {
                        override suspend fun pickFromAlbum(): PickerResult = PickerResult.Cancelled
                        override suspend fun capture(): PickerResult = PickerResult.Cancelled
                    },
                    previews = PhotoPreviewLoader { null },
                    editSource = object : EditImageSource {
                        override suspend fun open(photo: PickedPhoto): EditImageSession? = null
                    },
                    editPainter = object : EditPreviewPainter {
                        @Composable
                        override fun Preview(photo: PickedPhoto, edit: PhotoEdit, modifier: Modifier) = Box(modifier)
                    },
                ),
                codec = codec,
                compressor = WebpCompressor { _, _ -> ByteArray(0) },
                files = object : TempImageStore {
                    override suspend fun save(bytes: ByteArray): TempImage = TempImage(UUID.randomUUID().toString()).also { memory[it.id] = bytes }
                    override suspend fun read(file: TempImage): ByteArray = memory.getValue(file.id)
                    override fun delete(file: TempImage) {
                        memory.remove(file.id)
                    }
                },
                gallery = GallerySaver { false },
                toaster = AppToaster { },
                camera = CameraAvailability { false },
            )
        }
    }
}
