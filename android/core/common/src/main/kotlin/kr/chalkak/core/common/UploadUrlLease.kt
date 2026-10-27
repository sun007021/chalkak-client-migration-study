package kr.chalkak.core.common

/**
 * Presigned upload URL validity measured on a [MonotonicClock] (immune to system time changes).
 * Usable only while more than [safetyMarginMs] remain (TC-TIME-027).
 */
class UploadUrlLease(
    private val issuedAtNanos: Long,
    private val expiresInSeconds: Long,
    private val safetyMarginMs: Long = AppConstants.UPLOAD_URL_SAFETY_MARGIN_MS,
) {
    fun isUsable(clock: MonotonicClock): Boolean {
        val elapsedMs = (clock.nanoTime() - issuedAtNanos) / NANOS_PER_MILLI
        val usableForMs = expiresInSeconds * MILLIS_PER_SECOND - safetyMarginMs
        return elapsedMs < usableForMs
    }

    private companion object {
        const val NANOS_PER_MILLI = 1_000_000L
        const val MILLIS_PER_SECOND = 1_000L
    }
}
