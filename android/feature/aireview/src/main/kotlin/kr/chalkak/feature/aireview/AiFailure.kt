package kr.chalkak.feature.aireview

import kr.chalkak.core.network.ApiError

/** How the holder reacts to a failed call (failure table of the spec; D-02: branch on status / kind, never on text). */
internal sealed interface AiFailure {
    /** 404: hide pill / card (GET: silently, POST: with `ai.error.not-found`). */
    data object NotFound : AiFailure

    /** 401 that ApiClient could not repair: hand over to login (D-17). */
    data object LoginRequired : AiFailure

    /** POST 403 (D-08). */
    data object Banned : AiFailure

    /** POST 400: the server's own `message`, shown as is. */
    data class ServerMessage(val message: String) : AiFailure

    /** POST 409 (defensive): re-read with GET, no message. */
    data object Conflict : AiFailure

    /** Network / 5xx / contract violation / anything else. */
    data class Generic(val copyKey: String) : AiFailure

    companion object {
        /** [isPost] enables the POST-only branches (400 message, 403, 409); a GET with those statuses is just "could not load". */
        fun of(error: ApiError, isPost: Boolean): AiFailure = when {
            error is ApiError.Network -> Generic("ai.error.network")
            error !is ApiError.Http -> Generic("ai.error.load")
            error.status == 404 -> NotFound
            error.status == 401 -> LoginRequired
            isPost && error.status == 403 -> Banned
            isPost && error.status == 409 -> Conflict
            isPost && error.status == 400 -> error.message?.let { ServerMessage(it) } ?: Generic("ai.error.load")
            else -> Generic("ai.error.load")
        }
    }
}
