package kr.chalkak.feature.upload.image

/** One RIFF chunk: four-character code (e.g. `VP8 `, `VP8L`, `VP8X`, `EXIF`) and payload size. */
data class WebpChunk(val fourCc: String, val size: Long)

/**
 * Structure of a WebP file. [chunks] are the top-level chunks in file order. [riffSizeMatches] = the RIFF size field equals
 * file length - 8. [isStillImage] = first image chunk is `VP8 ` / `VP8L` (or `VP8X` followed by one of them) and there is
 * no `ANIM` / `ANMF`. [hasMetadata] = any `EXIF`, `XMP ` or `ICCP` chunk.
 */
data class WebpInfo(
    val chunks: List<WebpChunk>,
    val riffSizeMatches: Boolean,
    val firstImageChunk: String?,
    val isStillImage: Boolean,
    val hasMetadata: Boolean,
)

/**
 * Checks what the server checks (POST-004 U3) so an adapter test or a pre-flight guard can verify an encoder output
 * (TC-UPL-032, TC-UPL-033). Real-encoder runs happen in the Android module; this is the shared, JVM-tested parser.
 */
object WebpInspector {
    /** Null when [bytes] is not `RIFF....WEBP`. Truncated chunks stop the walk (riffSizeMatches is then false). */
    fun inspect(bytes: ByteArray): WebpInfo? {
        if (bytes.size < HEADER_SIZE || !bytes.hasCode(0, "RIFF") || !bytes.hasCode(WEBP_OFFSET, "WEBP")) return null
        val chunks = readChunks(bytes)
        val names = chunks.map { it.fourCc }
        val firstImage = names.firstOrNull { it in IMAGE_CHUNKS }
        return WebpInfo(
            chunks = chunks,
            riffSizeMatches = readLe32(bytes, RIFF_SIZE_OFFSET) == bytes.size - RIFF_PREFIX.toLong(),
            firstImageChunk = firstImage,
            isStillImage = firstImage != null && names.none { it in ANIMATION_CHUNKS },
            hasMetadata = names.any { it in METADATA_CHUNKS },
        )
    }

    private fun readChunks(bytes: ByteArray): List<WebpChunk> {
        val chunks = mutableListOf<WebpChunk>()
        var pos = HEADER_SIZE.toLong()
        while (pos + CHUNK_HEADER <= bytes.size) {
            val at = pos.toInt()
            val size = readLe32(bytes, at + CODE_LENGTH)
            if (pos + CHUNK_HEADER + size > bytes.size) break
            chunks += WebpChunk(String(bytes, at, CODE_LENGTH, Charsets.US_ASCII), size)
            pos += CHUNK_HEADER + size + (size and 1L)
        }
        return chunks
    }

    private fun ByteArray.hasCode(offset: Int, code: String): Boolean =
        code.indices.all { this[offset + it] == code[it].code.toByte() }

    private fun readLe32(bytes: ByteArray, offset: Int): Long =
        (0 until CODE_LENGTH).fold(0L) { acc, i -> acc or ((bytes[offset + i].toLong() and BYTE_MASK) shl (BITS_PER_BYTE * i)) }

    private val IMAGE_CHUNKS = setOf("VP8 ", "VP8L")
    private val ANIMATION_CHUNKS = setOf("ANIM", "ANMF")
    private val METADATA_CHUNKS = setOf("EXIF", "XMP ", "ICCP")
    private const val CODE_LENGTH = 4
    private const val RIFF_SIZE_OFFSET = 4
    private const val RIFF_PREFIX = 8
    private const val WEBP_OFFSET = 8
    private const val HEADER_SIZE = 12
    private const val CHUNK_HEADER = 8
    private const val BYTE_MASK = 0xFFL
    private const val BITS_PER_BYTE = 8
}
