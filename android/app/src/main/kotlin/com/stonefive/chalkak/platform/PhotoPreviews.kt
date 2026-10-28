package com.stonefive.chalkak.platform

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.withTransform
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.chalkak.feature.upload.edit.AutoAdjustments
import kr.chalkak.feature.upload.edit.CropWindow
import kr.chalkak.feature.upload.edit.EditImageSession
import kr.chalkak.feature.upload.edit.EditImageSource
import kr.chalkak.feature.upload.edit.PhotoAutoAdjuster
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditConstants
import kr.chalkak.feature.upload.edit.PhotoEditTransform
import kr.chalkak.feature.upload.edit.PhotoFilter
import kr.chalkak.feature.upload.edit.Raster
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.ImageSizing
import kr.chalkak.feature.upload.image.PhotoCodec
import kr.chalkak.feature.upload.image.PickedPhoto

/** A display-sized, upright bitmap (<= 1440 px long edge) and the oriented size of the original it came from. */
class PreviewBitmap(val bitmap: Bitmap, val originalSize: ImageSize)

/**
 * Decodes the preview bitmap of a photo (EXIF applied, long edge <= 1440). The last decoded photo is kept, because the upload
 * screen, the editor session and the editor preview ask for the same one in a row. Bitmaps handed out are never recycled here.
 */
class PhotoPreviews(private val bitmaps: OrientedBitmaps, private val maxLongEdge: Int = PhotoEditConstants.PREVIEW_MAX_LONG_EDGE) {
    private val lock = Any()
    private var last: Pair<String, PreviewBitmap>? = null

    suspend fun get(photo: PickedPhoto): PreviewBitmap? {
        synchronized(lock) { last?.takeIf { it.first == photo.id }?.let { return it.second } }
        val loaded = withContext(Dispatchers.IO) { decode(photo) } ?: return null
        synchronized(lock) { last = photo.id to loaded }
        return loaded
    }

    private fun decode(photo: PickedPhoto): PreviewBitmap? = try {
        val original = bitmaps.bounds(photo)
        if (original == null) {
            null
        } else {
            val decoded = bitmaps.decode(photo, ImageSizing.sampleSize(original, maxLongEdge))
            val fitted = ImageSizing.fitLongEdge(ImageSize(decoded.width, decoded.height), maxLongEdge)
            val bitmap = if (fitted.width == decoded.width && fitted.height == decoded.height) {
                decoded
            } else {
                Bitmap.createScaledBitmap(decoded, fitted.width, fitted.height, true).also { decoded.recycle() }
            }
            PreviewBitmap(bitmap, original)
        }
    } catch (e: java.io.IOException) {
        null
    } catch (e: IllegalStateException) {
        null
    } catch (e: OutOfMemoryError) {
        null
    }
}

class AndroidPhotoPreviewLoader(private val previews: PhotoPreviews) : PhotoPreviewLoader {
    override suspend fun load(photo: PickedPhoto): PhotoPreview? =
        previews.get(photo)?.let { PhotoPreview(it.bitmap.asImageBitmap(), it.originalSize) }
}

