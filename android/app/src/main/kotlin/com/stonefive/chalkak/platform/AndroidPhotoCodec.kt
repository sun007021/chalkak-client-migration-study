package com.stonefive.chalkak.platform

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Build
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kr.chalkak.feature.upload.edit.CropWindow
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditTransform
import kr.chalkak.feature.upload.image.DecodedImage
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PhotoCodec
import kr.chalkak.feature.upload.image.PickedPhoto
import kr.chalkak.feature.upload.image.WebpCompressor
import java.io.ByteArrayOutputStream
import java.io.InputStream
import kotlin.math.roundToInt

/** Opens the content behind a [PickedPhoto] (`id` = content URI string). */
class PhotoSources(private val resolver: ContentResolver) {
    fun open(photo: PickedPhoto): InputStream? = resolver.openInputStream(Uri.parse(photo.id))

    fun bytes(photo: PickedPhoto): ByteArray? = open(photo)?.use { it.readBytes() }
}

/** EXIF-aware bitmap access: sizes are the DISPLAYED (oriented) sizes, decoded bitmaps are already turned upright. */
class OrientedBitmaps(private val sources: PhotoSources) {
    /** Header only. Null = empty, unreadable or not an image. */
    fun bounds(photo: PickedPhoto): ImageSize? {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        sources.open(photo)?.use { BitmapFactory.decodeStream(it, null, options) } ?: return null
        if (options.outWidth <= 0 || options.outHeight <= 0) return null
        val exif = exif(photo)
        return if (exif.swapsSides()) ImageSize(options.outHeight, options.outWidth) else ImageSize(options.outWidth, options.outHeight)
    }

    /** Decodes with a power-of-two [sampleSize] and applies the EXIF rotation / flip. Throws when the image cannot be decoded. */
    fun decode(photo: PickedPhoto, sampleSize: Int): Bitmap {
        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val decoded = sources.open(photo)?.use { BitmapFactory.decodeStream(it, null, options) }
            ?: throw IllegalStateException("cannot decode ${photo.source}")
        val matrix = exif(photo).matrix() ?: return decoded
        val turned = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        if (turned !== decoded) decoded.recycle()
        return turned
    }

    private fun exif(photo: PickedPhoto): ExifInterface? = try {
        sources.open(photo)?.use { ExifInterface(it) }
    } catch (e: java.io.IOException) {
        null // no readable metadata: upright
    }

    private fun ExifInterface?.swapsSides(): Boolean = this != null && rotationDegrees % 180 != 0

    private fun ExifInterface?.matrix(): Matrix? {
        if (this == null || (rotationDegrees == 0 && !isFlipped)) return null
        return Matrix().apply {
            if (isFlipped) postScale(-1f, 1f)
            postRotate(rotationDegrees.toFloat())
        }
    }
}

/** Rotate / crop geometry shared by the full render, the auto analysis and the preview. */
internal object BitmapGeometry {
    /** [source] turned by [quarterTurns] and cut to [crop] (fractions as in `CropWindow`). Never recycles [source]; may return it. */
    fun rotateAndCrop(source: Bitmap, quarterTurns: Int, crop: CropWindow): Bitmap {
        val turns = quarterTurns.mod(PhotoEdit.QUARTER_TURNS)
        val size = ImageSize(source.width, source.height)
        val rotated = if (turns == 0) {
            source
        } else {
            Bitmap.createBitmap(source, 0, 0, source.width, source.height, Matrix().apply { postRotate(90f * turns) }, true)
        }
        if (crop.isFull()) return rotated
        val turned = PhotoEditTransform.rotatedSize(size, turns)
        val frame = PhotoEditTransform.frameFor(size, turns, crop)
        val out = PhotoEditTransform.outputSize(size, turns, crop)
        val left = ((frame.centerX - frame.width / 2) * turned.width).roundToInt().coerceIn(0, turned.width - 1)
        val top = ((frame.centerY - frame.height / 2) * turned.height).roundToInt().coerceIn(0, turned.height - 1)
        val width = out.width.coerceIn(1, turned.width - left)
        val height = out.height.coerceIn(1, turned.height - top)
        val cropped = Bitmap.createBitmap(rotated, left, top, width, height)
        if (rotated !== source && cropped !== rotated) rotated.recycle()
        return cropped
    }
}

/** Decoded pixels owned by the logic until [release]. */
class AndroidDecodedImage(val bitmap: Bitmap) : DecodedImage {
    override val size: ImageSize get() = ImageSize(bitmap.width, bitmap.height)

    override fun release() {
        if (!bitmap.isRecycled) bitmap.recycle()
    }
}

/** `PhotoCodec` over `BitmapFactory` / `ExifInterface` / `Bitmap` (upload encoder, editor full render). */
class AndroidPhotoCodec(private val bitmaps: OrientedBitmaps) : PhotoCodec {
    override suspend fun readBounds(photo: PickedPhoto): ImageSize? = withContext(Dispatchers.IO) { bitmaps.bounds(photo) }

    override suspend fun decode(photo: PickedPhoto, sampleSize: Int): DecodedImage =
        withContext(Dispatchers.IO) { AndroidDecodedImage(bitmaps.decode(photo, sampleSize)) }

    override suspend fun render(source: DecodedImage, edit: PhotoEdit): DecodedImage = withContext(Dispatchers.Default) {
        val input = (source as AndroidDecodedImage).bitmap
        val shaped = BitmapGeometry.rotateAndCrop(input, edit.quarterTurns, edit.crop)
        // The pixel stage writes in place: it needs a copy of the source itself, never the source (the caller still owns it).
        val target = if (shaped !== input && shaped.isMutable) {
            shaped
        } else {
            shaped.copy(Bitmap.Config.ARGB_8888, true).also { if (shaped !== input) shaped.recycle() }
        }
        PixelPipeline.applyInPlace(target, edit.adjustments.toValues(), edit.filter)
        AndroidDecodedImage(target)
    }

    override suspend fun scale(source: DecodedImage, target: ImageSize): DecodedImage = withContext(Dispatchers.Default) {
        AndroidDecodedImage(Bitmap.createScaledBitmap((source as AndroidDecodedImage).bitmap, target.width, target.height, true))
    }
}

/** Lossy WebP (`WEBP_LOSSY` from API 30, the legacy `WEBP` below, which is lossy as well). */
class AndroidWebpCompressor : WebpCompressor {
    override suspend fun compress(image: DecodedImage, quality: Int): ByteArray = withContext(Dispatchers.Default) {
        val out = ByteArrayOutputStream()
        val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else legacyWebp()
        check((image as AndroidDecodedImage).bitmap.compress(format, quality, out)) { "WebP compression failed" }
        out.toByteArray()
    }

    @Suppress("DEPRECATION")
    private fun legacyWebp(): Bitmap.CompressFormat = Bitmap.CompressFormat.WEBP
}
