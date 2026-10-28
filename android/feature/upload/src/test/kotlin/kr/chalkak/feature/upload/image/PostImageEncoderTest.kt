package kr.chalkak.feature.upload.image

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.feature.upload.FakeCodec
import kr.chalkak.feature.upload.FakeCompressor
import kr.chalkak.feature.upload.bytesOf
import kr.chalkak.feature.upload.edit.CropWindow
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.edit.PhotoEditTransform
import kr.chalkak.feature.upload.photo
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** The WebP ladder with a fake [WebpCompressor]: TC-UPL-034/035/037/038/039/042/045/046, TC-EDIT-010/011/020. */
class PostImageEncoderTest {
    private class Env(val codec: FakeCodec = FakeCodec(), val compressor: FakeCompressor = FakeCompressor()) {
        val encoder = PostImageEncoder(codec, compressor)
    }

    private val max = 1_000L

    private fun qualities(env: Env) = env.compressor.calls.map { it.second }

    @Test
    fun `TC-UPL-034 the decoder gets the power of two sample size and the output keeps the aspect ratio`() = runTest {
        mapOf(
            ImageSize(8000, 6000) to ImageSize(4000, 3000),
            ImageSize(4608, 3456) to ImageSize(2304, 1728),
            ImageSize(4096, 3072) to ImageSize(4096, 3072),
            ImageSize(4097, 3000) to ImageSize(2049, 1500),
        ).forEach { (source, expected) ->
            val env = Env()
            env.codec.defaultBounds = source
            val out = assertIs<EncodeOutcome.Encoded>(env.encoder.encode(photo(), PhotoEdit.IDENTITY, max))
            assertEquals(expected, out.size, "for $source")
            assertTrue(out.size.longEdge <= AppConstants.POST_IMAGE_MAX_LONG_EDGE)
        }
    }

    @Test
    fun `TC-UPL-035 only the header is read first, then one decode with the target sample size, never a full resolution decode`() = runTest {
        val env = Env()
        env.codec.defaultBounds = ImageSize(8000, 6000)
        env.encoder.encode(photo("big"), PhotoEdit.IDENTITY, max)
        assertEquals(listOf("bounds:big", "decode:big:2"), env.codec.log.take(2))
        assertEquals(listOf("big" to 2), env.codec.decodeCalls.toList())
        assertEquals(0, env.codec.fullDecodes)
    }

    @Test
    fun `TC-UPL-037 the ladder stops at the first quality that fits`() = runTest {
        // quality -> size; max = 1000
        val tables = listOf(
            mapOf(90 to 900, 80 to 700, 60 to 500, 40 to 300) to listOf(90),
            mapOf(90 to 1_100, 80 to 1_000, 60 to 500, 40 to 300) to listOf(90, 80),
            mapOf(90 to 2_000, 80 to 1_500, 60 to 999, 40 to 300) to listOf(90, 80, 60),
            mapOf(90 to 2_000, 80 to 1_500, 60 to 1_001, 40 to 1_000) to listOf(90, 80, 60, 40),
        )
        tables.forEach { (table, expected) ->
            val env = Env()
            env.compressor.sizeFor = { _, q -> table.getValue(q) }
            val out = assertIs<EncodeOutcome.Encoded>(env.encoder.encode(photo(), PhotoEdit.IDENTITY, max))
            assertEquals(expected, qualities(env), "for $table")
            assertEquals(expected.last(), out.quality)
            assertEquals(0, out.round)
            assertEquals(table.getValue(out.quality), out.bytes.size)
            assertContentEquals(bytesOf(table.getValue(out.quality), out.quality), out.bytes)
        }
        assertEquals(listOf(90, 80, 60, 40), AppConstants.WEBP_QUALITY_LADDER)
    }

    @Test
    fun `TC-UPL-038 when no quality fits the size shrinks by 0_85 per round, 4 rounds and 16 attempts, then SizeLimitExceeded`() = runTest {
        val env = Env()
        env.codec.defaultBounds = ImageSize(1600, 1200)
        env.compressor.sizeFor = { _, _ -> 50_000 }
        assertEquals(EncodeOutcome.SizeLimitExceeded, env.encoder.encode(photo(), PhotoEdit.IDENTITY, max))
        assertEquals(16, env.compressor.calls.size)
        val rounds = env.compressor.calls.chunked(4)
        assertEquals(
            listOf(ImageSize(1600, 1200), ImageSize(1360, 1020), ImageSize(1156, 867), ImageSize(983, 737)),
            rounds.map { it.first().first },
        )
        rounds.forEach { round ->
            assertEquals(listOf(90, 80, 60, 40), round.map { it.second })
            assertTrue(round.all { it.first == round.first().first }, "one size per round")
        }
        assertEquals(listOf(ImageSize(1360, 1020), ImageSize(1156, 867), ImageSize(983, 737)), env.codec.scaleTargets.toList())
        assertTrue(env.codec.unreleased.isEmpty(), "every decoded image is released: ${env.codec.unreleased}")
    }

    @Test
    fun `TC-UPL-038 a middle round that fits ends the search at once`() = runTest {
        val env = Env()
        env.codec.defaultBounds = ImageSize(1600, 1200)
        env.compressor.sizeFor = { size, q -> if (size == ImageSize(1156, 867) && q == 60) 900 else 50_000 }
        val out = assertIs<EncodeOutcome.Encoded>(env.encoder.encode(photo(), PhotoEdit.IDENTITY, max))
        assertEquals(2, out.round)
        assertEquals(60, out.quality)
        assertEquals(ImageSize(1156, 867), out.size)
        assertEquals(4 + 4 + 3, env.compressor.calls.size)
        assertEquals(2, env.codec.scaleTargets.size)
        assertTrue(env.codec.unreleased.isEmpty())
    }

