package com.stonefive.chalkak.platform

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import coil3.ImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.stonefive.chalkak.copy.Copy
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.YearMonth
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.chalkak.core.data.record.RecordPostStatus
import kr.chalkak.feature.record.CalendarImageRenderer
import kr.chalkak.feature.record.CalendarImageSaver
import kr.chalkak.feature.record.RecordCell
import kr.chalkak.feature.record.SaveOutcome

/**
 * Draws the month calendar (title, weekday row, Sunday-start grid with the day photos) into a PNG for "이미지로 저장" (REQ-REC-037).
 * Thumbnails come through the app's image loader; a photo that cannot be loaded leaves its cell with the day number only.
 */
class AndroidCalendarImageRenderer(
    context: Context,
    private val copy: Copy,
    private val imageLoader: ImageLoader?,
) : CalendarImageRenderer {
    private val app = context.applicationContext

    override suspend fun render(month: YearMonth, cells: List<RecordCell>): ByteArray {
        val thumbs = cells.mapNotNull { it.post }.associate { it.postId to loadThumb(it.thumbnailImageUrl) }
        return withContext(Dispatchers.Default) { draw(month, cells, thumbs) }
    }

    private suspend fun loadThumb(url: String): Bitmap? {
        val loader = imageLoader ?: return null
        return try {
            val request = ImageRequest.Builder(app).data(url).allowHardware(false).build()
            (loader.execute(request) as? SuccessResult)?.image?.toBitmap()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }

    private fun draw(month: YearMonth, cells: List<RecordCell>, thumbs: Map<String, Bitmap?>): ByteArray {
        val rows = (cells.size / COLUMNS).coerceAtLeast(1)
        val width = COLUMNS * CELL
        val height = HEADER + WEEKDAYS + rows * CELL
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.parseColor("#F7F6F3"))
        val ink = Color.parseColor("#2B2724")
        val title = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ink; textSize = 56f; textAlign = Paint.Align.CENTER; isFakeBoldText = true }
        val label = copy.format("display.picker.year", "n" to month.year) + " " + copy.format("display.picker.month", "n" to month.monthValue)
        canvas.drawText(label, width / 2f, HEADER * 0.65f, title)
        val small = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#9A968D"); textSize = 32f; textAlign = Paint.Align.CENTER }
        copy["record.weekday"].forEachIndexed { i, c -> canvas.drawText(c.toString(), (i + 0.5f) * CELL, HEADER + WEEKDAYS * 0.7f, small) }
        val number = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ink; textSize = 28f }
        val onPhoto = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = 28f }
        val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#B0563B") }
        cells.forEachIndexed { index, cell ->
            val date = cell.date ?: return@forEachIndexed
            val left = (index % COLUMNS) * CELL + PAD
            val top = HEADER + WEEKDAYS + (index / COLUMNS) * CELL + PAD
            val rect = RectF(left, top, left + CELL - 2 * PAD, top + CELL - 2 * PAD)
            val post = cell.post
            val thumb = post?.let { thumbs[it.postId] }
            if (thumb != null) {
                canvas.drawBitmap(thumb, null, rect, null)
            } else if (post != null) {
                canvas.drawRoundRect(rect, 12f, 12f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#D9D4CA") })
            }
            canvas.drawText(date.dayOfMonth.toString(), rect.left + 8f, rect.top + 30f, if (thumb != null) onPhoto else number)
            if (post?.status == RecordPostStatus.PENDING) canvas.drawCircle(rect.right - 14f, rect.bottom - 14f, 8f, dot)
        }
        return ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
    }

    private companion object {
        const val COLUMNS = 7
        const val CELL = 160
        const val PAD = 4f
        const val HEADER = 140
        const val WEEKDAYS = 70
    }
}

/**
 * Writes the PNG into `Pictures/Chalkak` through MediaStore (REQ-REC-038). From API 29 no permission is needed; below it the legacy
 * storage permission decides ([SaveOutcome.PermissionDenied] when it is not granted).
 */
class AndroidCalendarImageSaver(context: Context) : CalendarImageSaver {
    private val app = context.applicationContext

    override suspend fun save(fileName: String, png: ByteArray): SaveOutcome = withContext(Dispatchers.IO) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveScoped(fileName, png)
            } else if (ContextCompat.checkSelfPermission(app, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                SaveOutcome.PermissionDenied
            } else {
                saveLegacy(fileName, png)
            }
        } catch (e: SecurityException) {
            SaveOutcome.PermissionDenied
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            SaveOutcome.Failed
        }
    }

    private fun saveScoped(name: String, bytes: ByteArray): SaveOutcome {
        val resolver = app.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + FOLDER)
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val target = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: return SaveOutcome.Failed
        try {
            resolver.openOutputStream(target)?.use { it.write(bytes) } ?: error("no output stream")
            resolver.update(target, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            return SaveOutcome.Saved
        } catch (e: Exception) {
            resolver.delete(target, null, null)
            throw e
        }
    }

    @Suppress("DEPRECATION")
    private fun saveLegacy(name: String, bytes: ByteArray): SaveOutcome {
        val folder = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FOLDER)
        if (!folder.isDirectory && !folder.mkdirs()) return SaveOutcome.Failed
        val file = File(folder, name)
        file.writeBytes(bytes)
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.DATA, file.absolutePath)
        }
        return if (app.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) != null) SaveOutcome.Saved else SaveOutcome.Failed
    }

    private companion object {
        const val FOLDER = "Chalkak"
    }
}
