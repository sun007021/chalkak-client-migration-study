package kr.chalkak.feature.notification

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode

/**
 * Runs one repository call for a holder. A throwing collaborator becomes `Failure(InvalidResponse)` carrying only the exception type
 * (never its message, which could echo secrets), so a holder never crashes. Cancellation is rethrown, and a result that arrives after
 * the caller was cancelled is dropped (no late state change or navigation). Copy of the onboarding/settings helper; a later PR
 * consolidates them.
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

internal fun ApiError.isConnectionFailure(): Boolean = this is ApiError.Network

/** 401 that survived the refresh, or REAUTHENTICATION_REQUIRED: the login screen opens, no message. */
internal fun ApiError.requiresLogin(): Boolean =
    this is ApiError.Http && status == 401 && (errorCode == ErrorCode.UNAUTHORIZED || errorCode == ErrorCode.REAUTHENTICATION_REQUIRED)

internal fun ApiError.isNotFound(): Boolean = this is ApiError.Http && status == 404
