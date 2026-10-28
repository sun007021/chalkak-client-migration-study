package kr.chalkak.feature.upload.edit

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.sin

/** 8-bit colour. Channels 0..255. */
data class Rgba(val r: Int, val g: Int, val b: Int, val a: Int = 255)

/** Tone curve stages (appendix "톤 곡선"). All inputs / outputs 0..1 in stored (sRGB) values. */
object ToneCurve {
    private const val TABLE_SIZE = 256

    /** `t - v * 0.6 * sin(2 pi t) / (2 pi)`. */
    fun contrast(t: Double, v: Double): Double = t - v * PhotoEditConstants.CONTRAST_AMOUNT * sin(2 * PI * t) / (2 * PI)

    /** `t + v * 0.25 * 4 * t * (1 - t)^2`. */
    fun shadows(t: Double, v: Double): Double = t + v * PhotoEditConstants.SHADOWS_AMOUNT * 4 * t * (1 - t) * (1 - t)

    /** `t + v * 0.25 * 4 * t^2 * (1 - t)`. */
    fun highlights(t: Double, v: Double): Double = t + v * PhotoEditConstants.HIGHLIGHTS_AMOUNT * 4 * t * t * (1 - t)

    /**
     * 256-entry table: input `i / 255`, black point stretch (inputBlack = max(bp, 0) * 0.3), then shadows, highlights, contrast,
     * `y = outputBlack + (1 - outputBlack) * clamp(t)` with outputBlack = max(-bp, 0) * 0.3, then a running maximum so the
     * table never decreases. Starts at outputBlack, ends at 1.
     */
    fun table(blackPoint: Double, shadows: Double, highlights: Double, contrast: Double): DoubleArray {
        val inputBlack = max(blackPoint, 0.0) * PhotoEditConstants.BLACK_POINT_RANGE
        val outputBlack = max(-blackPoint, 0.0) * PhotoEditConstants.BLACK_POINT_RANGE
        val table = DoubleArray(TABLE_SIZE)
        var floorValue = 0.0
        for (i in 0 until TABLE_SIZE) {
            val x = i / (TABLE_SIZE - 1.0)
            var t = ((x - inputBlack) / (1 - inputBlack)).coerceIn(0.0, 1.0)
            t = contrast(highlights(shadows(t, shadows), highlights), contrast)
            val y = outputBlack + (1 - outputBlack) * t.coerceIn(0.0, 1.0)
            floorValue = max(floorValue, y)
            table[i] = floorValue
        }
        return table
    }

    /** Linear interpolation between the two nearest table entries for a stored value 0..1. */
    internal fun lookup(table: DoubleArray, stored: Double): Double {
        val pos = stored.coerceIn(0.0, 1.0) * (TABLE_SIZE - 1)
        val lower = floor(pos).toInt().coerceAtMost(TABLE_SIZE - 2)
        return table[lower] + (table[lower + 1] - table[lower]) * (pos - lower)
    }
}

/** Pixel pipeline: linear stage -> stored stage with tone table -> filter matrix (REQ-EDIT-008, appendix "sRGB 변환과 처리 순서"). */
object PhotoColor {
    private const val MAX_CHANNEL = 255.0
    private const val SRGB_LINEAR_CUTOFF = 0.04045
    private const val LINEAR_SRGB_CUTOFF = 0.0031308
    private const val SRGB_LINEAR_SLOPE = 12.92
    private const val SRGB_OFFSET = 0.055
    private const val SRGB_SCALE = 1.055
    private const val SRGB_GAMMA = 2.4
    private const val LUMA_R = 0.2125
    private const val LUMA_G = 0.7154
    private const val LUMA_B = 0.0721
    private const val HALF = 0.5

    fun srgbToLinear(x: Double): Double =
        if (x <= SRGB_LINEAR_CUTOFF) x / SRGB_LINEAR_SLOPE else ((x + SRGB_OFFSET) / SRGB_SCALE).pow(SRGB_GAMMA)

