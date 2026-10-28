package kr.chalkak.feature.upload.edit

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

import kr.chalkak.feature.upload.image.ImageSize

/** A point in pixels. */
data class PointD(val x: Double, val y: Double)

/** Quarter-turn / crop coordinate mapping (appendix "편집값 모델과 좌표"). */
object PhotoEditTransform {
    /** Size after [quarterTurns] clockwise quarter turns: odd counts swap width and height. */
    fun rotatedSize(source: ImageSize, quarterTurns: Int): ImageSize =
        if (quarterTurns.mod(2) == 1) ImageSize(source.height, source.width) else source

    /**
     * Maps a point (xr, yr) of the turned image to the original W x H image: 0 -> (xr, yr), 1 -> (yr, H - xr),
     * 2 -> (W - xr, H - yr), 3 -> (W - yr, xr).
     */
    fun toSource(source: ImageSize, quarterTurns: Int, xr: Double, yr: Double): PointD {
        val w = source.width.toDouble()
        val h = source.height.toDouble()
        return when (quarterTurns.mod(4)) {
            0 -> PointD(xr, yr)
            1 -> PointD(yr, h - xr)
            2 -> PointD(w - xr, h - yr)
            else -> PointD(w - yr, xr)
        }
    }

    /** Inverse of [toSource]: a point (x, y) of the original in the turned image. */
    private fun fromSource(source: ImageSize, quarterTurns: Int, x: Double, y: Double): PointD {
        val w = source.width.toDouble()
        val h = source.height.toDouble()
        return when (quarterTurns.mod(4)) {
            0 -> PointD(x, y)
            1 -> PointD(h - y, x)
            2 -> PointD(w - x, h - y)
            else -> PointD(y, w - x)
        }
    }

    /**
     * [CropWindow] for a [CropFrame] drawn on the displayed (turned) image: the frame centre is mapped back to the original
     * with [toSource] and divided by the original W/H; width/height stay the frame's fractions of the turned image.
     * Example: 4000x3000, 1 turn, left half (0.25, 0.5, 0.5, 1) -> CropWindow(0.5, 0.75, 0.5, 1).
     */
    fun cropWindowFor(source: ImageSize, quarterTurns: Int, frame: CropFrame): CropWindow {
        val turned = rotatedSize(source, quarterTurns)
        val centre = toSource(source, quarterTurns, frame.centerX * turned.width, frame.centerY * turned.height)
        return CropWindow(centre.x / source.width, centre.y / source.height, frame.width, frame.height)
    }

    /** Inverse of [cropWindowFor], so a saved edit reopens with the same frame. */
    fun frameFor(source: ImageSize, quarterTurns: Int, window: CropWindow): CropFrame {
        val turned = rotatedSize(source, quarterTurns)
        val centre = fromSource(source, quarterTurns, window.centerX * source.width, window.centerY * source.height)
        return CropFrame(centre.x / turned.width, centre.y / turned.height, window.width, window.height)
    }

    /** Output pixels: turned size x crop fractions, each rounded to the nearest pixel (4000x3000, 1 turn, half = 1500x4000). */
    fun outputSize(source: ImageSize, quarterTurns: Int, crop: CropWindow): ImageSize {
        val turned = rotatedSize(source, quarterTurns)
        return ImageSize(roundPixels(turned.width * crop.width), roundPixels(turned.height * crop.height))
    }

    private fun roundPixels(value: Double): Int = max(1, floor(value + 0.5).toInt())
}

/** Which corner a resize drag holds. The opposite corner stays anchored. */
enum class CropCorner { TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT }

/** Crop frame geometry on the displayed image of [image] pixels (REQ-EDIT-011..015). All frames are in fractions 0..1. */
object CropGeometry {
    const val MIN_CROP_FRACTION = PhotoEditConstants.MIN_CROP_FRACTION

    /**
     * Largest frame centred in the image with pixel ratio [aspect] (= width / height). A null [aspect] is the full image.
     * 4:5 on 4000x3000 -> (0.5, 0.5, 0.6, 1.0).
     */
    fun largestFrame(image: ImageSize, aspect: Double?): CropFrame {
        if (aspect == null) return CropFrame.FULL
        val imageRatio = image.width.toDouble() / image.height
        return if (imageRatio >= aspect) {
            CropFrame(0.5, 0.5, image.height * aspect / image.width, 1.0)
        } else {
            CropFrame(0.5, 0.5, 1.0, image.width / aspect / image.height)
        }
    }

