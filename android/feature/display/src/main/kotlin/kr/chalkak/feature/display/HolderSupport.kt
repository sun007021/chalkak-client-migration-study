package kr.chalkak.feature.display

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kr.chalkak.core.common.analytics.AnalyticsTracker

/**
 * Jobs of one state holder. A job that throws (a bug, not an [kr.chalkak.core.network.ApiError]) is reported to
 * [onUnexpected] so the holder can show an error state; it never reaches [scope]'s exception handler.
 * Like the holders themselves it is meant for one thread (the UI thread / a test dispatcher).
 */
internal class JobTracker(
    private val scope: CoroutineScope,
    private val onUnexpected: (Exception) -> Unit,
) {
    private val jobs = HashSet<Job>()

    fun launch(block: suspend () -> Unit): Job {
        val job = scope.launch {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onUnexpected(e)
            }
        }
        jobs += job
        job.invokeOnCompletion { jobs -= job }
        return job
    }

    fun cancelAll() {
        jobs.toList().forEach { it.cancel() }
        jobs.clear()
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
