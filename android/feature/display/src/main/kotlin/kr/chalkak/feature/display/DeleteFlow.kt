package kr.chalkak.feature.display

import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.guardedApiCall
import kr.chalkak.core.network.httpStatus

/**
 * Delete confirmation + `DELETE /posts/{id}` of the detail screen (REQ-FEED-025..030). The holder decides whether
 * the user may delete (mine, confirmed); this class guarantees one request at a time and maps the answer.
 * Effects go out through [emit]; single-threaded like the holder.
 */
internal class DeleteFlow(
    private val repository: PostRepository,
    private val changes: PostChanges,
    private val postId: String,
    private val emit: (FeedEffect) -> Unit,
) {
    var confirmVisible = false
        private set

    var deleting = false
        private set

    fun ask(allowed: Boolean) {
        if (allowed && !deleting) confirmVisible = true
    }

    fun dismissConfirm() {
        confirmVisible = false
    }

    /** Accepts the confirmation: true when [run] must be started now (once, only while [allowed]). */
    fun confirm(allowed: Boolean): Boolean {
        if (!confirmVisible || deleting || !allowed) return false
        confirmVisible = false
        deleting = true
        return true
    }

    /** Back to idle (account change, or a bug interrupted [run]). */
    fun reset() {
        confirmVisible = false
        deleting = false
    }

    /** Sends the request after [confirm]; returns the toast copy key of a failure, null on success / login redirect. */
    suspend fun run(): String? {
        try {
            return when (val result = guardedApiCall("delete") { repository.delete(postId) }) {
                is ApiResult.Success -> {
                    changes.markRemoved(postId)
                    emit(FeedEffect.Deleted(postId, CopyKeys.FEED_DELETE_SUCCESS))
                    null
                }
                is ApiResult.Failure -> failure(result)
            }
        } finally {
            deleting = false
        }
    }

    private fun failure(result: ApiResult.Failure): String? {
        val error = result.error
        if (FeedFailures.isReauthenticationRequired(error)) {
            emit(FeedEffect.LoginRequired)
            return null
        }
        if (error.httpStatus == 404) changes.markRemoved(postId)
        return FeedFailures.delete(error)
    }
}
