package com.stonefive.chalkak.platform

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import kr.chalkak.core.common.AppConstants
import kr.chalkak.feature.onboarding.CanvasSize
import kr.chalkak.feature.onboarding.SignatureImageEncoder
import kr.chalkak.feature.onboarding.SignaturePoint
import kr.chalkak.feature.onboarding.SignatureStroke
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min

/**
 * Android counterpart of the pure `SignaturePngEncoder` (java.awt does not exist on Android): same rules (REQ-SIGN-006/007) with
 * `android.graphics`. 1024x512 ARGB PNG, transparent background, white strokes of 14px with round caps and joins, quadratic smoothing
 * through the midpoints, the ink box normalised against [CanvasSize] (side < 0.02 counts as 0.02), fitted aspect-preserving and
 * centred inside the 48px padding. A single point is a filled circle. Empty input -> IllegalArgumentException.
 */
class AndroidSignatureEncoder : SignatureImageEncoder {
    override fun encode(strokes: List<SignatureStroke>, canvas: CanvasSize): ByteArray {
        val inks = strokes.filter { it.points.isNotEmpty() }.map { inkOf(it) }
        require(inks.isNotEmpty()) { "signature has no points" }
        require(canvas.width > 0f && canvas.height > 0f) { "canvas must have a positive size: $canvas" }
        val size = AppConstants.SIGNATURE_PNG_SIZE
        val box = RectF(inks.first().bounds).also { union -> inks.drop(1).forEach { union.union(it.bounds) } }
        val fit = fitMatrix(box, canvas, size.width, size.height, size.padding)

        val bitmap = Bitmap.createBitmap(size.width, size.height, Bitmap.Config.ARGB_8888)
        try {
            val target = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.WHITE
                strokeWidth = size.strokeWidth.toFloat()
                strokeCap = Paint.Cap.ROUND
                strokeJoin = Paint.Join.ROUND
            }
            inks.forEach { it.draw(target, fit, paint) }
            return ByteArrayOutputStream().also { out ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) { "PNG compression failed" }
            }.toByteArray()
        } finally {
            bitmap.recycle()
        }
    }

    private sealed interface Ink {
        val bounds: RectF
        fun draw(canvas: Canvas, fit: Matrix, paint: Paint)
    }

    private class Dot(private val x: Float, private val y: Float) : Ink {
        override val bounds = RectF(x, y, x, y)

        override fun draw(canvas: Canvas, fit: Matrix, paint: Paint) {
            val center = floatArrayOf(x, y).also { fit.mapPoints(it) }
            paint.style = Paint.Style.FILL
            canvas.drawCircle(center[0], center[1], paint.strokeWidth / 2f, paint)
        }
    }

    private class Curve(private val path: Path) : Ink {
        override val bounds = RectF().also { path.computeBounds(it, true) }

        override fun draw(canvas: Canvas, fit: Matrix, paint: Paint) {
            val mapped = Path()
            path.transform(fit, mapped)
            paint.style = Paint.Style.STROKE
            canvas.drawPath(mapped, paint)
        }
    }

    private fun inkOf(stroke: SignatureStroke): Ink {
        val points = stroke.points
        return if (points.size == 1) Dot(points[0].x, points[0].y) else Curve(smoothedPath(points))
    }

    private fun smoothedPath(points: List<SignaturePoint>): Path = Path().apply {
        moveTo(points[0].x, points[0].y)
        for (i in 1 until points.size - 1) {
            quadTo(points[i].x, points[i].y, (points[i].x + points[i + 1].x) / 2f, (points[i].y + points[i + 1].y) / 2f)
        }
        lineTo(points.last().x, points.last().y)
    }

    private fun fitMatrix(box: RectF, canvas: CanvasSize, width: Int, height: Int, padding: Int): Matrix {
        val boxWidth = max(box.width(), MIN_NORMALIZED_SIDE * canvas.width)
        val boxHeight = max(box.height(), MIN_NORMALIZED_SIDE * canvas.height)
        val scale = min((width - 2 * padding) / boxWidth, (height - 2 * padding) / boxHeight)
        return Matrix().apply {
            postTranslate(-box.centerX(), -box.centerY())
            postScale(scale, scale)
            postTranslate(width / 2f, height / 2f)
        }
    }

    private companion object {
        const val MIN_NORMALIZED_SIDE = 0.02f
    }
}
