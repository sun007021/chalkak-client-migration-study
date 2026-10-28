package kr.chalkak.feature.upload.image

import kr.chalkak.core.common.AppConstants
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Size math of the upload pipeline: TC-UPL-034 (long edge), TC-UPL-038 (0.85x rounds), TC-EDIT-009 / TC-EDIT-040 (editor sizes). */
class ImageSizingTest {
    @Test
    fun `TC-UPL-034 sample size is the smallest power of two that brings the long edge to 4096 or less`() {
        assertEquals(2, ImageSizing.sampleSize(ImageSize(8000, 6000)))
        assertEquals(2, ImageSizing.sampleSize(ImageSize(4608, 3456)))
        assertEquals(2, ImageSizing.sampleSize(ImageSize(4097, 3000)))
        assertEquals(4, ImageSizing.sampleSize(ImageSize(8193, 100)))
        assertEquals(4, ImageSizing.sampleSize(ImageSize(16000, 12000)))
        assertEquals(2, ImageSizing.sampleSize(ImageSize(3000, 8192)))
    }

    @Test
    fun `TC-UPL-034 a photo that already fits is not sampled or enlarged`() {
        assertEquals(1, ImageSizing.sampleSize(ImageSize(4096, 3072)))
        assertEquals(1, ImageSizing.sampleSize(ImageSize(1600, 1200)))
        assertEquals(1, ImageSizing.sampleSize(ImageSize(1, 1)))
        assertEquals(ImageSize(4096, 3072), ImageSizing.sampled(ImageSize(4096, 3072), 1))
    }

    @Test
    fun `TC-UPL-034 sampled sizes match the catalog numbers`() {
        assertEquals(ImageSize(4000, 3000), ImageSizing.sampled(ImageSize(8000, 6000), 2))
        assertEquals(ImageSize(2304, 1728), ImageSizing.sampled(ImageSize(4608, 3456), 2))
        val odd = ImageSizing.sampled(ImageSize(4097, 3000), 2)
        assertTrue(abs(odd.width - 2049) <= 1 && abs(odd.height - 1500) <= 1, "$odd")
        assertEquals(ImageSize(1, 1), ImageSizing.sampled(ImageSize(1, 1), 2))
    }

    @Test
    fun `TC-UPL-034 sampled results keep the aspect ratio within one pixel and respect the long edge limit`() {
        listOf(ImageSize(8000, 6000), ImageSize(4608, 3456), ImageSize(4097, 3000), ImageSize(9001, 3333), ImageSize(5000, 5000)).forEach { src ->
            val out = ImageSizing.sampled(src, ImageSizing.sampleSize(src))
            assertTrue(out.longEdge <= AppConstants.POST_IMAGE_MAX_LONG_EDGE, "$src -> $out")
            val expectedHeight = src.height.toDouble() * out.width / src.width
            assertTrue(abs(expectedHeight - out.height) <= 1.0, "$src -> $out")
        }
    }

    @Test
    fun `TC-UPL-038 one shrink round multiplies by 0_85 and rounds half up`() {
        assertEquals(ImageSize(1360, 1020), ImageSizing.shrunk(ImageSize(1600, 1200)))
        assertEquals(ImageSize(1156, 867), ImageSizing.shrunk(ImageSize(1360, 1020)))
        assertEquals(ImageSize(983, 737), ImageSizing.shrunk(ImageSize(1156, 867)))
        assertEquals(ImageSize(9, 9), ImageSizing.shrunk(ImageSize(10, 10)), "8.5 rounds up")
        assertEquals(ImageSize(1, 1), ImageSizing.shrunk(ImageSize(1, 1)), "never below one pixel")
        assertEquals(ImageSize(1, 3), ImageSizing.shrunk(ImageSize(1, 3)), "0.85 -> 1 and 2.55 -> 3")
    }

    @Test
    fun `TC-EDIT-009 fitLongEdge reduces proportionally and never enlarges`() {
        assertEquals(ImageSize(4096, 3072), ImageSizing.fitLongEdge(ImageSize(8000, 6000), 4096))
        assertEquals(ImageSize(2304, 4096), ImageSizing.fitLongEdge(ImageSize(4608, 8192), 4096))
        assertEquals(ImageSize(1000, 500), ImageSizing.fitLongEdge(ImageSize(1000, 500), 1440))
        assertEquals(ImageSize(4096, 3072), ImageSizing.fitLongEdge(ImageSize(4096, 3072), 4096))
    }

    @Test
    fun `TC-EDIT-040 a preview size makes the long edge exactly that size`() {
        assertEquals(ImageSize(1440, 1080), ImageSizing.fitLongEdge(ImageSize(4000, 3000), 1440))
        assertEquals(ImageSize(1080, 1440), ImageSizing.fitLongEdge(ImageSize(3000, 4000), 1440))
        assertEquals(1440, ImageSizing.fitLongEdge(ImageSize(9999, 777), 1440).longEdge)
    }
}
