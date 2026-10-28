package kr.chalkak.feature.upload

import java.time.LocalDate
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.common.PostTitle
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.analytics.screenViewSafely
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.upload.PostCreated
import kr.chalkak.core.data.upload.PostCreationRepository
import kr.chalkak.core.data.upload.PostCreations
import kr.chalkak.core.data.upload.PostImageUploader
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.guardedApiCall
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.PickedPhoto

/** The "전시하기" flow (REQ-UPL-037..059): wait for the preparation, check the lease, PUT, POST, recover. */
internal class UploadSubmitter(
    private val topicDate: LocalDate,
    private val home: HomeRepository,
    private val creation: PostCreationRepository,
    private val uploader: PostImageUploader,
    private val files: TempImageStore,
    private val preparer: UploadPreparer,
    private val topic: UploadTopic,
    private val creations: PostCreations,
    private val analytics: AnalyticsTracker,
    private val monotonic: MonotonicClock,
    private val store: UploadStore,
) {
    /** Runs one submission to its end; [store]'s `submitting` is reset by the caller. */
    suspend fun submit() {
        val photo = store.current.photo ?: return
        val edit = store.current.edit
        val loaded = topic.ensureLoaded() ?: return
        val upload = ready(photo, edit) ?: return
        val policy = checkNotNull(upload.policy) { "a ready upload always has a policy" }
        val bytes = files.read(upload.file)
        if (bytes.size > policy.maxBytes) return store.showError(UploadCopyKeys.ERROR_PREPARE) // REQ-UPL-044
        val put = guardedApiCall("put") { uploader.put(policy.uploadUrl, policy.contentType, bytes) }
        if (put is ApiResult.Failure) return putFailed(upload, put.error)
        val title = PostTitle.toRequestValue(store.current.title)
        when (val answer = guardedApiCall("create") { creation.create(loaded.topicId, policy.uploadId, title) }) {
            is ApiResult.Success -> succeeded(answer.value.postId, answer.value.status)
            is ApiResult.Failure -> createFailed(answer.error)
        }
    }

    /** The upload to send: waits for a running preparation, prepares when none exists, refreshes an expired or dropped policy. */
    private suspend fun ready(photo: PickedPhoto, edit: PhotoEdit): PreparedUpload? {
        val wasRunning = preparer.running
        if (wasRunning) preparer.awaitRunning()
        val existing = preparer.prepared
        return when {
            existing == null && wasRunning -> null // that preparation failed and already reported why
            existing == null -> adopt(photo, edit, null, markPreparing = true)
            existing.leaseUsable(monotonic) -> existing
            else -> adopt(photo, edit, existing, markPreparing = false)
        }
    }

    private suspend fun adopt(
        photo: PickedPhoto,
        edit: PhotoEdit,
        existing: PreparedUpload?,
        markPreparing: Boolean,
    ): PreparedUpload? {
        if (markPreparing) store.update { it.copy(preparation = Preparation.Preparing) }
        val result = preparer.acquire(photo, edit, existing)
        // A refresh of a prepared file only reports its error; a fresh preparation also moves the preparation state.
        if (markPreparing || result is Acquisition.Ready) preparer.publish(result) else (result as Acquisition.Failed).copyKey?.let(store::showError)
        return (result as? Acquisition.Ready)?.upload
    }

    private fun putFailed(upload: PreparedUpload, error: ApiError) {
        if (error is ApiError.Network) {
            store.showError(UploadCopyKeys.ERROR_NETWORK) // same policy is used again
        } else {
            preparer.prepared = upload.withoutPolicy() // REQ-UPL-059: the next submit issues a new policy
            store.showError(UploadCopyKeys.ERROR_UPLOAD)
        }
    }

    private suspend fun createFailed(error: ApiError) {
        val status = (error as? ApiError.Http)?.status
        when {
            status == HTTP_FORBIDDEN -> store.showError(UploadCopyKeys.GATE_BANNED)
            status == HTTP_UNAUTHORIZED -> store.emit(UploadEffect.ReauthRequired)
            error is ApiError.Network || error is ApiError.InvalidResponse -> recoverLostResponse()
            status == HTTP_BAD_REQUEST -> judgeBusinessError((error as ApiError.Http).message)
            else -> {
                if (status == HTTP_NOT_FOUND) discardPreparation()
                store.showError(UploadCopyKeys.ERROR_CREATE)
            }
        }
    }

    /** REQ-UPL-049/050: never re-POST; `today` tells whether the post exists. */
    private suspend fun recoverLostResponse() {
        val answer = guardedApiCall("today") { home.today() }
        if (answer.isUnauthorized()) return store.emit(UploadEffect.ReauthRequired) // D-17: the session is over, not "offline"
        val posted = (answer as? ApiResult.Success)?.value?.takeIf { it.isPosted }
        val postId = posted?.postId
        val status = posted?.status
        if (postId != null && status != null) succeeded(postId, status) else store.showError(UploadCopyKeys.ERROR_NETWORK)
    }

    /** REQ-UPL-051..054: a 400 is judged through `today`, never by its message (D-02). */
    private suspend fun judgeBusinessError(serverMessage: String?) {
        val today = guardedApiCall("today") { home.today() }
        when {
            today.isUnauthorized() -> store.emit(UploadEffect.ReauthRequired)
            today is ApiResult.Success && today.value.isPosted -> store.showError(UploadCopyKeys.ERROR_DUPLICATE)
            today is ApiResult.Success && today.value.topicDate != topicDate -> store.showError(UploadCopyKeys.ERROR_TOPIC_CHANGED)
            today is ApiResult.Failure && (today.error as? ApiError.Http)?.status == HTTP_NOT_FOUND ->
                store.showError(UploadCopyKeys.ERROR_TOPIC_CHANGED)
            else -> {
                discardPreparation()
                if (serverMessage.isNullOrBlank()) store.showError(UploadCopyKeys.ERROR_CREATE) else store.showError(serverMessage = serverMessage)
            }
        }
    }

    private fun ApiResult<*>.isUnauthorized(): Boolean =
        this is ApiResult.Failure && (error as? ApiError.Http)?.status == HTTP_UNAUTHORIZED

    private fun discardPreparation() {
        preparer.reset()
        store.update { it.copy(preparation = Preparation.None) }
    }

    private fun succeeded(postId: String, status: ModerationStatus) {
        preparer.reset()
        val title = (store.current.topic as? TopicState.Loaded)?.title.orEmpty()
        store.update { it.copy(completed = true, preparation = Preparation.None) }
        creations.announce(PostCreated(topicDate, postId, status))
        analytics.screenViewSafely(SUCCESS_SCREEN)
        store.emit(UploadEffect.ShowSuccess(SuccessInfo(postId, topicDate, title, status)))
    }

    private companion object {
        const val SUCCESS_SCREEN = "photo_upload_success"
        const val HTTP_BAD_REQUEST = 400
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_FORBIDDEN = 403
        const val HTTP_NOT_FOUND = 404
    }
}