    @Test
    fun `TC-UPL-039 exactly maxBytes is accepted and one byte more moves on to the next quality`() = runTest {
        val limit = AppConstants.POST_IMAGE_MAX_BYTES
        val exact = Env()
        exact.compressor.sizeFor = { _, _ -> limit.toInt() }
        val ok = assertIs<EncodeOutcome.Encoded>(exact.encoder.encode(photo(), PhotoEdit.IDENTITY, limit))
        assertEquals(90, ok.quality)
        assertEquals(limit.toInt(), ok.bytes.size)

        val over = Env()
        over.compressor.sizeFor = { _, q -> if (q == 90) limit.toInt() + 1 else limit.toInt() - 1 }
        val next = assertIs<EncodeOutcome.Encoded>(over.encoder.encode(photo(), PhotoEdit.IDENTITY, limit))
        assertEquals(80, next.quality)
        assertEquals(listOf(90, 80), qualities(over))
    }

    @Test
    fun `TC-UPL-042 an impossible limit is SizeLimitExceeded`() = runTest {
        val env = Env()
        env.compressor.sizeFor = { _, _ -> 5_000 }
        assertEquals(EncodeOutcome.SizeLimitExceeded, env.encoder.encode(photo(), PhotoEdit.IDENTITY, 1_000L))
    }

    @Test
    fun `TC-UPL-044 an unreadable or undecodable photo is Unreadable and nothing is compressed`() = runTest {
        val nullBounds = Env()
        nullBounds.codec.unreadable += "x"
        assertEquals(EncodeOutcome.Unreadable, nullBounds.encoder.encode(photo("x"), PhotoEdit.IDENTITY, max))
        assertTrue(nullBounds.compressor.calls.isEmpty())
        val throwing = Env()
        throwing.codec.throwing += "x"
        assertEquals(EncodeOutcome.Unreadable, throwing.encoder.encode(photo("x"), PhotoEdit.IDENTITY, max))
        assertTrue(throwing.compressor.calls.isEmpty())
    }

    @Test
    fun `TC-UPL-045 an unedited photo is not redrawn and encoding it twice gives the same bytes`() = runTest {
        val env = Env()
        val first = assertIs<EncodeOutcome.Encoded>(env.encoder.encode(photo(), PhotoEdit.IDENTITY, max))
        val second = assertIs<EncodeOutcome.Encoded>(env.encoder.encode(photo(), PhotoEdit.IDENTITY, max))
        assertTrue(env.codec.renderedEdits.isEmpty())
        assertContentEquals(first.bytes, second.bytes)
    }

    @Test
    fun `TC-EDIT-011 identity means no redraw, any change means exactly one redraw with that edit`() = runTest {
        val none = Env()
        none.encoder.encode(photo(), PhotoEdit.IDENTITY, max)
        assertTrue(none.codec.renderedEdits.isEmpty())
        val edit = PhotoEdit(quarterTurns = 1)
        val changed = Env()
        changed.encoder.encode(photo(), edit, max)
        assertEquals(listOf(edit), changed.codec.renderedEdits.toList())
        assertTrue(changed.codec.unreleased.isEmpty())
    }

    @Test
    fun `TC-EDIT-010 an edited photo is lossy compressed exactly once when the first quality fits`() = runTest {
        val env = Env()
        val edit = PhotoEdit(quarterTurns = 1)
        env.encoder.encode(photo(), edit, max)
        assertEquals(1, env.compressor.calls.size, "no intermediate lossy step")
        assertEquals(1, env.codec.renderedEdits.size)
        assertEquals(listOf("bounds:photo-1", "decode:photo-1:1", "render"), env.codec.log.toList())
    }

    @Test
    fun `TC-EDIT-020 the crop is applied to the image already reduced to 4096, so 25 percent of 8000x6000 is about 1000x750`() = runTest {
        val env = Env()
        env.codec.defaultBounds = ImageSize(8000, 6000)
        env.codec.renderSize = { size, edit -> PhotoEditTransform.outputSize(size, edit.quarterTurns, edit.crop) }
        val edit = PhotoEdit(crop = CropWindow(0.5, 0.5, 0.25, 0.25))
        val out = assertIs<EncodeOutcome.Encoded>(env.encoder.encode(photo(), edit, max))
        assertEquals(2, env.codec.decodeCalls.single().second, "decoded at sample 2 -> 4000x3000 before cropping")
        assertEquals(ImageSize(1000, 750), out.size)
    }

    @Test
    fun `TC-UPL-046 cancelling during the ladder stops further compression and releases the images`() = runTest {
        val env = Env()
        val gate = CompletableDeferred<Unit>()
        env.compressor.sizeFor = { _, _ -> 50_000 }
        env.compressor.onCall = { _, _ -> if (env.compressor.calls.size == 2) gate.await() }
        val job = async { env.encoder.encode(photo(), PhotoEdit.IDENTITY, max) }
        runCurrent()
        assertEquals(2, env.compressor.calls.size)
        job.cancel()
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(2, env.compressor.calls.size, "no call after cancellation")
        assertTrue(env.codec.unreleased.isEmpty())
    }
}
