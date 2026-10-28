package kr.chalkak.feature.onboarding

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.SignaturePngSize
import kr.chalkak.core.common.analytics.AnalyticsTracker
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.AffineTransform
import java.awt.geom.Ellipse2D
import java.awt.geom.Path2D
import java.awt.geom.Point2D
import java.awt.geom.Rectangle2D
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.math.max
import kotlin.math.min

/** Canvas-space point (pixels of the drawing view). */
data class SignaturePoint(val x: Float, val y: Float)

/** One continuous stroke. An empty [points] list is not a signature (TC-SIGN-003). */
data class SignatureStroke(val points: List<SignaturePoint>)

data class CanvasSize(val width: Float, val height: Float)

/** Where the drawing flow was entered from; decides the `screen_view` names (REQ-SIGN-012). */
enum class SignatureMode { Signup, Change }

/** Renders strokes to the upload PNG. The pad holder only sees this port so size limits are testable with fake byte counts. */
fun interface SignatureImageEncoder {
    fun encode(strokes: List<SignatureStroke>, canvas: CanvasSize): ByteArray
}

/**
 * Real encoder (REQ-SIGN-006/007): 1024x512 ARGB PNG, transparent background, white (255,255,255) strokes, 48px padding,
 * 14px width, round caps/joins, quadratic-curve smoothing, bbox normalized against [canvas] (side < 0.02 treated as 0.02)
 * and fitted aspect-preserving and centered inside the padded area. A single point is drawn as a filled circle.
 * Empty or point-less input -> IllegalArgumentException.
 */
class SignaturePngEncoder : SignatureImageEncoder {
    override fun encode(strokes: List<SignatureStroke>, canvas: CanvasSize): ByteArray {
        val inks = strokes.filter { it.points.isNotEmpty() }.map { inkOf(it) }
        require(inks.isNotEmpty()) { "signature has no points" }
        require(canvas.width > 0f && canvas.height > 0f) { "canvas must have a positive size: $canvas" }
        val size = AppConstants.SIGNATURE_PNG_SIZE
        val fit = fitTransform(inks.map { it.bounds }.reduce { a, b -> a.createUnion(b) }, canvas, size)
        val image = BufferedImage(size.width, size.height, BufferedImage.TYPE_INT_ARGB)
        val graphics = image.createGraphics()
        try {
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            graphics.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE)
            graphics.color = Color.WHITE
            graphics.stroke = BasicStroke(size.strokeWidth.toFloat(), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
            inks.forEach { it.draw(graphics, fit, size.strokeWidth) }
        } finally {
            graphics.dispose()
        }
        return ByteArrayOutputStream().also { check(ImageIO.write(image, "png", it)) { "no PNG writer available" } }.toByteArray()
    }

    private sealed interface Ink {
        /** Extent of the drawn centerline in canvas coordinates. */
        val bounds: Rectangle2D
        fun draw(graphics: Graphics2D, transform: AffineTransform, strokeWidth: Int)
    }

    /** A single point is drawn as a filled circle (REQ-SIGN-005). */
    private class Dot(private val x: Double, private val y: Double) : Ink {
        override val bounds: Rectangle2D = Rectangle2D.Double(x, y, 0.0, 0.0)

        override fun draw(graphics: Graphics2D, transform: AffineTransform, strokeWidth: Int) {
            val center = transform.transform(Point2D.Double(x, y), null)
            val radius = strokeWidth / 2.0
            graphics.fill(Ellipse2D.Double(center.x - radius, center.y - radius, strokeWidth.toDouble(), strokeWidth.toDouble()))
        }
    }

    private class Curve(private val path: Path2D.Double) : Ink {
        // Path2D.getBounds2D may include control points on older JDKs, so measure the flattened curve instead.
        override val bounds: Rectangle2D = flattenedBounds(path)

        override fun draw(graphics: Graphics2D, transform: AffineTransform, strokeWidth: Int) {
            graphics.draw(transform.createTransformedShape(path))
        }
    }

    private fun inkOf(stroke: SignatureStroke): Ink {
        val points = stroke.points
        if (points.size == 1) return Dot(points[0].x.toDouble(), points[0].y.toDouble())
        return Curve(smoothedPath(points))
    }

    /** Quadratic curves through the midpoints of consecutive points, with each point as the control point. */
    private fun smoothedPath(points: List<SignaturePoint>): Path2D.Double {
        val path = Path2D.Double()
        path.moveTo(points[0].x.toDouble(), points[0].y.toDouble())
        for (i in 1 until points.size - 1) {
            val midX = (points[i].x + points[i + 1].x) / 2.0
            val midY = (points[i].y + points[i + 1].y) / 2.0
            path.quadTo(points[i].x.toDouble(), points[i].y.toDouble(), midX, midY)
        }
        path.lineTo(points.last().x.toDouble(), points.last().y.toDouble())
        return path
    }

