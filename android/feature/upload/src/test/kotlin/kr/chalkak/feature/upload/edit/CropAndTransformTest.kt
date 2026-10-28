package kr.chalkak.feature.upload.edit

import kr.chalkak.feature.upload.image.ImageSize
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Rotation / crop coordinates and crop frame geometry: TC-EDIT-014/016/017/018/019/020. */
class CropAndTransformTest {
    private val tol = 1e-9
    private val src = ImageSize(4000, 3000)

    private fun assertWindow(expected: CropWindow, actual: CropWindow, tolerance: Double = 1e-9) {
        assertEquals(expected.centerX, actual.centerX, tolerance, "centerX $actual")
        assertEquals(expected.centerY, actual.centerY, tolerance, "centerY $actual")
        assertEquals(expected.width, actual.width, tolerance, "width $actual")
        assertEquals(expected.height, actual.height, tolerance, "height $actual")
    }

    private fun assertFrame(expected: CropFrame, actual: CropFrame, tolerance: Double = 1e-9) {
        assertEquals(expected.centerX, actual.centerX, tolerance, "centerX $actual")
        assertEquals(expected.centerY, actual.centerY, tolerance, "centerY $actual")
        assertEquals(expected.width, actual.width, tolerance, "width $actual")
        assertEquals(expected.height, actual.height, tolerance, "height $actual")
    }