    /** Moves by (dx, dy) fractions, kept inside the image (size unchanged). */
    fun move(frame: CropFrame, dx: Double, dy: Double): CropFrame = frame.copy(
        centerX = (frame.centerX + dx).coerceIn(frame.width / 2, 1.0 - frame.width / 2),
        centerY = (frame.centerY + dy).coerceIn(frame.height / 2, 1.0 - frame.height / 2),
    )

    /**
     * Drags [corner] to the point ([x], [y]) (fractions of the image) while the opposite corner stays. Result stays inside
     * the image, the shorter pixel side never goes below [MIN_CROP_FRACTION] x the image's shorter side, and with a fixed
     * [aspect] (pixel width / height) the ratio is kept exactly.
     */
    fun resize(frame: CropFrame, corner: CropCorner, x: Double, y: Double, image: ImageSize, aspect: Double?): CropFrame {
        val right = corner == CropCorner.TOP_RIGHT || corner == CropCorner.BOTTOM_RIGHT
        val bottom = corner == CropCorner.BOTTOM_LEFT || corner == CropCorner.BOTTOM_RIGHT
        val anchorX = if (right) frame.centerX - frame.width / 2 else frame.centerX + frame.width / 2
        val anchorY = if (bottom) frame.centerY - frame.height / 2 else frame.centerY + frame.height / 2
        val minPixels = MIN_CROP_FRACTION * min(image.width, image.height)
        val (width, height) = if (aspect == null) {
            freeExtent(x, anchorX, right, minPixels / image.width) to freeExtent(y, anchorY, bottom, minPixels / image.height)
        } else {
            ratioExtent(Drag(x, y, anchorX, anchorY, right, bottom), image, aspect, minPixels)
        }
        val left = if (right) anchorX else anchorX - width
        val top = if (bottom) anchorY else anchorY - height
        return CropFrame(left + width / 2, top + height / 2, width, height)
    }

    private class Drag(val x: Double, val y: Double, val anchorX: Double, val anchorY: Double, val right: Boolean, val bottom: Boolean)

    /** Width (or height) in image fractions when only one axis matters: the dragged edge stays inside the photo and [minFraction] away from the anchor. */
    private fun freeExtent(edge: Double, anchor: Double, towardsEnd: Boolean, minFraction: Double): Double {
        val clamped = edge.coerceIn(0.0, 1.0)
        return if (towardsEnd) {
            max(clamped, anchor + minFraction).coerceAtMost(1.0) - anchor
        } else {
            anchor - min(clamped, anchor - minFraction).coerceAtLeast(0.0)
        }
    }

    /** (width, height) fractions for a fixed pixel ratio: the larger of the two demands wins, then bounds and the minimum are applied. */
    private fun ratioExtent(drag: Drag, image: ImageSize, aspect: Double, minPixels: Double): Pair<Double, Double> {
        val demandX = (if (drag.right) drag.x - drag.anchorX else drag.anchorX - drag.x) * image.width
        val demandY = (if (drag.bottom) drag.y - drag.anchorY else drag.anchorY - drag.y) * image.height
        val roomX = (if (drag.right) 1.0 - drag.anchorX else drag.anchorX) * image.width
        val roomY = (if (drag.bottom) 1.0 - drag.anchorY else drag.anchorY) * image.height
        val widthPixels = max(demandX, demandY * aspect)
            .coerceAtLeast(minPixels * max(1.0, aspect))
            .coerceAtMost(min(roomX, roomY * aspect))
        return widthPixels / image.width to widthPixels / aspect / image.height
    }

    /** Display scale that fits [image] into a [viewWidth] x [viewHeight] box without enlarging past the box. */
    fun fitScale(image: ImageSize, viewWidth: Double, viewHeight: Double): Double = min(viewWidth / image.width, viewHeight / image.height)

    /** Fraction (0..1) of the displayed image -> screen offset inside the fitted image whose top-left is the box origin. */
    fun toScreen(fraction: Double, imageSideInPixels: Int, fitScale: Double): Double = fraction * imageSideInPixels * fitScale

    /** Inverse of [toScreen]. */
    fun toFraction(screen: Double, imageSideInPixels: Int, fitScale: Double): Double = screen / (imageSideInPixels * fitScale)
}

/** Adjustment ruler (REQ-EDIT-019): 400 dp per 1.0 of value, 50 ticks per 1.0. */
object RulerScale {
    fun positionDp(value: Double): Double = value * PhotoEditConstants.RULER_DP_PER_UNIT

    fun valueAt(positionDp: Double): Double = positionDp / PhotoEditConstants.RULER_DP_PER_UNIT

    /** Distance between two ticks in dp (400 / 50 = 8). */
    val tickSpacingDp: Double get() = PhotoEditConstants.RULER_DP_PER_UNIT.toDouble() / PhotoEditConstants.RULER_TICKS_PER_UNIT
}