/** Editor session over the preview bitmap: the auto analysis runs on a <= 256 px sample of the cropped region, the full render through [codec]. */
class AndroidEditImageSource(private val previews: PhotoPreviews, private val codec: PhotoCodec) : EditImageSource {
    override suspend fun open(photo: PickedPhoto): EditImageSession? {
        val preview = previews.get(photo) ?: return null
        return object : EditImageSession {
            override val size: ImageSize = preview.originalSize

            override suspend fun analyzeAuto(quarterTurns: Int, crop: CropWindow): AutoAdjustments? = withContext(Dispatchers.Default) {
                val region = BitmapGeometry.rotateAndCrop(preview.bitmap, quarterTurns, crop)
                val target = ImageSizing.fitLongEdge(ImageSize(region.width, region.height), PhotoEditConstants.AUTO_ANALYSIS_LONG_EDGE)
                val sample = if (target.width == region.width && target.height == region.height) {
                    region
                } else {
                    Bitmap.createScaledBitmap(region, target.width, target.height, true)
                }
                val pixels = IntArray(sample.width * sample.height).also { sample.getPixels(it, 0, sample.width, 0, 0, sample.width, sample.height) }
                val raster = Raster(sample.width, sample.height, pixels)
                if (sample !== region && sample !== preview.bitmap) sample.recycle()
                if (region !== preview.bitmap) region.recycle()
                PhotoAutoAdjuster.analyze(raster)
            }

            override suspend fun renderFull(edit: PhotoEdit) {
                val bounds = codec.readBounds(photo) ?: throw IllegalStateException("photo unreadable")
                val decoded = codec.decode(photo, ImageSizing.sampleSize(bounds))
                try {
                    codec.render(decoded, edit).release()
                } finally {
                    decoded.release()
                }
            }

            override fun close() = Unit
        }
    }
}

/**
 * Editor / upload-screen preview: the preview bitmap with the adjustments baked in on a background thread (`PixelPipeline`, the last
 * result stays on screen while a slider moves), turned and cropped by the canvas transform, and the filter applied on the GPU with
 * `ColorFilter.colorMatrix(FilterColorMatrices)`.
 */
class ComposeEditPreviewPainter(private val previews: PhotoPreviews) : EditPreviewPainter {
    @Composable
    override fun Preview(photo: PickedPhoto, edit: PhotoEdit, modifier: Modifier) {
        var base by remember(photo.id) { mutableStateOf<PreviewBitmap?>(null) }
        LaunchedEffect(photo.id) { base = previews.get(photo) }
        val values = remember(edit.adjustments) { edit.adjustments.toValues() }
        var shown by remember(photo.id) { mutableStateOf<ImageBitmap?>(null) }
        LaunchedEffect(base, values) {
            val loaded = base ?: return@LaunchedEffect
            shown = if (PixelPipeline.isNeutral(values)) {
                loaded.bitmap.asImageBitmap()
            } else {
                withContext(Dispatchers.Default) {
                    val copy = loaded.bitmap.copy(Bitmap.Config.ARGB_8888, true)
                    PixelPipeline.applyInPlace(copy, values, PhotoFilter.ORIGINAL)
                    copy.asImageBitmap()
                }
            }
        }
        val filter = remember(edit.filter) { FilterColorMatrices.of(edit.filter)?.let { ColorFilter.colorMatrix(ColorMatrix(it)) } }
        val image = shown
        Canvas(modifier) {
            if (image == null) return@Canvas
            val source = ImageSize(image.width, image.height)
            val turns = edit.quarterTurns.mod(PhotoEdit.QUARTER_TURNS)
            val turned = PhotoEditTransform.rotatedSize(source, turns)
            val frame = PhotoEditTransform.frameFor(source, turns, edit.crop)
            val cropLeft = ((frame.centerX - frame.width / 2) * turned.width).toFloat()
            val cropTop = ((frame.centerY - frame.height / 2) * turned.height).toFloat()
            val cropWidth = (frame.width * turned.width).toFloat().coerceAtLeast(1f)
            val cropHeight = (frame.height * turned.height).toFloat().coerceAtLeast(1f)
            val scale = minOf(size.width / cropWidth, size.height / cropHeight)
            val shiftX = if (turns == 1) source.height.toFloat() else if (turns == 2) source.width.toFloat() else 0f
            val shiftY = if (turns == 2) source.height.toFloat() else if (turns == 3) source.width.toFloat() else 0f
            clipRect {
                withTransform({
                    scale(scale, scale, pivot = Offset.Zero)
                    translate(-cropLeft, -cropTop)
                    translate(shiftX, shiftY)
                    rotate(90f * turns, pivot = Offset.Zero)
                }) {
                    drawImage(image, Offset.Zero, colorFilter = filter)
                }
            }
        }
    }
}
