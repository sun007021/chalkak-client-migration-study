package kr.chalkak.feature.record

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kr.chalkak.core.common.analytics.AnalyticsTracker

/**
 * Launches the holder's jobs. A job that throws (a bug, not an `ApiError`) is reported to [onUnexpected] so the holder can
 * show an error state; it never reaches [scope]'s exception handler. Same contract as the display holders' tracker
 * (internal there; a later PR consolidates them).
 */
internal class RecordJobs(private val scope: CoroutineScope, private val onUnexpected: (Exception) -> Unit) {
    fun launch(block: suspend () -> Unit): Job = scope.launch {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            onUnexpected(e)
        }
    }
}

/** `screen_view` must never affect the screen (TC-ANL-021). */
internal fun AnalyticsTracker.screenViewSafely(name: String) {
    try {
        screenView(name)
    } catch (e: Exception) {
        // Deliberately ignored, see above.
    }
}
