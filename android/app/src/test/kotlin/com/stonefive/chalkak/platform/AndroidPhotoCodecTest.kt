package com.stonefive.chalkak.platform

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kr.chalkak.feature.upload.edit.AdjustValues
import kr.chalkak.feature.upload.edit.CropWindow
import kr.chalkak.feature.upload.edit.PhotoColor
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditTransform
import kr.chalkak.feature.upload.edit.PhotoFilter
import kr.chalkak.feature.upload.edit.Rgba
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PhotoSource
import kr.chalkak.feature.upload.image.PickedPhoto
import java.io.File
import kotlin.math.abs
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(RobolectricTestRunner::class)
class AndroidPhotoCodecTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val resolver = ApplicationProvider.getApplicationContext<android.content.Context>().contentResolver
    private val bitmaps = OrientedBitmaps(PhotoSources(resolver))
    private val codec = AndroidPhotoCodec(bitmaps)

    private val red = Color.rgb(255, 0, 0)
    private val green = Color.rgb(0, 255, 0)
    private val blue = Color.rgb(0, 0, 255)
    private val yellow = Color.rgb(255, 255, 0)

    /** Stored pixels 120x80: TL red, TR green, BL blue, BR yellow (40x40 blocks) on grey, JPEG with EXIF [orientation]. */
    private fun markerJpeg(orientation: Int): PickedPhoto {
        val bitmap = Bitmap.createBitmap(120, 80, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.GRAY)
        for (x in 0 until 40) for (y in 0 until 40) {
            bitmap.setPixel(x, y, red)
            bitmap.setPixel(119 - x, y, green)
            bitmap.setPixel(x, 79 - y, blue)
            bitmap.setPixel(119 - x, 79 - y, yellow)
        }
        val file = File.createTempFile("marker-$orientation-", ".jpg", folder.root)
        file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 100, it) }
        ExifInterface(file.absolutePath).apply {
            setAttribute(ExifInterface.TAG_ORIENTATION, orientation.toString())
            saveAttributes()
        }
        return photoOf(file)
    }

    private fun photoOf(file: File) = PickedPhoto(Uri.fromFile(file).toString(), PhotoSource.ALBUM)

    private fun dominant(color: Int): Int = when {
        Color.red(color) > 150 && Color.green(color) > 150 -> yellow
        Color.red(color) > 150 -> red
        Color.green(color) > 150 -> green
        Color.blue(color) > 150 -> blue
        else -> Color.GRAY
    }

    private fun corners(bitmap: Bitmap): List<Int> {
        val inset = 4
        val w = bitmap.width
        val h = bitmap.height
        return listOf(
            bitmap.getPixel(inset, inset), bitmap.getPixel(w - 1 - inset, inset),
            bitmap.getPixel(inset, h - 1 - inset), bitmap.getPixel(w - 1 - inset, h - 1 - inset),
        ).map(::dominant)
    }

    @Test
    fun `TC-UPL-036 EXIF 방향 1부터 8까지 모두 화면에 보이던 방향대로 모서리 마커가 놓인다`() {
        // displayed corners (TL, TR, BL, BR) for stored TL=red, TR=green, BL=blue, BR=yellow
        val expected = mapOf(
            1 to listOf(red, green, blue, yellow),
            2 to listOf(green, red, yellow, blue),
            3 to listOf(yellow, blue, green, red),
            4 to listOf(blue, yellow, red, green),
            5 to listOf(red, blue, green, yellow),
            6 to listOf(blue, red, yellow, green),
            7 to listOf(yellow, green, blue, red),
            8 to listOf(green, yellow, red, blue),
        )
        expected.forEach { (orientation, colors) ->
            val decoded = bitmaps.decode(markerJpeg(orientation), 1)
            assertEquals(colors, corners(decoded), "orientation $orientation")
        }
    }

    @Test
    fun `TC-UPL-036 방향 5부터 8은 읽은 크기의 가로 세로를 바꾼다`() {
        assertEquals(ImageSize(120, 80), bitmaps.bounds(markerJpeg(1)))
        assertEquals(ImageSize(120, 80), bitmaps.bounds(markerJpeg(3)))
        listOf(5, 6, 7, 8).forEach { assertEquals(ImageSize(80, 120), bitmaps.bounds(markerJpeg(it)), "orientation $it") }
        val decoded = bitmaps.decode(markerJpeg(6), 1)
        assertEquals(80, decoded.width)
        assertEquals(120, decoded.height)
    }

    @Test
    fun `TC-UPL-021 0바이트 파일과 이미지가 아닌 파일은 읽을 수 없는 사진이다`() = runTest {
        val empty = folder.newFile("zero-bytes.jpg")
        assertNull(codec.readBounds(photoOf(empty)))
        val text = folder.newFile("not-an-image.jpg").apply { writeText("hello") }
        assertNull(codec.readBounds(photoOf(text)))
    }

    @Test
    fun `TC-UPL-035 표본 크기를 주면 그만큼 줄여 읽는다`() = runTest {
        val photo = markerJpeg(1)
        val half = codec.decode(photo, 2)
        assertEquals(ImageSize(60, 40), half.size)
        half.release()
    }

    @Test
    fun `TC-EDIT-020 렌더는 돌린 뒤 자른 크기로 나오고 원본 비트맵은 그대로 둔다`() = runTest {
        val source = codec.decode(markerJpeg(1), 1)
        val edit = PhotoEdit(quarterTurns = 1, crop = CropWindow(0.5, 0.75, 0.5, 1.0))
        val expected = PhotoEditTransform.outputSize(ImageSize(120, 80), 1, edit.crop)
        val rendered = codec.render(source, edit)
        assertEquals(expected, rendered.size)
        assertEquals(ImageSize(120, 80), source.size, "the decoded source is untouched")
        assertTrue(!(source as AndroidDecodedImage).bitmap.isRecycled)
        rendered.release()
        source.release()
    }

    @Test
    fun `TC-UPL-033 WebP 압축은 RIFF WEBP 컨테이너 한 장을 만든다`() = runTest {
        val source = codec.decode(markerJpeg(1), 1)
        val bytes = AndroidWebpCompressor().compress(source, 80)
        assertEquals("RIFF", String(bytes, 0, 4, Charsets.US_ASCII))
        assertEquals("WEBP", String(bytes, 8, 4, Charsets.US_ASCII))
        val back = assertNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
        assertEquals(120, back.width)
        source.release()
    }

    @Test
    fun `TC-EDIT-029 조정 값이 모두 0이고 원본 필터이면 픽셀이 변하지 않는다`() = runTest {
        val bitmap = Bitmap.createBitmap(4, 1, Bitmap.Config.ARGB_8888)
        val pixels = listOf(Color.rgb(10, 20, 30), Color.rgb(128, 128, 128), Color.rgb(250, 3, 99), Color.rgb(0, 0, 0))
        pixels.forEachIndexed { i, p -> bitmap.setPixel(i, 0, p) }
        PixelPipeline.applyInPlace(bitmap, AdjustValues(), PhotoFilter.ORIGINAL)
        pixels.forEachIndexed { i, p -> assertEquals(p, bitmap.getPixel(i, 0)) }
    }

    @Test
    fun `TC-EDIT-029 비트맵 파이프라인은 공통 픽셀 파이프라인과 2 이내로 같다`() = runTest {
        val inputs = listOf(Rgba(128, 128, 128), Rgba(200, 50, 50), Rgba(10, 240, 90), Rgba(255, 255, 255), Rgba(0, 0, 0), Rgba(33, 66, 199))
        val values = listOf(
            AdjustValues(exposure = 0.5),
            AdjustValues(warmth = 1.0, saturation = -0.5),
            AdjustValues(contrast = 0.6, shadows = 0.4, highlights = -0.3, blackPoint = 0.2),
            AdjustValues(exposure = -0.4, blackPoint = -0.5, saturation = 0.7),
        )
        for (v in values) for (filter in listOf(PhotoFilter.ORIGINAL, PhotoFilter.MONO, PhotoFilter.VINTAGE, PhotoFilter.VIVID)) {
            val bitmap = Bitmap.createBitmap(inputs.size, 1, Bitmap.Config.ARGB_8888)
            inputs.forEachIndexed { i, p -> bitmap.setPixel(i, 0, Color.rgb(p.r, p.g, p.b)) }
            PixelPipeline.applyInPlace(bitmap, v, filter)
            inputs.forEachIndexed { i, p ->
                val want = PhotoColor.apply(p, v, filter)
                val got = bitmap.getPixel(i, 0)
                assertTrue(abs(Color.red(got) - want.r) <= 2 && abs(Color.green(got) - want.g) <= 2 && abs(Color.blue(got) - want.b) <= 2, "$p $v $filter: ${Color.red(got)},${Color.green(got)},${Color.blue(got)} vs $want")
            }
        }
    }
}