    fun linearToSrgb(x: Double): Double =
        if (x <= LINEAR_SRGB_CUTOFF) SRGB_LINEAR_SLOPE * x else SRGB_SCALE * x.pow(1 / SRGB_GAMMA) - SRGB_OFFSET

    /** Stage 1: exposure `2^(1.5 v)` and warmth (R x (1 + 0.25 w), B x (1 - 0.25 w)) on linear values, then saturation around linear luminance. Returns stored (sRGB) 0..1 values r, g, b. */
    fun linearStage(pixel: Rgba, values: AdjustValues): DoubleArray {
        val gain = 2.0.pow(PhotoEditConstants.EXPOSURE_EV_PER_UNIT * values.exposure)
        val r = srgbToLinear(pixel.r / MAX_CHANNEL) * gain * (1 + PhotoEditConstants.WARMTH_GAIN * values.warmth)
        val g = srgbToLinear(pixel.g / MAX_CHANNEL) * gain
        val b = srgbToLinear(pixel.b / MAX_CHANNEL) * gain * (1 - PhotoEditConstants.WARMTH_GAIN * values.warmth)
        val luminance = LUMA_R * r + LUMA_G * g + LUMA_B * b
        return doubleArrayOf(r, g, b).map { c ->
            linearToSrgb((luminance + (1 + values.saturation) * (c - luminance)).coerceIn(0.0, 1.0))
        }.toDoubleArray()
    }

    /** Stage 3: 4x5 matrix on 0..255 values, rounded half up and clamped to 0..255. [PhotoFilter.ORIGINAL] returns [pixel]. */
    fun applyFilter(pixel: Rgba, filter: PhotoFilter): Rgba {
        val m = filter.matrix ?: return pixel
        val input = doubleArrayOf(pixel.r.toDouble(), pixel.g.toDouble(), pixel.b.toDouble(), pixel.a.toDouble())
        fun row(index: Int): Int {
            val base = index * ROW_WIDTH
            val sum = (0 until ROW_WIDTH - 1).sumOf { m[base + it] * input[it] } + m[base + ROW_WIDTH - 1]
            return floor(sum + HALF).toInt().coerceIn(0, MAX_CHANNEL.toInt())
        }
        return Rgba(row(0), row(1), row(2), row(3))
    }

    /** Whole pipeline for one pixel (alpha untouched by the adjustment stages). All-zero [values] and ORIGINAL return [pixel] unchanged. */
    fun apply(pixel: Rgba, values: AdjustValues, filter: PhotoFilter): Rgba {
        val adjusted = if (isNeutral(values)) pixel else adjust(pixel, values)
        return applyFilter(adjusted, filter)
    }

    private fun adjust(pixel: Rgba, values: AdjustValues): Rgba {
        val stored = linearStage(pixel, values)
        val table = ToneCurve.table(values.blackPoint, values.shadows, values.highlights, values.contrast)
        fun channel(i: Int) = floor(ToneCurve.lookup(table, stored[i]) * MAX_CHANNEL + HALF).toInt().coerceIn(0, MAX_CHANNEL.toInt())
        return Rgba(channel(0), channel(1), channel(2), pixel.a)
    }

    private fun isNeutral(v: AdjustValues) =
        listOf(v.exposure, v.contrast, v.highlights, v.shadows, v.blackPoint, v.saturation, v.warmth).all { abs(it) < 1e-12 }

    private const val ROW_WIDTH = 5
}

/** ARGB pixels, row-major, `argb.size == width * height`. */
class Raster(val width: Int, val height: Int, val argb: IntArray) {
    companion object {
        fun solid(width: Int, height: Int, rgb: Int): Raster = Raster(width, height, IntArray(width * height) { (0xFF shl 24) or (rgb and 0xFFFFFF) })
    }
}
