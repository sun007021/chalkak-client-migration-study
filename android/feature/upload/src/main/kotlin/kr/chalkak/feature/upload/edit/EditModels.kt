package kr.chalkak.feature.upload.edit

import kotlin.math.abs

/**
 * Crop region in the platform-shared edit model: [centerX]/[centerY] are fractions (0..1) of the ORIGINAL (unrotated) width/height,
 * [width]/[height] fractions of the quarter-turned image's width/height. Full = (0.5, 0.5, 1, 1).
 */
data class CropWindow(val centerX: Double, val centerY: Double, val width: Double, val height: Double) {
    /** True when this equals [FULL] within [tolerance] (default 1e-3, REQ-EDIT-004). */
    fun isFull(tolerance: Double = 1e-3): Boolean =
        abs(centerX - FULL.centerX) <= tolerance && abs(centerY - FULL.centerY) <= tolerance &&
            abs(width - FULL.width) <= tolerance && abs(height - FULL.height) <= tolerance

    companion object {
        val FULL = CropWindow(0.5, 0.5, 1.0, 1.0)
    }
}

/** Crop frame in the DISPLAYED (already quarter-turned) image, all fractions 0..1 of the displayed width/height. */
data class CropFrame(val centerX: Double, val centerY: Double, val width: Double, val height: Double) {
    companion object {
        val FULL = CropFrame(0.5, 0.5, 1.0, 1.0)
    }
}

/** The six filters in display order (D-13). [matrix] = 4x5 row-major (R, G, B, A rows; columns inR, inG, inB, inA, add), null for ORIGINAL. */
enum class PhotoFilter(val copyKey: String) {
    ORIGINAL("edit.filter.original"),
    MONO("edit.filter.mono"),
    WARM("edit.filter.warm"),
    COOL("edit.filter.cool"),
    VINTAGE("edit.filter.vintage"),
    VIVID("edit.filter.vivid"),
    ;

    val matrix: List<Double>? get() = FilterMatrices.of(this)
}

/** Adjustment rows in display order (REQ-EDIT-019). AUTO is the strength row; the rest carry values in -1..1. */
enum class AdjustItem(val copyKey: String) {
    AUTO("edit.adjust.auto"),
    EXPOSURE("edit.adjust.exposure"),
    CONTRAST("edit.adjust.contrast"),
    HIGHLIGHTS("edit.adjust.highlights"),
    SHADOWS("edit.adjust.shadows"),
    BLACK_POINT("edit.adjust.black-point"),
    SATURATION("edit.adjust.saturation"),
    WARMTH("edit.adjust.warmth"),
}

/** Crop ratios in display order (REQ-EDIT-010). [widthUnits]:[heightUnits] is null for ORIGINAL (photo ratio) and FREE. */
enum class CropAspectRatio(val copyKey: String, val widthUnits: Int?, val heightUnits: Int?) {
    ORIGINAL("edit.ratio.original", null, null),
    FREE("edit.ratio.free", null, null),
    R1_1("edit.ratio.1-1", 1, 1),
    R4_5("edit.ratio.4-5", 4, 5),
    R5_4("edit.ratio.5-4", 5, 4),
    R3_4("edit.ratio.3-4", 3, 4),
    R4_3("edit.ratio.4-3", 4, 3),
    R9_16("edit.ratio.9-16", 9, 16),
    R16_9("edit.ratio.16-9", 16, 9),
}

/** The seven concrete values the pixel pipeline needs, each -1..1 (0 = no change). */
data class AdjustValues(
    val exposure: Double = 0.0,
    val contrast: Double = 0.0,
    val highlights: Double = 0.0,
    val shadows: Double = 0.0,
    val blackPoint: Double = 0.0,
    val saturation: Double = 0.0,
    val warmth: Double = 0.0,
)

/** Result of analysing a photo (values are -1..1, rounded to 2 decimals; warmth is never set automatically, REQ-EDIT-026). */
data class AutoAdjustments(
    val exposure: Double,
    val contrast: Double,
    val highlights: Double,
    val shadows: Double,
    val blackPoint: Double,
    val saturation: Double,
) {
    fun toMap(): Map<AdjustItem, Double> = mapOf(
        AdjustItem.EXPOSURE to exposure,
        AdjustItem.CONTRAST to contrast,
        AdjustItem.HIGHLIGHTS to highlights,
        AdjustItem.SHADOWS to shadows,
        AdjustItem.BLACK_POINT to blackPoint,
        AdjustItem.SATURATION to saturation,
    )
}

/**
 * Adjustments = analysed [auto] values x [autoStrength] (0..1), overridden per item by the values the user touched in [user].
 * Immutable; every change returns a new instance. Spec: REQ-EDIT-022..024.
 */
