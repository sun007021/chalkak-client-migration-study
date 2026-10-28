package kr.chalkak.feature.upload.edit

import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Auto adjustment (appendix "자동 보정 상수 / 식"). */
object PhotoAutoAdjuster {
    private const val BINS = 256
    private const val MAX_CHANNEL = 255.0
    private const val WHITE_PERCENTILE = 0.995
    private const val MIN_WHITE = 0.05
    private const val EXPOSURE_TEMPERING = 0.6
    private const val BRIGHT_MEDIAN = 0.62
    private const val BRIGHT_SLOPE = 1.2
    private const val BLACK_PERCENTILE = 0.005
    private const val BLACK_MARGIN = 0.01
    private const val BLACK_TEMPERING = 0.8
    private const val BLACK_MAX = 0.25
    private const val DARK_LEVEL = 0.25
    private const val DARK_FULL = 0.8
    private const val SHADOWS_MAX = 0.45
    private const val BRIGHT_LEVEL = 0.85
    private const val BRIGHT_FULL = 0.3
    private const val HIGHLIGHTS_MAX = -0.5
    private const val RESPONSE_EXPONENT = 0.7
    private const val LOWER_QUARTILE = 0.25
    private const val UPPER_QUARTILE = 0.75
    private const val TARGET_SPREAD = 0.42
    private const val CONTRAST_SLOPE = 2.0
    private const val CONTRAST_MAX = 0.4
    private const val GRAY_LEVEL = 0.05
    private const val SATURATION_TARGET = 0.7
    private const val SATURATION_SLOPE = 0.6
    private const val SATURATION_MAX = 0.25
    private const val SATURATION_PERCENTILE = 0.9
    private const val MEDIAN = 0.5

    /** Null for an empty raster (analysis impossible, REQ-EDIT-027). The raster is already the <= 256 px sample. */
    fun analyze(sample: Raster): AutoAdjustments? {
        val count = sample.width * sample.height
        if (count <= 0 || sample.argb.size < count) return null
        val stats = Stats.of(sample, count)
        val exposure = exposure(stats)
        val blackPoint = blackPoint(stats, exposure)
        val afterBlack = { level: Double -> afterBlack(level, exposure, blackPoint) }
        return AutoAdjustments(
            exposure = exposure,
            contrast = contrast(stats, afterBlack),
            highlights = highlights(stats, afterBlack),
            shadows = shadows(stats, afterBlack),
            blackPoint = blackPoint,
            saturation = saturation(stats),
        )
    }

    private fun exposure(stats: Stats): Double {
        val white = stats.percentile(WHITE_PERCENTILE)
        val median = stats.percentile(MEDIAN)
        val ev = when {
            white < PhotoEditConstants.AUTO_WHITE_TARGET ->
                log2(PhotoColor.srgbToLinear(PhotoEditConstants.AUTO_WHITE_TARGET) / PhotoColor.srgbToLinear(max(white, MIN_WHITE))) * EXPOSURE_TEMPERING
            median > BRIGHT_MEDIAN -> -(median - BRIGHT_MEDIAN) * BRIGHT_SLOPE
            else -> 0.0
        }
        val limited = ev.coerceIn(PhotoEditConstants.AUTO_EXPOSURE_MIN_EV, PhotoEditConstants.AUTO_EXPOSURE_MAX_EV)
        // Spec formula as written: round2(ev / 1.5), so the cap reads 0.67 (spec overrides the EV bound).
        return round2(limited / PhotoEditConstants.EXPOSURE_EV_PER_UNIT)
    }

    private fun expose(level: Double, exposure: Double): Double =
        PhotoColor.linearToSrgb(min(1.0, PhotoColor.srgbToLinear(level) * 2.0.pow(PhotoEditConstants.EXPOSURE_EV_PER_UNIT * exposure)))

    private fun blackPoint(stats: Stats, exposure: Double): Double {
        val black = expose(stats.percentile(BLACK_PERCENTILE), exposure)
        val inputBlack = min(max(black - BLACK_MARGIN, 0.0) * BLACK_TEMPERING, BLACK_MAX)
        return round2(inputBlack / PhotoEditConstants.BLACK_POINT_RANGE)
    }

    private fun afterBlack(level: Double, exposure: Double, blackPoint: Double): Double {
        val inputBlack = max(blackPoint, 0.0) * PhotoEditConstants.BLACK_POINT_RANGE
        return ((expose(level, exposure) - inputBlack) / (1 - inputBlack)).coerceIn(0.0, 1.0)
    }

