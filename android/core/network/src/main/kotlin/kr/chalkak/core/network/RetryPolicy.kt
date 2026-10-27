package kr.chalkak.core.network

import kr.chalkak.core.common.AppConstants
import java.time.Duration
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

enum class HttpMethod { GET, POST, PUT, PATCH, DELETE }

sealed interface RetryDecision {
    /** Wait [delayMs] (virtual-time friendly) then resend. */
    data class RetryAfter(val delayMs: Long) : RetryDecision
    data object GiveUp : RetryDecision
}

/** What the last attempt produced. [status] null = transport failure. */
data class AttemptResult(val status: Int?, val retryAfterRaw: String? = null)

/** D-21. Pure and clock-free except for the HTTP-date form of Retry-After. */
class RetryPolicy(
    private val maxRetries: Int = AppConstants.RETRY_MAX,
    private val backoffMs: List<Long> = AppConstants.RETRY_BACKOFF_MS,
    private val retryAfterMaxMs: Long = AppConstants.RETRY_AFTER_MAX_MS,
) {
    /** GET/PUT/PATCH/DELETE and POST /posts/uploads, POST /users/me/signature/uploads are retryable; every other POST is not. */
    fun isRetryable(method: HttpMethod, path: String): Boolean =
        method != HttpMethod.POST || path in RETRYABLE_POST_PATHS

    /**
     * [retriesDone] = retries already performed (0 for the first failure). Retries only transport failures,
     * 5xx, and 429 (idempotent only); 4xx other than 429 -> GiveUp. After [maxRetries] -> GiveUp.
     * 429/503 with a valid Retry-After: wait that long, GiveUp if above the cap. Invalid Retry-After
     * (negative, non-numeric, past date) -> default backoff.
     */
    fun decide(method: HttpMethod, path: String, attempt: AttemptResult, retriesDone: Int, now: Instant): RetryDecision {
        val status = attempt.status
        val transient = status == null || status >= 500 || status == 429
        if (!transient || !isRetryable(method, path) || retriesDone >= maxRetries) return RetryDecision.GiveUp
        val serverWait = if (status == 429 || status == 503) parseRetryAfterMs(attempt.retryAfterRaw, now) else null
        if (serverWait != null) {
            return if (serverWait > retryAfterMaxMs) RetryDecision.GiveUp else RetryDecision.RetryAfter(serverWait)
        }
        return RetryDecision.RetryAfter(backoffMs.getOrElse(retriesDone) { backoffMs.last() })
    }

    /** Seconds ("2") or HTTP-date -> millis from [now]; null when invalid/negative/past. Not capped here. */
    fun parseRetryAfterMs(raw: String?, now: Instant): Long? {
        val text = raw?.trim().orEmpty()
        if (text.isEmpty()) return null
        if (text.all { it in '0'..'9' }) {
            val seconds = text.toLongOrNull() ?: return Long.MAX_VALUE
            return if (seconds > Long.MAX_VALUE / 1000) Long.MAX_VALUE else seconds * 1000
        }
        val date = try {
            Instant.from(DateTimeFormatter.RFC_1123_DATE_TIME.parse(text))
        } catch (e: DateTimeParseException) {
            return null
        }
        val ms = Duration.between(now, date).toMillis()
        return ms.takeIf { it > 0 }
    }

    private companion object {
        val RETRYABLE_POST_PATHS = setOf("/posts/uploads", "/users/me/signature/uploads")
    }
}
