package kr.chalkak.feature.onboarding

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/**
 * Runs one repository call for a holder. A throwing collaborator (e.g. secure storage while saving the session) becomes
 * `Failure(InvalidResponse)` carrying only the exception type (never its message, which could echo secrets), so a holder never
 * crashes. Cancellation is rethrown, and a result that arrives after the caller was cancelled is dropped instead of being
 * handled (no late state change, error or navigation after the screen is gone).
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