    private fun shadows(stats: Stats, afterBlack: (Double) -> Double): Double {
        val dark = stats.share { afterBlack(it) < DARK_LEVEL }
        return round2(SHADOWS_MAX * (dark / DARK_FULL).coerceIn(0.0, 1.0).pow(RESPONSE_EXPONENT))
    }

    private fun highlights(stats: Stats, afterBlack: (Double) -> Double): Double {
        val bright = stats.share { afterBlack(it) > BRIGHT_LEVEL }
        return round2(HIGHLIGHTS_MAX * (bright / BRIGHT_FULL).coerceIn(0.0, 1.0).pow(RESPONSE_EXPONENT))
    }

    private fun contrast(stats: Stats, afterBlack: (Double) -> Double): Double {
        val spread = afterBlack(stats.percentile(UPPER_QUARTILE)) - afterBlack(stats.percentile(LOWER_QUARTILE))
        return round2(((TARGET_SPREAD - spread) * CONTRAST_SLOPE).coerceIn(0.0, CONTRAST_MAX))
    }

    private fun saturation(stats: Stats): Double {
        val s = stats.spreadAtPercentile(SATURATION_PERCENTILE)
        if (s <= GRAY_LEVEL) return 0.0
        val amount = ((SATURATION_TARGET - s) * SATURATION_SLOPE).coerceIn(0.0, SATURATION_MAX)
        return round2(amount * (1 - stats.skinShare))
    }

    private fun round2(v: Double): Double = (if (v < 0) -1 else 1) * floor(kotlin.math.abs(v) * 100 + 0.5) / 100 + 0.0

    private fun log2(x: Double): Double = ln(x) / ln(2.0)

    /** Brightness histogram plus the per-pixel colour spreads and skin share of one sample. */
    private class Stats(private val histogram: IntArray, private val spreads: DoubleArray, val skinShare: Double) {
        private val total = histogram.sum()

        /** `P(f)`: first bin whose cumulative share reaches [fraction], as bin / 255 (1.0 when none). */
        fun percentile(fraction: Double): Double {
            var cumulative = 0
            for (bin in histogram.indices) {
                cumulative += histogram[bin]
                if (cumulative.toDouble() / total >= fraction) return bin / MAX_CHANNEL
            }
            return 1.0
        }

        /** Share of pixels whose brightness level satisfies [test]. */
        fun share(test: (Double) -> Boolean): Double =
            histogram.indices.sumOf { if (test(it / MAX_CHANNEL)) histogram[it] else 0 }.toDouble() / total

        fun spreadAtPercentile(fraction: Double): Double {
            val index = (ceil(fraction * spreads.size).toInt() - 1).coerceIn(0, spreads.size - 1)
            return spreads[index]
        }

        companion object {
            fun of(sample: Raster, count: Int): Stats {
                val histogram = IntArray(BINS)
                val spreads = DoubleArray(count)
                var skin = 0
                for (i in 0 until count) {
                    val p = sample.argb[i]
                    val r = ((p shr 16) and 0xFF) / MAX_CHANNEL
                    val g = ((p shr 8) and 0xFF) / MAX_CHANNEL
                    val b = (p and 0xFF) / MAX_CHANNEL
                    val luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                    histogram[min(BINS - 1, floor(luma * MAX_CHANNEL + 0.5).toInt())]++
                    spreads[i] = max(r, max(g, b)) - min(r, min(g, b))
                    if (isSkin(r, g, b)) skin++
                }
                spreads.sort()
                return Stats(histogram, spreads, skin.toDouble() / count)
            }

            private fun isSkin(r: Double, g: Double, b: Double): Boolean {
                if (r < g || g < b || r < SKIN_MIN_RED) return false
                val ratio = (r - b) / r
                if (ratio < SKIN_MIN_RATIO || ratio > SKIN_MAX_RATIO) return false
                val hue = SKIN_HUE_SCALE * (g - b) / (r - b)
                return hue <= SKIN_MAX_HUE
            }

            private const val SKIN_MIN_RED = 0.2
            private const val SKIN_MIN_RATIO = 0.1
            private const val SKIN_MAX_RATIO = 0.6
            private const val SKIN_HUE_SCALE = 60.0
            private const val SKIN_MAX_HUE = 50.0
        }
    }
}
