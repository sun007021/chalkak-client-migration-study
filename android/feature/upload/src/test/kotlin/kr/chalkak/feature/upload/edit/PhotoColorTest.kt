package kr.chalkak.feature.upload.edit

import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Pixel maths: TC-EDIT-024..029 (adjustments), TC-EDIT-040..043 (filters). Golden numbers come from features/upload-edit.md. */
class PhotoColorTest {
    private fun gray(v: Int) = Rgba(v, v, v)

    private fun assertNear(expected: Rgba, actual: Rgba, tolerance: Int = 2, message: String = "") {
        val ok = abs(expected.r - actual.r) <= tolerance && abs(expected.g - actual.g) <= tolerance &&
            abs(expected.b - actual.b) <= tolerance && expected.a == actual.a
        assertTrue(ok, "$message expected $expected (+-$tolerance) but was $actual")
    }

    private fun adjust(pixel: Rgba, values: AdjustValues, filter: PhotoFilter = PhotoFilter.ORIGINAL) = PhotoColor.apply(pixel, values, filter)

    @Test
    fun `sRGB transfer functions are inverse of each other and use the two piece formula`() {
        assertEquals(0.0, PhotoColor.srgbToLinear(0.0), 1e-12)
        assertEquals(1.0, PhotoColor.srgbToLinear(1.0), 1e-12)
        assertEquals(0.03 / 12.92, PhotoColor.srgbToLinear(0.03), 1e-12)
        assertEquals(Math.pow((0.5 + 0.055) / 1.055, 2.4), PhotoColor.srgbToLinear(0.5), 1e-12)
        assertEquals(12.92 * 0.003, PhotoColor.linearToSrgb(0.003), 1e-12)
        assertEquals(1.055 * Math.pow(0.5, 1 / 2.4) - 0.055, PhotoColor.linearToSrgb(0.5), 1e-12)
        for (i in 0..100) {
            val x = i / 100.0
            assertEquals(x, PhotoColor.linearToSrgb(PhotoColor.srgbToLinear(x)), 1e-9)
        }
    }

