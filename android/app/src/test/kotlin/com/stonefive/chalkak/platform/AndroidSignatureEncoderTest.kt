package com.stonefive.chalkak.platform

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import kr.chalkak.feature.onboarding.CanvasSize
import kr.chalkak.feature.onboarding.SignaturePoint
import kr.chalkak.feature.onboarding.SignatureStroke
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AndroidSignatureEncoderTest {
    private val encoder = AndroidSignatureEncoder()
    private val canvas = CanvasSize(1000f, 1000f)
    private val diagonal = listOf(SignatureStroke(listOf(SignaturePoint(100f, 100f), SignaturePoint(500f, 300f), SignaturePoint(900f, 200f))))

    private fun decode(png: ByteArray): Bitmap = assertNotNull(BitmapFactory.decodeByteArray(png, 0, png.size))

    @Test
    fun `TC-SIGN-013 출력은 PNG 시그니처로 시작한다`() {
        val png = encoder.encode(diagonal, canvas)
        assertContentEquals(byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A), png.copyOfRange(0, 8))
    }

    @Test
    fun `TC-SIGN-009 출력 크기는 정확히 1024x512이다`() {
        val bitmap = decode(encoder.encode(diagonal, canvas))
        assertEquals(1024, bitmap.width)
        assertEquals(512, bitmap.height)
    }

    @Test
    fun `TC-SIGN-010 배경은 투명하고 획 픽셀은 흰색이다`() {
        val bitmap = decode(encoder.encode(diagonal, canvas))
        assertEquals(0, Color.alpha(bitmap.getPixel(2, 2)), "corner is transparent")
        var ink = 0
        for (y in 0 until bitmap.height step 4) for (x in 0 until bitmap.width step 4) {
            val pixel = bitmap.getPixel(x, y)
            if (Color.alpha(pixel) == 255) {
                ink++
                assertEquals(255, Color.red(pixel))
                assertEquals(255, Color.green(pixel))
                assertEquals(255, Color.blue(pixel))
            }
        }
        assertTrue(ink > 0, "some opaque white ink pixels")
    }

    @Test
    fun `TC-SIGN-011 획은 패딩 48px 안쪽 가운데에 맞춰진다`() {
        val bitmap = decode(encoder.encode(diagonal, canvas))
        var minX = bitmap.width; var maxX = -1; var minY = bitmap.height; var maxY = -1
        for (y in 0 until bitmap.height) for (x in 0 until bitmap.width) {
            if (Color.alpha(bitmap.getPixel(x, y)) > 0) {
                minX = minOf(minX, x); maxX = maxOf(maxX, x); minY = minOf(minY, y); maxY = maxOf(maxY, y)
            }
        }
        // The centreline touches the padded area; the 14px round stroke reaches 7px beyond it.
        assertTrue(minX >= 48 - 8 && maxX <= 1024 - 48 + 8, "x range $minX..$maxX")
        assertTrue(minY >= 48 - 8 && maxY <= 512 - 48 + 8, "y range $minY..$maxY")
        assertTrue(kotlin.math.abs((minX + maxX) / 2 - 512) <= 2, "horizontally centred")
    }

    @Test
    fun `TC-SIGN-011 점 하나는 채워진 원이다`() {
        val bitmap = decode(encoder.encode(listOf(SignatureStroke(listOf(SignaturePoint(300f, 300f)))), canvas))
        assertEquals(255, Color.alpha(bitmap.getPixel(512, 256)))
    }

    @Test
    fun `TC-SIGN-003 점이 없으면 인코딩하지 않는다`() {
        assertFailsWith<IllegalArgumentException> { encoder.encode(listOf(SignatureStroke(emptyList())), canvas) }
    }
}
