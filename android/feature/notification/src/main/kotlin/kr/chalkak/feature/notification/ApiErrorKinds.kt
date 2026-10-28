package kr.chalkak.feature.notification

import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ErrorCode

internal fun ApiError.isConnectionFailure(): Boolean = this is ApiError.Network

/** 401 that survived the refresh, or REAUTHENTICATION_REQUIRED: the login screen opens, no message. */
internal fun ApiError.requiresLogin(): Boolean =
    this is ApiError.Http && status == 401 && (errorCode == ErrorCode.UNAUTHORIZED || errorCode == ErrorCode.REAUTHENTICATION_REQUIRED)

internal fun ApiError.isNotFound(): Boolean = this is ApiError.Http && status == 404
