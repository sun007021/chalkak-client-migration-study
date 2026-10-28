package kr.chalkak.feature.upload.image

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kr.chalkak.core.common.AppConstants
import kr.chalkak.feature.upload.edit.PhotoEdit

sealed interface EncodeOutcome {
    /** [round] is 0 for the first (unscaled) round; [quality] is the ladder step that fit; [size] the pixel size that was compressed. */
    data class Encoded(val bytes: ByteArray, val size: ImageSize, val quality: Int, val round: Int) : EncodeOutcome

    /** [PhotoCodec.readBounds] returned null or the platform decoder threw (REQ-UPL-018). */
    data object Unreadable : EncodeOutcome

    /** 4 rounds x 4 qualities all exceeded `maxBytes` (REQ-UPL-032). */
    data object SizeLimitExceeded : EncodeOutcome
}

/**
 * Original photo -> WebP bytes <= maxBytes. Order (PIE): [PhotoCodec.readBounds] (header only) -> [PhotoCodec.decode] with
 * `ImageSizing.sampleSize` (never a full-resolution decode, TC-UPL-035) -> [PhotoCodec.render] ONLY when the edit is not
 * identity (REQ-UPL-028, TC-EDIT-011) -> compress ladder. Ladder: for round 0..[maxRounds)-1, size = `ImageSizing.shrunk` applied
 * `round` times to the sampled/rendered size (via [PhotoCodec.scale] from the same source, never rescaling a scaled copy
 * more than needed), qualities `AppConstants.WEBP_QUALITY_LADDER` in order; the first result with `bytes.size <= maxBytes`
 * wins (exactly maxBytes is OK, TC-UPL-039). Only one lossy compress per ladder step (TC-EDIT-010). Cancellation is checked
 * before every compress so a cancelled encode makes no further compressor call (TC-UPL-046). Every [DecodedImage] it
 * creates is released.
 */
class PostImageEncoder(
    private val codec: PhotoCodec,
    private val compressor: WebpCompressor,
) {
    suspend fun encode(photo: PickedPhoto, edit: PhotoEdit, maxBytes: Long): EncodeOutcome {
        val owned = mutableListOf<DecodedImage>()
        try {
            return ladder(prepareBase(photo, edit, owned) ?: return EncodeOutcome.Unreadable, maxBytes, owned)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Any platform decoder / renderer / compressor failure means this photo cannot be turned into a WebP (REQ-UPL-018).
            return EncodeOutcome.Unreadable
        } finally {
            owned.forEach(DecodedImage::release)
        }
    }

    /** Header probe, sampled decode, and the single redraw of a non-identity edit. Null = unreadable. */
    private suspend fun prepareBase(photo: PickedPhoto, edit: PhotoEdit, owned: MutableList<DecodedImage>): DecodedImage? {
        val bounds = codec.readBounds(photo) ?: return null
        val decoded = codec.decode(photo, ImageSizing.sampleSize(bounds)).also(owned::add)
        return if (edit.isIdentity) decoded else codec.render(decoded, edit).also(owned::add)
    }

    private suspend fun ladder(base: DecodedImage, maxBytes: Long, owned: MutableList<DecodedImage>): EncodeOutcome {
        var size = base.size
        for (round in 0 until MAX_ROUNDS) {
            if (round > 0) size = ImageSizing.shrunk(size)
            val image = if (round == 0) base else codec.scale(base, size).also(owned::add)
            for (quality in AppConstants.WEBP_QUALITY_LADDER) {
                currentCoroutineContext().ensureActive()
                val bytes = compressor.compress(image, quality)
                if (bytes.size <= maxBytes) return EncodeOutcome.Encoded(bytes, size, quality, round)
            }
            if (round > 0) image.release()
        }
        return EncodeOutcome.SizeLimitExceeded
    }

    private companion object {
        const val MAX_ROUNDS = AppConstants.WEBP_DOWNSCALE_MAX_ATTEMPTS + 1
    }
}
