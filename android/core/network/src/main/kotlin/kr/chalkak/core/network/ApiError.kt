package kr.chalkak.core.network

/** Server `errorCode`. Anything not listed (incl. RESOURCE_STATE_CHANGED) maps to [BUSINESS_ERROR] (D-02, REQ-NET-006). */
enum class ErrorCode {
    UNAUTHORIZED,
    REAUTHENTICATION_REQUIRED,
    FORBIDDEN,
    BUSINESS_ERROR,
    INTERNAL_ERROR,
    SIGNATURE_PROCESSING_PENDING,
    SIGNATURE_REUPLOAD_REQUIRED,
    SIGNATURE_REGISTRATION_REQUIRED,
    ;

    companion object {
        /** Unknown or null raw code -> BUSINESS_ERROR. */
        fun from(raw: String?): ErrorCode = entries.firstOrNull { it.name == raw } ?: BUSINESS_ERROR
    }
}

/** All timeouts, connection failures, DNS and TLS errors collapse to one user-facing kind (D-20). */
enum class NetworkKind { TIMEOUT, OFFLINE, OTHER }

sealed interface ApiError {
    /** [message] is display/log only; never branch on it (REQ-NET-007). */
    data class Http(val status: Int, val errorCode: ErrorCode, val message: String? = null, val retryAfterRaw: String? = null) : ApiError
    data class Network(val kind: NetworkKind) : ApiError
    /** 2xx whose body cannot be used: malformed, empty when required, wrong content type, missing field. */
    data class InvalidResponse(val reason: String) : ApiError
    /** Request never sent because configuration is invalid. */
    data class Config(val reason: ConfigError) : ApiError
    /** Not thrown for coroutine cancellation (that propagates); used for work abandoned without an error screen. */
    data object Cancelled : ApiError
}

sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>
    data class Failure(val error: ApiError) : ApiResult<Nothing>
}
