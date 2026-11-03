package com.stonefive.chalkak.platform

import android.graphics.Bitmap
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kr.chalkak.feature.upload.edit.AdjustValues
import kr.chalkak.feature.upload.edit.PhotoColor
import kr.chalkak.feature.upload.edit.PhotoEditConstants
import kr.chalkak.feature.upload.edit.PhotoFilter
import kr.chalkak.feature.upload.edit.ToneCurve
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.pow

/**
 * The shared colour pipeline (linear stage -> sRGB -> tone table -> filter matrix, `PhotoColor`) on a bitmap, with lookup tables instead
 * of per-pixel `pow`. Tone tables are cached per value combination (a slider drag asks for the same table many times).
 */
object PixelPipeline {
    private const val BAND_ROWS = 128
    private const val MAX = 255
    private const val LINEAR_STEPS = 4096
    private const val TABLE_CACHE = 16

    private val srgbToLinear = DoubleArray(256) { PhotoColor.srgbToLinear(it / 255.0) }
    private val linearToSrgb = DoubleArray(LINEAR_STEPS + 1) { PhotoColor.linearToSrgb(it / LINEAR_STEPS.toDouble()) }
    private val tables = object : LinkedHashMap<List<Double>, DoubleArray>(TABLE_CACHE, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<List<Double>, DoubleArray>?) = size > TABLE_CACHE
    }

    /** The tone table of [v], built once per combination (`ToneCurve.table`). */
    fun toneTable(v: AdjustValues): DoubleArray {
        val key = listOf(v.blackPoint, v.shadows, v.highlights, v.contrast)
        synchronized(tables) { tables[key]?.let { return it } }
        val built = ToneCurve.table(v.blackPoint, v.shadows, v.highlights, v.contrast)
        synchronized(tables) { tables[key] = built }
        return built
    }

    fun isNeutral(v: AdjustValues): Boolean =
        listOf(v.exposure, v.contrast, v.highlights, v.shadows, v.blackPoint, v.saturation, v.warmth).all { abs(it) < 1e-12 }

    /** Applies [values] and [filter] to every pixel of the mutable [bitmap] in place, band by band (cancellable between bands). */
    suspend fun applyInPlace(bitmap: Bitmap, values: AdjustValues, filter: PhotoFilter) {
        val adjust = !isNeutral(values)
        val matrix = filter.matrix
        if (!adjust && matrix == null) return
        val width = bitmap.width
        val band = IntArray(width * BAND_ROWS)
        val gain = 2.0.pow(PhotoEditConstants.EXPOSURE_EV_PER_UNIT * values.exposure)
        val redGain = gain * (1 + PhotoEditConstants.WARMTH_GAIN * values.warmth)
        val blueGain = gain * (1 - PhotoEditConstants.WARMTH_GAIN * values.warmth)
        val table = if (adjust) toneTable(values) else DoubleArray(0)
        var top = 0
        while (top < bitmap.height) {
            currentCoroutineContext().ensureActive()
            val rows = minOf(BAND_ROWS, bitmap.height - top)
            bitmap.getPixels(band, 0, width, 0, top, width, rows)
            for (i in 0 until width * rows) {
                var p = band[i]
                if (adjust) p = adjustPixel(p, redGain, gain, blueGain, values.saturation, table)
                if (matrix != null) p = filterPixel(p, matrix)
                band[i] = p
            }
            bitmap.setPixels(band, 0, width, 0, top, width, rows)
            top += rows
        }
    }

    private fun adjustPixel(p: Int, redGain: Double, gain: Double, blueGain: Double, saturation: Double, table: DoubleArray): Int {
        val r = srgbToLinear[(p shr 16) and MAX] * redGain
        val g = srgbToLinear[(p shr 8) and MAX] * gain
        val b = srgbToLinear[p and MAX] * blueGain
        val luminance = 0.2125 * r + 0.7154 * g + 0.0721 * b
        val k = 1 + saturation
        return (p and ALPHA_MASK) or
            (channel(luminance + k * (r - luminance), table) shl 16) or
            (channel(luminance + k * (g - luminance), table) shl 8) or
            channel(luminance + k * (b - luminance), table)
    }

    /** linear 0..1 -> stored sRGB -> tone table -> 0..255 (half up). */
    private fun channel(linear: Double, table: DoubleArray): Int {
        val index = (linear.coerceIn(0.0, 1.0) * LINEAR_STEPS + 0.5).toInt()
        val stored = linearToSrgb[index]
        val pos = stored.coerceIn(0.0, 1.0) * (table.size - 1)
        val lower = floor(pos).toInt().coerceAtMost(table.size - 2)
        val toned = table[lower] + (table[lower + 1] - table[lower]) * (pos - lower)
        return floor(toned * MAX + 0.5).toInt().coerceIn(0, MAX)
    }

    private fun filterPixel(p: Int, m: List<Double>): Int {
        val r = ((p shr 16) and MAX).toDouble()
        val g = ((p shr 8) and MAX).toDouble()
        val b = (p and MAX).toDouble()
        fun row(base: Int) = floor(m[base] * r + m[base + 1] * g + m[base + 2] * b + m[base + 4] + 0.5).toInt().coerceIn(0, MAX)
        return (p and ALPHA_MASK) or (row(0) shl 16) or (row(5) shl 8) or row(10)
    }

    private const val ALPHA_MASK = 0xFF shl 24
}
