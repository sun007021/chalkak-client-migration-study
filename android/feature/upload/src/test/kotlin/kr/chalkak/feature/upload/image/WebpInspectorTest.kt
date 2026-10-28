package kr.chalkak.feature.upload.image

import java.io.ByteArrayOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The parser behind TC-UPL-032 (RIFF/WEBP header and size field) and TC-UPL-033 (chunks: still image, no ANIM/ANMF, no
 * EXIF/XMP/ICCP). The real encoder output is checked with it in the Android module; here synthetic files prove the parser.
 */
class WebpInspectorTest {
    private fun le32(n: Int) = byteArrayOf(n.toByte(), (n shr 8).toByte(), (n shr 16).toByte(), (n shr 24).toByte())

    private fun webp(vararg chunks: Pair<String, Int>, riffSizeDelta: Int = 0, form: String = "WEBP", magic: String = "RIFF"): ByteArray {
        val body = ByteArrayOutputStream()
        body.write(form.toByteArray(Charsets.US_ASCII))
        chunks.forEach { (code, size) ->
            body.write(code.toByteArray(Charsets.US_ASCII))
            body.write(le32(size))
            body.write(ByteArray(size) { 7 })
            if (size % 2 == 1) body.write(0)
        }
        val bytes = body.toByteArray()
        val out = ByteArrayOutputStream()
        out.write(magic.toByteArray(Charsets.US_ASCII))
        out.write(le32(bytes.size + riffSizeDelta))
        out.write(bytes)
        return out.toByteArray()
    }

    @Test
    fun `TC-UPL-032 a plain lossy file has RIFF WEBP, a matching size field and VP8 as first image chunk`() {
        val info = assertNotNull(WebpInspector.inspect(webp("VP8 " to 33)))
        assertTrue(info.riffSizeMatches)
        assertEquals("VP8 ", info.firstImageChunk)
        assertTrue(info.isStillImage)
        assertFalse(info.hasMetadata)
        assertEquals(listOf(WebpChunk("VP8 ", 33)), info.chunks)
    }

    @Test
    fun `TC-UPL-032 a wrong RIFF size field is reported`() {
        assertFalse(assertNotNull(WebpInspector.inspect(webp("VP8 " to 32, riffSizeDelta = 4))).riffSizeMatches)
        assertFalse(assertNotNull(WebpInspector.inspect(webp("VP8 " to 32, riffSizeDelta = -2))).riffSizeMatches)
    }

    @Test
    fun `TC-UPL-032 anything that is not RIFF WEBP is null`() {
        assertNull(WebpInspector.inspect(webp("VP8 " to 32, form = "WAVE")))
        assertNull(WebpInspector.inspect(webp("VP8 " to 32, magic = "RIFX")))
        assertNull(WebpInspector.inspect(ByteArray(0)))
        assertNull(WebpInspector.inspect(byteArrayOf(1, 2, 3)))
        assertNull(WebpInspector.inspect("RIFF".toByteArray()))
    }

    @Test
    fun `TC-UPL-033 VP8L and VP8X plus a still image are accepted`() {
        val lossless = assertNotNull(WebpInspector.inspect(webp("VP8L" to 20)))
        assertEquals("VP8L", lossless.firstImageChunk)
        assertTrue(lossless.isStillImage)
        val extended = assertNotNull(WebpInspector.inspect(webp("VP8X" to 10, "VP8 " to 40)))
        assertEquals(listOf("VP8X", "VP8 "), extended.chunks.map { it.fourCc })
        assertEquals("VP8 ", extended.firstImageChunk, "VP8X is only the header")
        assertTrue(extended.isStillImage)
        assertTrue(extended.riffSizeMatches)
    }

    @Test
    fun `TC-UPL-033 ANIM or ANMF chunks make it animated`() {
        val animated = assertNotNull(WebpInspector.inspect(webp("VP8X" to 10, "ANIM" to 6, "ANMF" to 30)))
        assertFalse(animated.isStillImage)
        val frameOnly = assertNotNull(WebpInspector.inspect(webp("VP8X" to 10, "ANMF" to 30)))
        assertFalse(frameOnly.isStillImage)
    }

    @Test
    fun `TC-UPL-033 EXIF XMP and ICCP chunks count as metadata, odd sized chunks are padded`() {
        listOf("EXIF", "XMP ", "ICCP").forEach { code ->
            val info = assertNotNull(WebpInspector.inspect(webp("VP8X" to 10, "VP8 " to 33, code to 11)))
            assertTrue(info.hasMetadata, code)
            assertTrue(info.riffSizeMatches, "padding bytes are counted: $code")
            assertEquals(listOf("VP8X", "VP8 ", code), info.chunks.map { it.fourCc })
        }
    }

    @Test
    fun `TC-UPL-033 a file without an image chunk is not a still image`() {
        val info = assertNotNull(WebpInspector.inspect(webp("EXIF" to 8)))
        assertNull(info.firstImageChunk)
        assertFalse(info.isStillImage)
    }
}