data class AdjustmentLayers(
    val auto: Map<AdjustItem, Double> = emptyMap(),
    val autoStrength: Double = 0.0,
    val user: Map<AdjustItem, Double> = emptyMap(),
) {
    /** `auto[item] * autoStrength` (0 when there is no analysis or strength is 0). */
    fun autoShare(item: AdjustItem): Double = (auto[item] ?: 0.0) * autoStrength + 0.0 // + 0.0 turns -0.0 into 0.0

    /** The user's value if the item was touched, else [autoShare]. */
    fun effective(item: AdjustItem): Double = user[item] ?: autoShare(item)

    fun isUserTouched(item: AdjustItem): Boolean = item in user

    /** Sets [item] to [value]; a value equal to [autoShare] clears the touched mark instead (REQ-EDIT-023). */
    fun withValue(item: AdjustItem, value: Double): AdjustmentLayers {
        if (item == AdjustItem.AUTO) return this
        val clamped = value.coerceIn(-1.0, 1.0)
        return if (abs(clamped - autoShare(item)) < SAME_VALUE) copy(user = user - item) else copy(user = user + (item to clamped))
    }

    fun withAuto(values: Map<AdjustItem, Double>): AdjustmentLayers = copy(auto = values)

    /** Changing the strength never changes user-touched items (REQ-EDIT-022). */
    fun withAutoStrength(strength: Double): AdjustmentLayers = copy(autoStrength = strength.coerceIn(0.0, 1.0))

    /** "초기화": strength 0, no touched items, analysed [auto] kept (REQ-EDIT-024). */
    fun cleared(): AdjustmentLayers = copy(autoStrength = 0.0, user = emptyMap())

    /** The seven effective values. */
    fun toValues(): AdjustValues = AdjustValues(
        exposure = effective(AdjustItem.EXPOSURE),
        contrast = effective(AdjustItem.CONTRAST),
        highlights = effective(AdjustItem.HIGHLIGHTS),
        shadows = effective(AdjustItem.SHADOWS),
        blackPoint = effective(AdjustItem.BLACK_POINT),
        saturation = effective(AdjustItem.SATURATION),
        warmth = effective(AdjustItem.WARMTH),
    )

    /** True when every effective value is 0. */
    val isNeutral: Boolean
        get() = with(toValues()) {
            listOf(exposure, contrast, highlights, shadows, blackPoint, saturation, warmth).all { abs(it) < SAME_VALUE }
        }

    private companion object {
        const val SAME_VALUE = 1e-9
    }
}

/**
 * Everything the editor decides: quarter turns clockwise (0..3), crop, filter, adjustments. Pixels are redrawn from the original
 * at upload time (REQ-EDIT-002).
 */
data class PhotoEdit(
    val quarterTurns: Int = 0,
    val crop: CropWindow = CropWindow.FULL,
    val filter: PhotoFilter = PhotoFilter.ORIGINAL,
    val adjustments: AdjustmentLayers = AdjustmentLayers(),
) {
    /** No turn, full crop (1e-3), ORIGINAL filter and neutral adjustments (REQ-EDIT-005). */
    val isIdentity: Boolean get() = quarterTurns.mod(QUARTER_TURNS) == 0 && crop.isFull() && filter == PhotoFilter.ORIGINAL && adjustments.isNeutral

    /** Always 0: there is no straighten UI (REQ-EDIT-017). */
    val straightenDegrees: Double get() = 0.0

    /** What "완료" confirms: crop within 1e-3 of full becomes [CropWindow.FULL]; strength 0 drops the analysed auto values (REQ-EDIT-004). */
    fun normalized(): PhotoEdit = copy(
        crop = if (crop.isFull()) CropWindow.FULL else crop,
        adjustments = if (adjustments.autoStrength == 0.0) adjustments.copy(auto = emptyMap()) else adjustments,
    )

    companion object {
        val IDENTITY = PhotoEdit()
        const val QUARTER_TURNS = 4
    }
}

/** Shared photo-edit constants (appendix of features/upload-edit.md; `shared/photo-edit/filters.json` once it exists). */
object PhotoEditConstants {
    const val EXPOSURE_EV_PER_UNIT = 1.5
    const val WARMTH_GAIN = 0.25
    const val BLACK_POINT_RANGE = 0.3
    const val SHADOWS_AMOUNT = 0.25
    const val HIGHLIGHTS_AMOUNT = 0.25
    const val CONTRAST_AMOUNT = 0.6
    const val MIN_CROP_FRACTION = 0.1
    const val PREVIEW_MAX_LONG_EDGE = 1440
    const val AUTO_ANALYSIS_LONG_EDGE = 256
    const val AUTO_EXPOSURE_MIN_EV = -0.5
    const val AUTO_EXPOSURE_MAX_EV = 1.0
    const val AUTO_WHITE_TARGET = 0.96
    const val RULER_DP_PER_UNIT = 400
    const val RULER_TICKS_PER_UNIT = 50
}
