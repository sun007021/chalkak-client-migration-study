package kr.chalkak.feature.upload.edit

import kotlin.math.abs
import kotlin.math.floor
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Auto adjust analysis: TC-EDIT-033, 034, 035 (REQ-EDIT-026/027). Colours are 8-bit versions of the catalog fractions. */
class PhotoAutoAdjusterTest {
    private fun rgb(r: Int, g: Int, b: Int) = (r shl 16) or (g shl 8) or b

    // (0.94, 0.78, 0.69), (0.45, 0.30, 0.22), (0.53, 0.81, 0.92), (0.30, 0.60, 0.20) as 8-bit values
    private val lightSkin = rgb(240, 199, 176)
    private val darkSkin = rgb(115, 77, 56)
    private val sky = rgb(135, 207, 235)
    private val grass = rgb(77, 153, 51)

    private fun analyse(raster: Raster) = assertNotNull(PhotoAutoAdjuster.analyze(raster))

    private fun solidSaturation(color: Int) = analyse(Raster.solid(4, 4, color)).saturation

    private fun gray(v: Int) = rgb(v, v, v)

    @Test
    fun `TC-EDIT-034 solid skin tones get no automatic saturation`() {
        assertEquals(0.0, solidSaturation(lightSkin), 0.011)
        assertEquals(0.0, solidSaturation(darkSkin), 0.011)
    }

    @Test
    fun `TC-EDIT-034 solid sky and grass get plus 19 and plus 18`() {
        assertEquals(0.19, solidSaturation(sky), 0.011)
        assertEquals(0.18, solidSaturation(grass), 0.011)
    }

    @Test
    fun `TC-EDIT-034 when a quarter of the pixels are skin only three quarters of the amount is added`() {
        val pixels = IntArray(16) { if (it < 4) lightSkin else sky }
        val mixed = analyse(Raster(4, 4, pixels.map { (0xFF shl 24) or it }.toIntArray())).saturation
        assertEquals(solidSaturation(sky) * 0.75, mixed, 0.011)
    }

    @Test
    fun `TC-EDIT-035 saturation strength does not depend on the hue`() {
        // Same max-min spread (76 of 255), none of them skin coloured.
        val green = solidSaturation(rgb(77, 153, 77))
        val blue = solidSaturation(rgb(77, 77, 153))
        val cyan = solidSaturation(rgb(77, 153, 153))
        assertEquals(green, blue, 1e-9)
        assertEquals(green, cyan, 1e-9)
        assertTrue(green > 0.0)
    }

    @Test
    fun `TC-EDIT-033 a washed out flat photo gets more black point, contrast and exposure`() {
        val ramp = IntArray(81 * 4) { gray(90 + it / 4) or (0xFF shl 24) }
        val result = analyse(Raster(81, 4, ramp))
        assertTrue(result.exposure > 0.2, "exposure ${result.exposure}")
        assertTrue(result.blackPoint > 0.5, "black point ${result.blackPoint}")
        assertTrue(result.contrast > 0.2, "contrast ${result.contrast}")
        assertEquals(0.0, result.saturation, 1e-9, "grey photo: saturation not raised")
    }

    @Test
    fun `TC-EDIT-033 a photo that already uses the whole range keeps exposure, black point and contrast at zero`() {
        val ramp = IntArray(256) { gray(it) or (0xFF shl 24) }
        val result = analyse(Raster(16, 16, ramp))
        assertEquals(0.0, result.exposure, 0.011)
        assertEquals(0.0, result.blackPoint, 0.011)
        assertEquals(0.0, result.contrast, 0.011)
        assertTrue(result.highlights <= 0.0 && result.shadows >= 0.0, "highlights are pulled down, shadows lifted")
    }

    @Test
    fun `TC-EDIT-033 a black and white photo never gets more saturation`() {
        listOf(gray(30), gray(128), gray(220)).forEach { assertEquals(0.0, solidSaturation(it), 1e-9) }
    }

    @Test
    fun `TC-EDIT-033 every result is rounded to two decimals and stays in range`() {
        val results = listOf(
            analyse(Raster(81, 4, IntArray(81 * 4) { gray(90 + it / 4) or (0xFF shl 24) })),
            analyse(Raster.solid(4, 4, sky)),
            analyse(Raster.solid(4, 4, gray(250))),
            analyse(Raster.solid(4, 4, gray(5))),
        )
        results.forEach { r ->
            r.toMap().forEach { (item, value) ->
                assertTrue(abs(value * 100 - floor(value * 100 + 0.5)) < 1e-6, "$item=$value is not 2 decimals")
                assertTrue(value in -1.0..1.0, "$item=$value")
            }
            assertTrue(r.exposure in (-0.33 - 1e-9)..(0.67 + 1e-9), "exposure ${r.exposure} is round2 of -0.5..1.0 EV / 1.5")
        }
    }

    @Test
    fun `TC-EDIT-033 an empty sample cannot be analysed`() {
        assertNull(PhotoAutoAdjuster.analyze(Raster(0, 0, IntArray(0))))
    }
}