    // ---- TC-EDIT-016 / 017 --------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-016 left half of the turned 3000x4000 photo maps to centre 2000 2250, window 0_5 0_75 0_5 1, output 1500x4000`() {
        val point = PhotoEditTransform.toSource(src, 1, 750.0, 2000.0)
        assertEquals(2000.0, point.x, tol)
        assertEquals(2250.0, point.y, tol)
        assertEquals(ImageSize(3000, 4000), PhotoEditTransform.rotatedSize(src, 1))
        val window = PhotoEditTransform.cropWindowFor(src, 1, CropFrame(0.25, 0.5, 0.5, 1.0))
        assertWindow(CropWindow(0.5, 0.75, 0.5, 1.0), window)
        assertEquals(ImageSize(1500, 4000), PhotoEditTransform.outputSize(src, 1, window))
    }

    @Test
    fun `TC-EDIT-017 a turned point maps back to the original with the four formulas`() {
        val p0 = PhotoEditTransform.toSource(src, 0, 100.0, 200.0)
        assertEquals(100.0 to 200.0, p0.x to p0.y)
        val p1 = PhotoEditTransform.toSource(src, 1, 100.0, 200.0)
        assertEquals(200.0 to 2900.0, p1.x to p1.y)
        val p2 = PhotoEditTransform.toSource(src, 2, 100.0, 200.0)
        assertEquals(3900.0 to 2800.0, p2.x to p2.y)
        val p3 = PhotoEditTransform.toSource(src, 3, 100.0, 200.0)
        assertEquals(3800.0 to 100.0, p3.x to p3.y)
    }

    @Test
    fun `TC-EDIT-017 the turned size swaps for odd turns and the full output equals it`() {
        listOf(0 to ImageSize(4000, 3000), 1 to ImageSize(3000, 4000), 2 to ImageSize(4000, 3000), 3 to ImageSize(3000, 4000)).forEach { (turns, size) ->
            assertEquals(size, PhotoEditTransform.rotatedSize(src, turns), "turns=$turns")
            assertEquals(size, PhotoEditTransform.outputSize(src, turns, CropWindow.FULL), "turns=$turns")
        }
    }

    @Test
    fun `TC-EDIT-017 a frame in the top-left quarter of a half-turned photo is the bottom-right quarter of the original`() {
        val window = PhotoEditTransform.cropWindowFor(src, 2, CropFrame(0.25, 0.25, 0.5, 0.5))
        assertWindow(CropWindow(0.75, 0.75, 0.5, 0.5), window)
    }

    @Test
    fun `TC-EDIT-017 frameFor is the inverse of cropWindowFor for every turn`() {
        val frames = listOf(CropFrame.FULL, CropFrame(0.25, 0.5, 0.5, 1.0), CropFrame(0.3, 0.7, 0.2, 0.4), CropFrame(0.8, 0.2, 0.3, 0.3))
        for (turns in 0..3) {
            frames.forEach { frame ->
                val window = PhotoEditTransform.cropWindowFor(src, turns, frame)
                assertFrame(frame, PhotoEditTransform.frameFor(src, turns, window), 1e-9)
            }
        }
    }

    // ---- TC-EDIT-014 / 015 frames ---------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-014 a new ratio starts from the whole photo as the largest centred frame`() {
        assertFrame(CropFrame(0.5, 0.5, 0.6, 1.0), CropGeometry.largestFrame(src, 4.0 / 5.0))
        assertFrame(CropFrame(0.5, 0.5, 0.75, 1.0), CropGeometry.largestFrame(src, 1.0))
        assertFrame(CropFrame(0.5, 0.5, 1.0, 0.75), CropGeometry.largestFrame(src, 16.0 / 9.0))
        assertFrame(CropFrame(0.5, 0.5, 1.0, 0.9375), CropGeometry.largestFrame(ImageSize(3000, 4000), 4.0 / 5.0))
        assertFrame(CropFrame.FULL, CropGeometry.largestFrame(src, null))
    }

    @Test
    fun `TC-EDIT-014 the largest frame always has the requested pixel ratio and fits`() {
        val random = Random(11)
        repeat(200) {
            val image = ImageSize(200 + random.nextInt(5000), 200 + random.nextInt(5000))
            val ratio = 0.3 + random.nextDouble() * 3
            val frame = CropGeometry.largestFrame(image, ratio)
            assertEquals(ratio, frame.width * image.width / (frame.height * image.height), 1e-9, "$image $ratio")
            assertTrue(frame.width <= 1.0 + tol && frame.height <= 1.0 + tol)
            assertTrue(frame.width >= 1.0 - tol || frame.height >= 1.0 - tol, "largest: touches the photo on one axis")
        }
    }

    // ---- TC-EDIT-018 ----------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-018 moving never leaves the photo and keeps the size`() {
        val frame = CropFrame(0.5, 0.5, 0.4, 0.4)
        assertFrame(CropFrame(0.8, 0.8, 0.4, 0.4), CropGeometry.move(frame, 0.5, 0.5))
        assertFrame(CropFrame(0.2, 0.2, 0.4, 0.4), CropGeometry.move(frame, -0.9, -0.9))
        assertFrame(CropFrame(0.6, 0.45, 0.4, 0.4), CropGeometry.move(frame, 0.1, -0.05))
    }

    @Test
    fun `TC-EDIT-018 dragging a corner past the photo stops at the edge and the opposite corner stays`() {
        val frame = CropFrame(0.3, 0.3, 0.4, 0.4) // 0.1..0.5
        val out = CropGeometry.resize(frame, CropCorner.BOTTOM_RIGHT, 2.0, 2.0, src, null)
        assertFrame(CropFrame(0.55, 0.55, 0.9, 0.9), out)
        val topLeft = CropGeometry.resize(frame, CropCorner.TOP_LEFT, -1.0, -1.0, src, null)
        assertFrame(CropFrame(0.25, 0.25, 0.5, 0.5), topLeft)
    }

    @Test
    fun `TC-EDIT-018 the shorter pixel side never goes below a tenth of the photo's shorter side`() {
        val frame = CropFrame(0.3, 0.3, 0.4, 0.4)
        val out = CropGeometry.resize(frame, CropCorner.BOTTOM_RIGHT, 0.1, 0.1, src, null)
        val shorter = minOf(out.width * src.width, out.height * src.height)
        assertTrue(shorter >= 0.1 * 3000 - 1e-6, "shorter side $shorter px")
        assertEquals(0.1, out.centerX - out.width / 2, 1e-9, "the anchored corner did not move")
        assertEquals(0.1, out.centerY - out.height / 2, 1e-9)
        assertEquals(0.1, CropGeometry.MIN_CROP_FRACTION)
    }

    @Test
    fun `TC-EDIT-018 with a fixed ratio every drag keeps the ratio, the bounds and the minimum`() {
        val random = Random(42)
        val corners = CropCorner.entries
        repeat(500) {
            val image = ImageSize(500 + random.nextInt(4000), 500 + random.nextInt(4000))
            val ratio = listOf(1.0, 4.0 / 5.0, 5.0 / 4.0, 9.0 / 16.0, 16.0 / 9.0)[random.nextInt(5)]
            var frame = CropGeometry.largestFrame(image, ratio)
            repeat(5) {
                val corner = corners[random.nextInt(4)]
                val x = random.nextDouble() * 1.6 - 0.3
                val y = random.nextDouble() * 1.6 - 0.3
                frame = CropGeometry.resize(frame, corner, x, y, image, ratio)
                val left = frame.centerX - frame.width / 2
                val right = frame.centerX + frame.width / 2
                val top = frame.centerY - frame.height / 2
                val bottom = frame.centerY + frame.height / 2
                assertTrue(left >= -1e-9 && top >= -1e-9 && right <= 1 + 1e-9 && bottom <= 1 + 1e-9, "inside: $frame in $image")
                assertEquals(ratio, frame.width * image.width / (frame.height * image.height), 1e-6, "ratio kept: $frame")
                val shorter = minOf(frame.width * image.width, frame.height * image.height)
                assertTrue(shorter >= 0.1 * minOf(image.width, image.height) - 1e-6, "minimum: $shorter px in $image")
            }
        }
    }

    @Test
    fun `TC-EDIT-018 a free drag keeps the frame inside the photo and above the minimum`() {
        val random = Random(5)
        repeat(500) {
            val image = ImageSize(500 + random.nextInt(4000), 500 + random.nextInt(4000))
            var frame = CropFrame.FULL
            repeat(5) {
                val corner = CropCorner.entries[random.nextInt(4)]
                frame = CropGeometry.resize(frame, corner, random.nextDouble() * 1.6 - 0.3, random.nextDouble() * 1.6 - 0.3, image, null)
                val left = frame.centerX - frame.width / 2
                val top = frame.centerY - frame.height / 2
                assertTrue(left >= -1e-9 && top >= -1e-9 && left + frame.width <= 1 + 1e-9 && top + frame.height <= 1 + 1e-9, "$frame")
                assertTrue(minOf(frame.width * image.width, frame.height * image.height) >= 0.1 * minOf(image.width, image.height) - 1e-6)
            }
        }
    }

    // ---- TC-EDIT-019 ----------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-019 fit scale is the smaller box ratio`() {
        assertEquals(0.25, CropGeometry.fitScale(ImageSize(4000, 3000), 1000.0, 1000.0), tol)
        assertEquals(0.36, CropGeometry.fitScale(ImageSize(3000, 4000), 1080.0, 1920.0), tol)
    }

    @Test
    fun `TC-EDIT-019 screen and fraction coordinates round trip within 1e-6`() {
        assertEquals(500.0, CropGeometry.toScreen(0.5, 4000, 0.25), tol)
        val random = Random(3)
        repeat(300) {
            val side = 100 + random.nextInt(6000)
            val scale = 0.05 + random.nextDouble()
            val fraction = random.nextDouble()
            val back = CropGeometry.toFraction(CropGeometry.toScreen(fraction, side, scale), side, scale)
            assertEquals(fraction, back, 1e-6)
        }
    }

    // ---- TC-EDIT-020 ----------------------------------------------------------------------------------------

    @Test
    fun `TC-EDIT-020 a quarter-size centre crop of the 4000x3000 reduced image is 1000x750`() {
        val reduced = ImageSize(4000, 3000)
        assertEquals(ImageSize(1000, 750), PhotoEditTransform.outputSize(reduced, 0, CropWindow(0.5, 0.5, 0.25, 0.25)))
    }
}
