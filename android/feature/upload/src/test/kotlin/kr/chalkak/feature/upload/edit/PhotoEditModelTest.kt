package kr.chalkak.feature.upload.edit

import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/** Edit model: TC-EDIT-011/012/013/021/023/030/031/036/039 and the ruler (TC-EDIT-038). */
class PhotoEditModelTest {
    private val tol = 1e-9

    private fun AdjustmentLayers.exposure() = effective(AdjustItem.EXPOSURE)
    private fun AdjustmentLayers.contrast() = effective(AdjustItem.CONTRAST)

    private val analysed = AdjustmentLayers(
        auto = mapOf(AdjustItem.EXPOSURE to 0.4, AdjustItem.CONTRAST to 0.2),
        autoStrength = 1.0,
    )

    // ---- layers ------------------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-030 user value wins, otherwise analysed value times strength`() {
        val withUser = analysed.withValue(AdjustItem.EXPOSURE, 0.3)
        assertEquals(0.3, withUser.exposure(), tol)
        assertEquals(0.2, withUser.contrast(), tol)
        val half = withUser.withAutoStrength(0.5)
        assertEquals(0.3, half.exposure(), tol)
        assertEquals(0.1, half.contrast(), tol)
        val off = withUser.withAutoStrength(0.0)
        assertEquals(0.3, off.exposure(), tol)
        assertEquals(0.0, off.contrast(), tol)
    }

    @Test
    fun `TC-EDIT-030 untouched items simply follow the analysis`() {
        assertEquals(0.4, analysed.exposure(), tol)
        assertEquals(0.2, analysed.withAutoStrength(1.0).contrast(), tol)
        assertEquals(0.0, analysed.effective(AdjustItem.SATURATION), tol)
        assertEquals(0.4, analysed.autoShare(AdjustItem.EXPOSURE), tol)
        assertFalse(analysed.isUserTouched(AdjustItem.EXPOSURE))
    }

    @Test
    fun `TC-EDIT-031 moving an item back to the auto share clears the touched mark so it follows auto again`() {
        val touched = analysed.withValue(AdjustItem.EXPOSURE, 0.3)
        assertTrue(touched.isUserTouched(AdjustItem.EXPOSURE))
        val back = touched.withValue(AdjustItem.EXPOSURE, 0.4)
        assertFalse(back.isUserTouched(AdjustItem.EXPOSURE))
        assertEquals(0.2, back.withAutoStrength(0.5).exposure(), tol)
    }

    @Test
    fun `TC-EDIT-031 with auto off the share is zero, so zero clears the mark`() {
        val off = analysed.withAutoStrength(0.0)
        assertFalse(off.withValue(AdjustItem.EXPOSURE, 0.0).isUserTouched(AdjustItem.EXPOSURE))
        assertTrue(off.withValue(AdjustItem.EXPOSURE, 0.1).isUserTouched(AdjustItem.EXPOSURE))
    }

    @Test
    fun `TC-EDIT-031 an item touched before auto was switched on keeps the user value`() {
        val before = analysed.withAutoStrength(0.0).withValue(AdjustItem.EXPOSURE, 0.3)
        assertEquals(0.3, before.withAutoStrength(1.0).exposure(), tol)
        assertEquals(0.2, before.withAutoStrength(1.0).contrast(), tol)
    }

    @Test
    fun `TC-EDIT-024 the adjust reset sets strength 0 and forgets touched items but keeps the analysis`() {
        val cleared = analysed.withValue(AdjustItem.EXPOSURE, 0.3).withValue(AdjustItem.SATURATION, -0.5).cleared()
        assertEquals(0.0, cleared.autoStrength, tol)
        assertTrue(cleared.user.isEmpty())
        assertEquals(analysed.auto, cleared.auto)
        assertTrue(cleared.isNeutral)
        assertEquals(0.4, cleared.withAutoStrength(1.0).exposure(), tol, "the analysis is still there")
    }

    @Test
    fun `TC-EDIT-023 items run auto, exposure, contrast, highlights, shadows, black point, saturation, warmth`() {
        val expected = listOf(
            "edit.adjust.auto", "edit.adjust.exposure", "edit.adjust.contrast", "edit.adjust.highlights",
            "edit.adjust.shadows", "edit.adjust.black-point", "edit.adjust.saturation", "edit.adjust.warmth",
        )
        assertEquals(expected, AdjustItem.entries.map { it.copyKey })
        expected.forEach { assertTrue(Copy[it].isNotBlank()) }
    }

    @Test
    fun `TC-EDIT-023 values are limited to minus one to one and show as whole numbers times 100`() {
        val layers = AdjustmentLayers()
        assertEquals(1.0, layers.withValue(AdjustItem.EXPOSURE, 1.7).effective(AdjustItem.EXPOSURE), tol)
        assertEquals(-1.0, layers.withValue(AdjustItem.EXPOSURE, -1.7).effective(AdjustItem.EXPOSURE), tol)
        assertEquals(37, Math.round(layers.withValue(AdjustItem.SHADOWS, 0.37).effective(AdjustItem.SHADOWS) * 100).toInt())
        assertEquals(AdjustValues(contrast = 0.5), layers.withValue(AdjustItem.CONTRAST, 0.5).toValues())
    }

    @Test
    fun `TC-EDIT-023 auto results never carry warmth or the AUTO row`() {
        val keys = AutoAdjustments(0.1, 0.2, -0.3, 0.4, 0.5, 0.6).toMap()
        assertEquals(
            setOf(AdjustItem.EXPOSURE, AdjustItem.CONTRAST, AdjustItem.HIGHLIGHTS, AdjustItem.SHADOWS, AdjustItem.BLACK_POINT, AdjustItem.SATURATION),
            keys.keys,
        )
        assertEquals(-0.3, keys.getValue(AdjustItem.HIGHLIGHTS), tol)
    }

    // ---- PhotoEdit ---------------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-011 nothing changed is identity, any single change is not`() {
        assertTrue(PhotoEdit.IDENTITY.isIdentity)
        assertTrue(PhotoEdit(crop = CropWindow(0.5, 0.5, 0.9995, 0.9995)).isIdentity, "within 1e-3 of full")
        assertFalse(PhotoEdit(quarterTurns = 1).isIdentity)
        assertFalse(PhotoEdit(crop = CropWindow(0.5, 0.5, 0.99, 1.0)).isIdentity)
        assertFalse(PhotoEdit(crop = CropWindow(0.45, 0.5, 0.9, 1.0)).isIdentity)
        assertFalse(PhotoEdit(filter = PhotoFilter.MONO).isIdentity)
        assertFalse(PhotoEdit(adjustments = AdjustmentLayers().withValue(AdjustItem.WARMTH, 0.1)).isIdentity)
    }

    @Test
    fun `TC-EDIT-011 analysed values with strength 0 do not make an edit, with strength above 0 they do`() {
        assertTrue(PhotoEdit(adjustments = analysed.withAutoStrength(0.0)).isIdentity)
        assertFalse(PhotoEdit(adjustments = analysed).isIdentity)
    }

    @Test
    fun `TC-EDIT-012 after the crop reset and the adjust reset an edit is identity again, the filter is a separate choice`() {
        val dirty = PhotoEdit(
            quarterTurns = 3,
            crop = CropWindow(0.4, 0.6, 0.5, 0.5),
            filter = PhotoFilter.VINTAGE,
            adjustments = analysed.withValue(AdjustItem.EXPOSURE, 0.3),
        )
        val adjustReset = dirty.copy(adjustments = dirty.adjustments.cleared())
        assertFalse(adjustReset.isIdentity)
        val allReset = adjustReset.copy(quarterTurns = 0, crop = CropWindow.FULL, filter = PhotoFilter.ORIGINAL)
        assertTrue(allReset.isIdentity)
    }

    @Test
    fun `TC-EDIT-021 straighten degrees are always zero`() {
        assertEquals(0.0, PhotoEdit.IDENTITY.straightenDegrees, tol)
        assertEquals(0.0, PhotoEdit(quarterTurns = 2, filter = PhotoFilter.COOL).straightenDegrees, tol)
    }

    @Test
    fun `TC-EDIT-003 done normalises a nearly full crop to full`() {
        val edit = PhotoEdit(crop = CropWindow(0.5004, 0.4996, 0.9995, 1.0), filter = PhotoFilter.WARM)
        assertEquals(CropWindow.FULL, edit.normalized().crop)
        assertEquals(PhotoFilter.WARM, edit.normalized().filter)
        val real = PhotoEdit(crop = CropWindow(0.5, 0.5, 0.8, 0.8))
        assertEquals(real.crop, real.normalized().crop)
        assertTrue(CropWindow(0.5, 0.5, 0.9995, 0.9995).isFull())
        assertFalse(CropWindow(0.5, 0.5, 0.99, 1.0).isFull())
    }

    @Test
    fun `TC-EDIT-003 done with auto off drops the analysed values and keeps what the user touched`() {
        val off = PhotoEdit(adjustments = analysed.withValue(AdjustItem.EXPOSURE, 0.3).withAutoStrength(0.0)).normalized()
        assertTrue(off.adjustments.auto.isEmpty())
        assertEquals(0.3, off.adjustments.exposure(), tol)
        val on = PhotoEdit(adjustments = analysed).normalized()
        assertEquals(analysed.auto, on.adjustments.auto)
        assertEquals(1.0, on.adjustments.autoStrength, tol)
    }

    // ---- lists -------------------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-013 crop ratios come in the catalog order and every portrait ratio has its landscape twin`() {
        val keys = listOf(
            "edit.ratio.original", "edit.ratio.free", "edit.ratio.1-1", "edit.ratio.4-5", "edit.ratio.5-4",
            "edit.ratio.3-4", "edit.ratio.4-3", "edit.ratio.9-16", "edit.ratio.16-9",
        )
        assertEquals(keys, CropAspectRatio.entries.map { it.copyKey })
        assertEquals(listOf("원본", "자유", "1:1", "4:5", "5:4", "3:4", "4:3", "9:16", "16:9"), keys.map { Copy[it] })
        listOf(CropAspectRatio.R4_5 to CropAspectRatio.R5_4, CropAspectRatio.R3_4 to CropAspectRatio.R4_3, CropAspectRatio.R9_16 to CropAspectRatio.R16_9)
            .forEach { (a, b) ->
                assertEquals(a.widthUnits, b.heightUnits)
                assertEquals(a.heightUnits, b.widthUnits)
            }
        assertNotEquals(CropAspectRatio.ORIGINAL, CropAspectRatio.FREE)
    }

    @Test
    fun `TC-EDIT-039 six filters in order with the 4x5 matrices of the appendix`() {
        assertEquals(
            listOf("edit.filter.original", "edit.filter.mono", "edit.filter.warm", "edit.filter.cool", "edit.filter.vintage", "edit.filter.vivid"),
            PhotoFilter.entries.map { it.copyKey },
        )
        assertEquals(listOf("원본", "흑백", "따뜻하게", "차갑게", "빈티지", "선명하게"), PhotoFilter.entries.map { Copy[it.copyKey] })
        assertEquals(null, PhotoFilter.ORIGINAL.matrix)
        val gray = listOf(0.299, 0.587, 0.114, 0.0, 0.0)
        val alpha = listOf(0.0, 0.0, 0.0, 1.0, 0.0)
        val expected = mapOf(
            PhotoFilter.MONO to gray + gray + gray + alpha,
            PhotoFilter.WARM to listOf(1.08, 0.0, 0.0, 0.0, 8.0) + listOf(0.0, 1.02, 0.0, 0.0, 4.0) + listOf(0.0, 0.0, 0.88, 0.0, 0.0) + alpha,
            PhotoFilter.COOL to listOf(0.9, 0.0, 0.0, 0.0, 0.0) + listOf(0.0, 1.0, 0.0, 0.0, 2.0) + listOf(0.0, 0.0, 1.1, 0.0, 10.0) + alpha,
            PhotoFilter.VINTAGE to listOf(0.63, 0.35, 0.09, 0.0, 18.0) + listOf(0.16, 0.76, 0.08, 0.0, 14.0) + listOf(0.12, 0.24, 0.51, 0.0, 10.0) + alpha,
            PhotoFilter.VIVID to listOf(1.2754, -0.2503, -0.0252, 0.0, 0.0) + listOf(-0.0746, 1.0997, -0.0252, 0.0, 0.0) + listOf(-0.0746, -0.2503, 1.3248, 0.0, 0.0) + alpha,
        )
        expected.forEach { (filter, values) ->
            val actual = filter.matrix
            assertEquals(20, actual?.size, "$filter")
            values.forEachIndexed { i, v -> assertEquals(v, actual!![i], 1e-9, "$filter[$i]") }
        }
    }

    @Test
    fun `TC-EDIT-036 the shared numbers equal the appendix constants`() {
        assertEquals(1.5, PhotoEditConstants.EXPOSURE_EV_PER_UNIT)
        assertEquals(0.25, PhotoEditConstants.WARMTH_GAIN)
        assertEquals(0.3, PhotoEditConstants.BLACK_POINT_RANGE)
        assertEquals(0.25, PhotoEditConstants.SHADOWS_AMOUNT)
        assertEquals(0.25, PhotoEditConstants.HIGHLIGHTS_AMOUNT)
        assertEquals(0.6, PhotoEditConstants.CONTRAST_AMOUNT)
        assertEquals(0.1, PhotoEditConstants.MIN_CROP_FRACTION)
        assertEquals(256, PhotoEditConstants.AUTO_ANALYSIS_LONG_EDGE)
        assertEquals(-0.5, PhotoEditConstants.AUTO_EXPOSURE_MIN_EV)
        assertEquals(1.0, PhotoEditConstants.AUTO_EXPOSURE_MAX_EV)
        assertEquals(0.96, PhotoEditConstants.AUTO_WHITE_TARGET)
        assertEquals(1440, PhotoEditConstants.PREVIEW_MAX_LONG_EDGE)
        assertEquals(AppConstants.POST_IMAGE_MAX_LONG_EDGE, 4096)
    }

    // ---- ruler -------------------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-038 the ruler is 400 dp per unit with 50 ticks and values round trip`() {
        assertEquals(200.0, RulerScale.positionDp(0.5), tol)
        assertEquals(-400.0, RulerScale.positionDp(-1.0), tol)
        assertEquals(0.5, RulerScale.valueAt(200.0), tol)
        assertEquals(8.0, RulerScale.tickSpacingDp, tol)
        for (i in -100..100) {
            val v = i / 100.0
            assertEquals(v, RulerScale.valueAt(RulerScale.positionDp(v)), 1e-12)
        }
    }
}
