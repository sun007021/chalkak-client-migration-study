package kr.chalkak.feature.onboarding

import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import kotlin.system.measureTimeMillis
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/** Pixel-level checks of the upload PNG (REQ-SIGN-005..008). No golden image exists yet (spec open question 1). */
class SignaturePngEncoderTest {
    private val encoder = SignaturePngEncoder()
    private val pad = CanvasSize(400f, 200f)
    private val padding = 48
    private val half = 7

    @BeforeTest
    fun headless() {
        System.setProperty("java.awt.headless", "true")
    }

    private fun decode(bytes: ByteArray): BufferedImage = assertNotNull(ImageIO.read(ByteArrayInputStream(bytes)), "not a decodable PNG")

    private fun alpha(img: BufferedImage, x: Int, y: Int) = (img.getRGB(x, y) ushr 24) and 0xFF

    /** Bounding box (minX, minY, maxX, maxY) of pixels with alpha > 127, or null. */
    private fun bounds(img: BufferedImage): IntArray? {
        var minX = Int.MAX_VALUE; var minY = Int.MAX_VALUE; var maxX = -1; var maxY = -1
        for (y in 0 until img.height) for (x in 0 until img.width) {
            if (alpha(img, x, y) > 127) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        }
        return if (maxX < 0) null else intArrayOf(minX, minY, maxX, maxY)
    }

    private fun squiggle() = stroke(20f to 150f, 80f to 40f, 150f to 160f, 230f to 30f, 330f to 170f)

    @Test
    fun `TC-SIGN-009 output is exactly 1024 by 512 for any stroke`() {
        listOf(listOf(squiggle()), listOf(dot()), listOf(line()), listOf(squiggle(), line(10f), dot(300f, 100f))).forEach { strokes ->
            val img = decode(encoder.encode(strokes, pad))
            assertEquals(1024, img.width)
            assertEquals(512, img.height)
        }
    }

    @Test
    fun `TC-SIGN-013 output is a valid PNG starting with the PNG signature`() {
        val bytes = encoder.encode(listOf(squiggle()), pad)
        val signature = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        assertContentEquals(signature, bytes.copyOfRange(0, 8))
        decode(bytes)
    }

    @Test
    fun `TC-SIGN-010 background is fully transparent and every visible pixel is pure white`() {
        val img = decode(encoder.encode(listOf(squiggle()), pad))
        assertEquals(0, alpha(img, 0, 0))
        assertEquals(0, alpha(img, 1023, 511))
        var opaque = 0
        for (y in 0 until img.height) for (x in 0 until img.width) {
            val argb = img.getRGB(x, y)
            val a = (argb ushr 24) and 0xFF
            if (a > 0) {
                assertEquals(0xFFFFFF, argb and 0xFFFFFF, "pixel ($x,$y) alpha=$a is not white")
            }
            if (a == 255) opaque++
        }
        assertTrue(opaque > 500, "expected a visible stroke, opaque=$opaque")
    }

    @Test
    fun `TC-SIGN-011 a stroke crowded into one corner is fitted inside the padding and centered`() {
        val img = decode(encoder.encode(listOf(stroke(1f to 1f, 40f to 30f, 5f to 45f)), pad))
        val b = assertNotNull(bounds(img))
        assertTrue(b[0] >= padding - half - 1 && b[1] >= padding - half - 1, b.joinToString())
        assertTrue(b[2] <= 1024 - padding + half + 1 && b[3] <= 512 - padding + half + 1, b.joinToString())
        assertTrue(abs((b[0] + b[2]) / 2.0 - 512.0) <= 4.0, "horizontal center ${(b[0] + b[2]) / 2.0}")
        assertTrue(abs((b[1] + b[3]) / 2.0 - 256.0) <= 4.0, "vertical center ${(b[1] + b[3]) / 2.0}")
    }

    @Test
    fun `TC-SIGN-011 a straight line and a single dot do not blow up past the padding`() {
        for (strokes in listOf(listOf(line()), listOf(stroke(10f to 10f, 10f to 150f)), listOf(dot(399f, 199f)))) {
            val b = assertNotNull(bounds(decode(encoder.encode(strokes, pad))))
            assertTrue(b[0] >= padding - half - 1 && b[1] >= padding - half - 1, b.joinToString())
            assertTrue(b[2] <= 1024 - padding + half + 1 && b[3] <= 512 - padding + half + 1, b.joinToString())
        }
    }

    @Test
    fun `TC-SIGN-002 a single dot is drawn as a filled round blob`() {
        val img = decode(encoder.encode(listOf(dot(200f, 100f)), pad))
        val b = assertNotNull(bounds(img))
        val cx = (b[0] + b[2]) / 2
        val cy = (b[1] + b[3]) / 2
        assertEquals(255, alpha(img, cx, cy))
        val w = b[2] - b[0] + 1
        val h = b[3] - b[1] + 1
        assertTrue(w in 4..48 && h in 4..48, "dot size ${w}x$h")
        assertTrue(abs(w - h) <= 2, "dot is not round ${w}x$h")
    }

    @Test
    fun `TC-SIGN-012 stroke is 14px thick with round caps`() {
        val img = decode(encoder.encode(listOf(line()), pad))
        val b = assertNotNull(bounds(img))
        val midX = (b[0] + b[2]) / 2
        fun columnHeight(x: Int) = (0 until img.height).count { alpha(img, x, it) > 127 }
        assertTrue(columnHeight(midX) in 13..15, "thickness ${columnHeight(midX)}")
        // One pixel inside the tip a butt or square cap would still be 14 tall; a round cap is much shorter.
        assertTrue(columnHeight(b[0] + 1) < 12, "left cap height ${columnHeight(b[0] + 1)}")
        assertTrue(columnHeight(b[2] - 1) < 12, "right cap height ${columnHeight(b[2] - 1)}")
    }

    @Test
    fun `TC-SIGN-012 a stroke width does not change with the amount of scaling`() {
        val small = decode(encoder.encode(listOf(stroke(10f to 100f, 40f to 100f)), pad))
        val large = decode(encoder.encode(listOf(stroke(10f to 100f, 390f to 100f)), pad))
        fun thickness(img: BufferedImage): Int {
            val b = assertNotNull(bounds(img))
            val x = (b[0] + b[2]) / 2
            return (0 until img.height).count { alpha(img, x, it) > 127 }
        }
        assertEquals(thickness(small), thickness(large))
    }

    @Test
    fun `TC-SIGN-016 thousands of points encode under 1 MiB in reasonable time`() {
        val points = (0 until 6000).map { i ->
            val t = i / 6000.0
            SignaturePoint((t * 380 + 10).toFloat(), (100 + 80 * sin(t * 40 * PI)).toFloat())
        }
        var bytes = ByteArray(0)
        val ms = measureTimeMillis { bytes = encoder.encode(listOf(SignatureStroke(points)), pad) }
        assertTrue(bytes.size <= 1_048_576, "size ${bytes.size}")
        assertTrue(ms < 10_000, "took $ms ms")
        decode(bytes)
    }

    @Test
    fun `TC-SIGN-003 encoding input without any point is rejected`() {
        assertFailsWith<IllegalArgumentException> { encoder.encode(emptyList(), pad) }
        assertFailsWith<IllegalArgumentException> { encoder.encode(listOf(SignatureStroke(emptyList())), pad) }
    }
}