    // ---- TC-EDIT-024..026 -----------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-024 exposure multiplies linear light by 2 to the 1_5 v`() {
        assertNear(gray(205), adjust(gray(128), AdjustValues(exposure = 1.0)), message = "+1")
        assertNear(gray(162), adjust(gray(128), AdjustValues(exposure = 0.5)), message = "+0.5")
        assertNear(gray(78), adjust(gray(128), AdjustValues(exposure = -1.0)), message = "-1")
        assertEquals(gray(128), adjust(gray(128), AdjustValues(exposure = 0.0)))
    }

    @Test
    fun `TC-EDIT-025 warmth scales linear red up and blue down by a quarter`() {
        val warm = adjust(gray(128), AdjustValues(warmth = 1.0))
        assertNear(Rgba(142, 128, 112), warm, message = "+1")
        val cool = adjust(gray(128), AdjustValues(warmth = -1.0))
        assertNear(Rgba(112, 128, 142), cool, message = "-1")
    }

    @Test
    fun `TC-EDIT-026 saturation moves colours around the linear luminance`() {
        val px = Rgba(200, 50, 50)
        assertNear(gray(107), adjust(px, AdjustValues(saturation = -1.0)), message = "-1 is grey")
        val grey = adjust(px, AdjustValues(saturation = -1.0))
        assertTrue(abs(grey.r - grey.g) <= 1 && abs(grey.g - grey.b) <= 1, "$grey")
        assertNear(Rgba(255, 0, 0), adjust(px, AdjustValues(saturation = 1.0)), message = "+1 clamps")
        assertEquals(px, adjust(px, AdjustValues(saturation = 0.0)))
    }

    // ---- TC-EDIT-027 / 028 ----------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-027 the tone stages give the catalog values`() {
        assertEquals(0.1545, ToneCurve.contrast(0.25, 1.0), 0.01)
        assertEquals(0.5, ToneCurve.contrast(0.5, 1.0), 0.01)
        assertEquals(0.8455, ToneCurve.contrast(0.75, 1.0), 0.01)
        assertEquals(0.4815, ToneCurve.shadows(1.0 / 3.0, 1.0), 0.01)
        assertEquals(0.8148, ToneCurve.highlights(2.0 / 3.0, 1.0), 0.01)
        listOf(0.0, 0.2, 0.5, 0.9, 1.0).forEach { t ->
            assertEquals(t, ToneCurve.contrast(t, 0.0), 1e-12)
            assertEquals(t, ToneCurve.shadows(t, 0.0), 1e-12)
            assertEquals(t, ToneCurve.highlights(t, 0.0), 1e-12)
        }
    }

    @Test
    fun `TC-EDIT-027 black point minus one lifts black to 0_3 and plus one cuts everything below 0_3 to zero`() {
        val lifted = ToneCurve.table(blackPoint = -1.0, shadows = 0.0, highlights = 0.0, contrast = 0.0)
        assertEquals(0.3, lifted[0], 0.01)
        assertEquals(1.0, lifted[255], 1e-9)
        val cut = ToneCurve.table(blackPoint = 1.0, shadows = 0.0, highlights = 0.0, contrast = 0.0)
        assertEquals(0.0, cut[0], 1e-12)
        assertEquals(0.0, cut[76], 1e-12, "76/255 = 0.298 < 0.3")
        assertTrue(cut[90] > 0.0)
        assertEquals(1.0, cut[255], 1e-9)
    }

    @Test
    fun `TC-EDIT-027 the table of the single stages matches the stage formulas at grid points`() {
        val contrast = ToneCurve.table(0.0, 0.0, 0.0, 1.0)
        assertEquals(0.5, contrast[128], 0.01)
        val shadows = ToneCurve.table(0.0, 1.0, 0.0, 0.0)
        assertEquals(0.4815, shadows[85], 0.01, "85/255 = 1/3")
        val highlights = ToneCurve.table(0.0, 0.0, 1.0, 0.0)
        assertEquals(0.8148, highlights[170], 0.01, "170/255 = 2/3")
    }

    @Test
    fun `TC-EDIT-028 every combination of black point shadows highlights contrast starts at the output black, ends at one and never decreases`() {
        val steps = listOf(-1.0, 0.0, 1.0)
        for (bp in steps) for (sh in steps) for (hi in steps) for (co in steps) {
            val table = ToneCurve.table(bp, sh, hi, co)
            assertEquals(256, table.size)
            assertEquals(0.3 * maxOf(-bp, 0.0), table[0], 1e-9, "start for bp=$bp sh=$sh hi=$hi co=$co")
            assertEquals(1.0, table[255], 1e-9, "end for bp=$bp sh=$sh hi=$hi co=$co")
            for (i in 1..255) {
                assertTrue(table[i] >= table[i - 1] - 1e-12, "decreases at $i for bp=$bp sh=$sh hi=$hi co=$co")
            }
        }
    }

    // ---- TC-EDIT-029 ----------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-029 no adjustment and the original filter change no pixel and no alpha`() {
        val random = Random(1)
        repeat(300) {
            val px = Rgba(random.nextInt(256), random.nextInt(256), random.nextInt(256), random.nextInt(256))
            assertEquals(px, adjust(px, AdjustValues(), PhotoFilter.ORIGINAL))
        }
        listOf(0, 1, 127, 128, 254, 255).forEach { v -> assertEquals(gray(v), adjust(gray(v), AdjustValues())) }
    }

    @Test
    fun `TC-EDIT-029 stage order is linear stage then tone table (stored values) then the filter`() {
        // exposure first, contrast second: 128 -> 205 -> about 228. (Contrast first would end near 205.)
        val both = adjust(gray(128), AdjustValues(exposure = 1.0, contrast = 1.0))
        assertNear(gray(228), both, message = "exposure then contrast")
        // shadows are applied to the exposed value, not to the input: 100 -> exposure 0.3 -> shadows 1 -> about 150.
        val combo = adjust(gray(100), AdjustValues(exposure = 0.3, shadows = 1.0))
        assertNear(gray(150), combo, message = "exposure then shadows")
    }

    @Test
    fun `TC-EDIT-029 the filter runs last and sees the adjusted pixels`() {
        val values = AdjustValues(exposure = 0.4, saturation = 0.5, contrast = 0.3)
        val random = Random(9)
        repeat(100) {
            val px = Rgba(random.nextInt(256), random.nextInt(256), random.nextInt(256), 200)
            PhotoFilter.entries.forEach { filter ->
                val expected = PhotoColor.applyFilter(adjust(px, values, PhotoFilter.ORIGINAL), filter)
                assertNear(expected, adjust(px, values, filter), tolerance = 1, message = "$px $filter")
            }
        }
    }

    @Test
    fun `TC-EDIT-029 adjustments leave alpha alone`() {
        val px = Rgba(120, 80, 40, 77)
        assertEquals(77, adjust(px, AdjustValues(exposure = 1.0, warmth = 0.5, saturation = -0.5, blackPoint = 0.4)).a)
        PhotoFilter.entries.forEach { assertEquals(77, PhotoColor.applyFilter(px, it).a, "$it") }
    }

    // ---- filters --------------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-040 the original filter changes nothing`() {
        val random = Random(2)
        repeat(100) {
            val px = Rgba(random.nextInt(256), random.nextInt(256), random.nextInt(256), random.nextInt(256))
            assertEquals(px, PhotoColor.applyFilter(px, PhotoFilter.ORIGINAL))
        }
    }

    @Test
    fun `TC-EDIT-041 the mono filter makes every pixel grey`() {
        val random = Random(7)
        repeat(300) {
            val out = PhotoColor.applyFilter(Rgba(random.nextInt(256), random.nextInt(256), random.nextInt(256)), PhotoFilter.MONO)
            assertTrue(out.r == out.g && out.g == out.b, "$out")
        }
        assertEquals(gray(76), PhotoColor.applyFilter(Rgba(255, 0, 0), PhotoFilter.MONO), "0.299 * 255 = 76.2")
        assertEquals(gray(255), PhotoColor.applyFilter(Rgba(255, 255, 255), PhotoFilter.MONO))
    }

    @Test
    fun `TC-EDIT-042 warm raises red above blue and cool does the opposite on mid grey`() {
        val warm = PhotoColor.applyFilter(gray(128), PhotoFilter.WARM)
        val cool = PhotoColor.applyFilter(gray(128), PhotoFilter.COOL)
        assertTrue(warm.r > warm.b, "$warm")
        assertTrue(cool.b > cool.r, "$cool")
        assertEquals(Rgba(146, 135, 113), warm)
        assertEquals(Rgba(115, 130, 151), cool)
    }

    @Test
    fun `TC-EDIT-043 vintage and vivid give the golden values within 2 on a patch`() {
        val vintage = mapOf(
            Rgba(100, 150, 200) to Rgba(152, 160, 160),
            Rgba(255, 0, 0) to Rgba(179, 55, 41),
            Rgba(10, 200, 30) to Rgba(97, 170, 75),
            Rgba(0, 0, 0) to Rgba(18, 14, 10),
        )
        val vivid = mapOf(
            Rgba(100, 150, 200) to Rgba(85, 152, 220),
            Rgba(255, 0, 0) to Rgba(255, 0, 0),
            Rgba(10, 200, 30) to Rgba(0, 218, 0),
            Rgba(0, 0, 0) to Rgba(0, 0, 0),
        )
        vintage.forEach { (input, expected) -> assertNear(expected, PhotoColor.applyFilter(input, PhotoFilter.VINTAGE), message = "vintage $input") }
        vivid.forEach { (input, expected) -> assertNear(expected, PhotoColor.applyFilter(input, PhotoFilter.VIVID), message = "vivid $input") }
    }

    @Test
    fun `TC-EDIT-043 results are clamped to 0 to 255 and rounded`() {
        val out = PhotoColor.applyFilter(Rgba(255, 255, 255), PhotoFilter.WARM)
        assertEquals(Rgba(255, 255, 224), out, "1.08*255+8 and 1.02*255+4 clamp, 0.88*255 = 224.4")
        val low = PhotoColor.applyFilter(Rgba(0, 0, 0), PhotoFilter.VIVID)
        assertEquals(Rgba(0, 0, 0), low)
    }
}
