package kr.chalkak.feature.display

import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ErrorCode

/** Copy key per failed detail call (D-02: only errorCode + HTTP status + the called API decide, never the message). */
internal object FeedFailures {
    /** 401 `REAUTHENTICATION_REQUIRED` only: the session is gone, go to login (D-17). A plain 401 already got its refresh. */
    fun isReauthenticationRequired(error: ApiError): Boolean =
        error is ApiError.Http && error.status == 401 && error.errorCode == ErrorCode.REAUTHENTICATION_REQUIRED

    fun load(error: ApiError): String = when (error) {
        is ApiError.Network -> CopyKeys.NETWORK
        is ApiError.InvalidResponse -> CopyKeys.FEED_INVALID
        else -> CopyKeys.FEED_LOAD_ERROR
    }

    fun saveTitle(error: ApiError): String = when {
        error.httpStatus == 400 -> CopyKeys.FEED_EDIT_STATE
        error.httpStatus == 403 -> CopyKeys.FEED_EDIT_BANNED
        error.httpStatus == 401 -> CopyKeys.FEED_EDIT_LOGIN
        error is ApiError.Network -> CopyKeys.NETWORK
        else -> CopyKeys.FEED_EDIT_OTHER
    }

    fun delete(error: ApiError): String = when {
        error.httpStatus == 400 -> CopyKeys.FEED_DELETE_STATE
        error.httpStatus == 403 -> CopyKeys.FEED_DELETE_FORBIDDEN
        error.httpStatus == 404 -> CopyKeys.FEED_NOT_FOUND
        error.httpStatus == 401 -> CopyKeys.FEED_EDIT_LOGIN
        error is ApiError.Network -> CopyKeys.NETWORK
        else -> CopyKeys.FEED_DELETE_OTHER
    }
}
