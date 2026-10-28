package kr.chalkak.feature.aireview

import kotlinx.coroutines.delay
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.AiReviewRepository
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.guardedApiCall

internal enum class PollEnd { Stopped, WindowEnded }

/**
 * The 3 s / 300 s GET loop of D-03. The interval is a `delay` after the PREVIOUS answer (never two GETs at once); the
 * window is measured on [windowClock] from [windowStartNanos] (the POST send or the polling start, REQ-AIR-026) and a
 * wait is shortened so that the window ends exactly at 300.000 s without sending another GET.
 */
internal class AiPoller(
    private val repository: AiReviewRepository,
    private val windowClock: MonotonicClock,
) {
    /** [onResult] returns false to stop (answer decided the loop is over). */
    suspend fun poll(postId: String, windowStartNanos: Long, onResult: (ApiResult<AiReview>) -> Boolean): PollEnd {
        while (true) {
            val remaining = AppConstants.AI_REVIEW_POLL_WINDOW_MS - elapsedMs(windowStartNanos)
            if (remaining <= 0) return PollEnd.WindowEnded
            delay(minOf(AppConstants.AI_REVIEW_POLL_INTERVAL_MS, remaining))
            if (elapsedMs(windowStartNanos) >= AppConstants.AI_REVIEW_POLL_WINDOW_MS) return PollEnd.WindowEnded
            val result = guardedApiCall("ai-review poll") { repository.get(postId) }
            if (!onResult(result)) return PollEnd.Stopped
        }
    }

    private fun elapsedMs(startNanos: Long): Long = (windowClock.nanoTime() - startNanos) / NANOS_PER_MS

    private companion object {
        const val NANOS_PER_MS = 1_000_000L
    }
}
