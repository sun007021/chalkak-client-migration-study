package kr.chalkak.feature.upload.image

import kr.chalkak.feature.upload.edit.PhotoEdit

/** Pixel size. [longEdge] is the bigger side. */
data class ImageSize(val width: Int, val height: Int) {
    val longEdge: Int get() = maxOf(width, height)
}

enum class PhotoSource { ALBUM, CAMERA }

/**
 * Opaque handle to a photo the user picked or captured. The platform adapter owns the content (a content URI / file);
 * the JVM logic only passes the handle back to [PhotoCodec] / [EditImageSource].
 */
data class PickedPhoto(val id: String, val source: PhotoSource)

/** Decoded, EXIF-oriented pixels owned by the platform adapter. [release] frees them (called by the logic when done). */
interface DecodedImage {
    val size: ImageSize
    fun release()
}

/**
 * Platform image access (Android: BitmapFactory / ExifInterface / Canvas). Every function may throw when the platform
 * decoder fails; the encoder maps that to [EncodeOutcome.Unreadable].
 */
interface PhotoCodec {
    /**
     * Reads ONLY the header. The size is the displayed (EXIF-oriented) size, so orientation 5..8 swaps width/height.
     * Null = unreadable, empty or corrupt (TC-UPL-021). Must not allocate the full-resolution bitmap (TC-UPL-035).
     */
    suspend fun readBounds(photo: PickedPhoto): ImageSize?

    /** Decodes with a power-of-two [sampleSize] (1, 2, 4...), EXIF rotation applied (REQ-UPL-027). */
    suspend fun decode(photo: PickedPhoto, sampleSize: Int): DecodedImage

    /** Redraws [source] with [edit] in the PIE order rotate -> crop -> adjustments -> filter. Output size = `PhotoEditTransform.outputSize`. */
    suspend fun render(source: DecodedImage, edit: PhotoEdit): DecodedImage

    /** Resizes to exactly [target] (used for the 0.85x rounds). */
    suspend fun scale(source: DecodedImage, target: ImageSize): DecodedImage
}

/** Lossy still-image WebP compression at a quality 1..100 (Android: `Bitmap.compress(WEBP_LOSSY, q)`). The ONLY lossy step (REQ-UPL-029). */
fun interface WebpCompressor {
    suspend fun compress(image: DecodedImage, quality: Int): ByteArray
}
