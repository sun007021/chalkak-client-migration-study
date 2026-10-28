package kr.chalkak.feature.record

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/**
 * Runs one repository call for a holder. A throwing collaborator becomes `Failure(InvalidResponse)` carrying only the
 * exception type (never its message). Cancellation is rethrown, and a result that arrives after the caller was cancelled is dropped.
 * Same contract as the settings / onboarding helpers (internal there); a later PR consolidates them.
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