    /** Aspect-preserving fit of the ink box into the padded area, centered (REQ-SIGN-007). */
    private fun fitTransform(box: Rectangle2D, canvas: CanvasSize, size: SignaturePngSize): AffineTransform {
        val boxWidth = max(box.width, MIN_NORMALIZED_SIDE * canvas.width)
        val boxHeight = max(box.height, MIN_NORMALIZED_SIDE * canvas.height)
        val areaWidth = (size.width - 2 * size.padding).toDouble()
        val areaHeight = (size.height - 2 * size.padding).toDouble()
        val scale = min(areaWidth / boxWidth, areaHeight / boxHeight)
        return AffineTransform().apply {
            translate(size.width / 2.0, size.height / 2.0)
            scale(scale, scale)
            translate(-box.centerX, -box.centerY)
        }
    }

    private companion object {
        const val MIN_NORMALIZED_SIDE = 0.02
        const val FLATNESS = 0.05

        fun flattenedBounds(path: Path2D.Double): Rectangle2D {
            val box = Rectangle2D.Double()
            var first = true
            val coords = DoubleArray(6)
            val iterator = path.getPathIterator(null, FLATNESS)
            while (!iterator.isDone) {
                iterator.currentSegment(coords)
                if (first) box.setRect(coords[0], coords[1], 0.0, 0.0) else box.add(coords[0], coords[1])
                first = false
                iterator.next()
            }
            return box
        }
    }
}

data class SignaturePadUiState(
    val strokes: List<SignatureStroke> = emptyList(),
    /** `sign.error.too-large` copy key after an oversized confirm; strokes are kept. */
    val errorCopyKey: String? = null,
) {
    /** At least one stroke with at least one point. */
    val hasSignature: Boolean get() = strokes.any { it.points.isNotEmpty() }
    val canUndo: Boolean get() = strokes.isNotEmpty()
    val canClear: Boolean get() = strokes.isNotEmpty()
    /** "이 사인으로 할래요" enabled. */
    val canConfirm: Boolean get() = hasSignature
}

sealed interface SignaturePadEffect {
    /** Opens the preview exactly once per confirm; [png] is the encoded upload (<= SIGNATURE_MAX_BYTES). */
    class ShowPreview(val png: ByteArray) : SignaturePadEffect
}

/** Drawing + preview logic shared by signup and "사인 변경" (REQ-SIGN-001..012). */
class SignaturePadStateHolder(
    private val mode: SignatureMode,
    private val canvas: CanvasSize,
    private val encoder: SignatureImageEncoder,
    private val analytics: AnalyticsTracker,
) {
    private val _state = MutableStateFlow(SignaturePadUiState())
    val state: StateFlow<SignaturePadUiState> = _state.asStateFlow()

    private val _effects = Channel<SignaturePadEffect>(Channel.BUFFERED)
    val effects: Flow<SignaturePadEffect> = _effects.receiveAsFlow()

    private var drawing = false
    private var previewOpen = false

    /** `screen_view(onboarding_signature)` for Signup, `change_signature` for Change. */
    fun onScreenShown() = analytics.screenView(if (mode == SignatureMode.Signup) "onboarding_signature" else "change_signature")

    /** `screen_view(onboarding_signature_preview)` for Signup, `change_signature_preview` for Change. */
    fun onPreviewShown() =
        analytics.screenView(if (mode == SignatureMode.Signup) "onboarding_signature_preview" else "change_signature_preview")

    /** Starts a new stroke at the point (clamped into [0,width]x[0,height], TC-SIGN-005). */
    fun beginStroke(x: Float, y: Float) {
        drawing = true
        edit { it + SignatureStroke(listOf(clamp(x, y))) }
    }

    fun extendStroke(x: Float, y: Float) {
        if (!drawing) return
        edit { strokes ->
            val last = strokes.lastOrNull() ?: return@edit strokes
            strokes.dropLast(1) + SignatureStroke(last.points + clamp(x, y))
        }
    }

    fun endStroke() {
        drawing = false
    }

    /** Adds a finished stroke (points clamped). A stroke without points is stored but does not count as a signature. */
    fun addStroke(stroke: SignatureStroke) = edit { it + SignatureStroke(stroke.points.map { p -> clamp(p.x, p.y) }) }

    /** Removes the last stroke. */
    fun onUndo() = edit { it.dropLast(1) }

    fun onClear() = edit { emptyList() }

    /**
     * Encodes; > SIGNATURE_MAX_BYTES -> errorCopyKey = sign.error.too-large, no effect, strokes kept; otherwise emits ONE
     * ShowPreview. Further confirms before [onRedraw] are ignored (TC-SIGN-008).
     */
    fun onConfirm() {
        val current = _state.value
        if (previewOpen || !current.canConfirm) return
        val png = encoder.encode(current.strokes, canvas)
        if (png.size > AppConstants.SIGNATURE_MAX_BYTES) {
            _state.update { it.copy(errorCopyKey = OnbCopyKeys.SIGN_ERROR_TOO_LARGE) }
            return
        }
        previewOpen = true
        _effects.trySend(SignaturePadEffect.ShowPreview(png))
    }

    /** Preview "다시 그리기": back to a blank pad (temporary policy, spec open question 2). */
    fun onRedraw() {
        previewOpen = false
        drawing = false
        _state.value = SignaturePadUiState()
    }

    private fun edit(change: (List<SignatureStroke>) -> List<SignatureStroke>) =
        _state.update { SignaturePadUiState(strokes = change(it.strokes)) }

    private fun clamp(x: Float, y: Float) = SignaturePoint(x.coerceIn(0f, canvas.width), y.coerceIn(0f, canvas.height))
}
