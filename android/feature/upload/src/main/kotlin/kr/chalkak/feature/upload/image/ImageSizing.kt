package kr.chalkak.feature.upload.image

import kr.chalkak.core.common.AppConstants
import kotlin.math.floor

/** Pure size math of the upload image pipeline (REQ-UPL-027, REQ-UPL-031, REQ-EDIT-007). */
object ImageSizing {
    /**
     * Smallest power-of-two sample size (1, 2, 4...) such that the sampled long edge is <= [maxLongEdge]. 1 when [size]
     * already fits (never enlarges). 8000x6000 -> 2, 4608x3456 -> 2, 4096x3072 -> 1, 4097x3000 -> 2.
     */
    fun sampleSize(size: ImageSize, maxLongEdge: Int = AppConstants.POST_IMAGE_MAX_LONG_EDGE): Int {
        var sample = 1
        while (sampled(size, sample).longEdge > maxLongEdge) sample *= 2
        return sample
    }

    /** Size after decoding with [sampleSize]: each side `ceil(side / sampleSize)` (4097x3000 / 2 = 2049x1500). */
    fun sampled(size: ImageSize, sampleSize: Int): ImageSize = ImageSize(ceilDiv(size.width, sampleSize), ceilDiv(size.height, sampleSize))

    /** One 0.85x round: each side `round(side * factor)` (half up), at least 1. */
    fun shrunk(size: ImageSize, factor: Double = AppConstants.WEBP_DOWNSCALE_FACTOR): ImageSize =
        ImageSize(scaled(size.width, factor), scaled(size.height, factor))

    /**
     * Scales proportionally so the long edge is [maxLongEdge] (rounded, at least 1). A smaller image is returned unchanged
     * (never enlarged). Used for the editor preview (1440) and exact limits.
     */
    fun fitLongEdge(size: ImageSize, maxLongEdge: Int): ImageSize {
        if (size.longEdge <= maxLongEdge) return size
        val factor = maxLongEdge.toDouble() / size.longEdge
        return ImageSize(scaled(size.width, factor), scaled(size.height, factor))
    }

    private fun ceilDiv(side: Int, divisor: Int): Int = (side + divisor - 1) / divisor

    /** Half-up rounding, never below one pixel. */
    private fun scaled(side: Int, factor: Double): Int = maxOf(1, floor(side * factor + HALF).toInt())

    private const val HALF = 0.5
}
