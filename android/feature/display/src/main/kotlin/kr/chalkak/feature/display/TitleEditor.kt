package kr.chalkak.feature.display

import kr.chalkak.core.common.PostTitle
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/** What the holder must do after a save, besides showing [TitleEditor.dialog]. */
internal enum class TitleSaveOutcome { SAVED, SHOWN_IN_DIALOG, POST_GONE, LOGIN_REQUIRED }

/**
 * The title edit dialog of the detail screen (REQ-FEED-018..024) and its `PUT /posts/{id}`. The holder decides whether
 * editing is allowed; a saved title goes to [PostChanges] so lists and detail follow (REQ-FEED-022).
 */
internal class TitleEditor(
    private val repository: PostRepository,
    private val changes: PostChanges,
    private val postId: String,
) {
    var dialog: EditDialogState? = null
        private set

    val isSaving: Boolean get() = dialog?.saving == true

    fun open(currentTitle: String?) {
        dialog = EditDialogState(input = currentTitle.orEmpty(), saving = false, errorCopyKey = null, serverMessage = null)
    }

    /** Keystroke / paste: the stored input is `PostTitle.limitInput(text)` (D-01, code points). */
    fun input(text: String) {
        val current = dialog?.takeIf { !it.saving } ?: return
        dialog = current.copy(input = PostTitle.limitInput(text), errorCopyKey = null, serverMessage = null)
    }

    /** Closes the dialog unless a save is running. */
    fun cancel() {
        if (!isSaving) dialog = null
    }

    fun close() {
        dialog = null
    }

    /** Marks the dialog as saving and returns the request value (`null` = clear the title),; null when there is nothing to save. */
    fun beginSave(): SaveRequest? {
        val current = dialog?.takeIf { !it.saving } ?: return null
        dialog = current.copy(saving = true, errorCopyKey = null, serverMessage = null)
        return SaveRequest(PostTitle.toRequestValue(current.input))
    }

    /** A bug interrupted the save: back to an editable dialog with the generic error. */
    fun interrupted() {
        dialog = dialog?.copy(saving = false, errorCopyKey = CopyKeys.FEED_EDIT_OTHER)
    }

    /** Sends [SaveRequest.title] (after [beginSave]) and settles the dialog with the answer. */
    suspend fun save(request: SaveRequest): TitleSaveOutcome =
        when (val result = guardedApiCall("updateTitle") { repository.updateTitle(postId, request.title) }) {
            is ApiResult.Success -> {
                changes.titleChanged(postId, result.value.title)
                dialog = null
                TitleSaveOutcome.SAVED
            }
            is ApiResult.Failure -> failed(result.error)
        }

    private fun failed(error: ApiError): TitleSaveOutcome {
        val current = dialog ?: return TitleSaveOutcome.SHOWN_IN_DIALOG
        if (error.httpStatus == 404) {
            dialog = null
            return TitleSaveOutcome.POST_GONE
        }
        if (FeedFailures.isReauthenticationRequired(error)) {
            dialog = current.copy(saving = false)
            return TitleSaveOutcome.LOGIN_REQUIRED
        }
        // The server text is display-only; the copy key alone decides the message (D-02).
        val serverMessage = (error as? ApiError.Http)?.message.takeIf { error.httpStatus == 400 }
        dialog = current.copy(saving = false, errorCopyKey = FeedFailures.saveTitle(error), serverMessage = serverMessage)
        return TitleSaveOutcome.SHOWN_IN_DIALOG
    }

    /** [title] is what `PUT /posts/{id}` sends; `null` clears the title. */
    class SaveRequest(val title: String?)
}
