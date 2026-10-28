package kr.chalkak.feature.upload

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/**
 * Runs one repository call for a holder. A throwing collaborator becomes `Failure(InvalidResponse)` carrying only the
 * exception type (never its message). Cancellation is rethrown, and a result that arrives after the caller was cancelled is dropped.
 * Same contract as the record / display helpers (internal there; a later PR consolidates them).
 */
internal suspend fun <T> guardedApiCall(what: String, call: suspend () -> ApiResult<T>): ApiResult<T> {
    val result = try {
        call()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        ApiResult.Failure(ApiError.InvalidResponse("$what failed: ${e::class.simpleName}"))
    }
    currentCoroutineContext().ensureActive()
    return result
}

/**
 * Launches the holder's jobs. A job that throws (a bug, not an `ApiError`) is reported to [onUnexpected] so the holder can
 * show an error state; it never reaches [scope]'s exception handler.
 */
internal class UploadJobs(private val scope: CoroutineScope, private val onUnexpected: (Exception) -> Unit) {
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
