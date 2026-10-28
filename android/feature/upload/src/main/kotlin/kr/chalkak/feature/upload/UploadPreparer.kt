package kr.chalkak.feature.upload

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.common.UploadUrlLease
import kr.chalkak.core.data.upload.PostCreationRepository
import kr.chalkak.core.data.upload.UploadPolicy
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.EncodeOutcome
import kr.chalkak.feature.upload.image.PickedPhoto
import kr.chalkak.feature.upload.image.PostImageEncoder

/** The encoded file plus the policy it was prepared for. [policy] / [lease] are null once a rejected PUT dropped them (REQ-UPL-059). */
internal class PreparedUpload(val file: TempImage, val size: Int, val policy: UploadPolicy?, val lease: UploadUrlLease?) {
    fun withoutPolicy() = PreparedUpload(file, size, null, null)

    fun leaseUsable(clock: MonotonicClock): Boolean = policy != null && lease?.isUsable(clock) == true
}

internal sealed interface Acquisition {
    data class Ready(val upload: PreparedUpload) : Acquisition

    /** [copyKey] null = the session needs re-login (the effect was already sent). */
    data class Failed(val copyKey: String?) : Acquisition
}

/**
 * Policy issuing + WebP encoding (REQ-UPL-025..036). Owns the temp file of the prepared upload: whoever replaces or drops
 * [prepared] goes through here, so every saved file is deleted exactly once (REQ-UPL-048).
 */
internal class UploadPreparer(
    private val creation: PostCreationRepository,
    private val encoder: PostImageEncoder,
    private val files: TempImageStore,
    private val monotonic: MonotonicClock,
    private val store: UploadStore,
    private val jobs: UploadJobs,
) {
    var prepared: PreparedUpload? = null
    private var job: Job? = null

    val running: Boolean get() = job?.isActive == true

    /** Throws away everything prepared so far and prepares [photo] with [edit] in the background. */
    fun start(photo: PickedPhoto, edit: PhotoEdit) {
        reset()
        store.update { it.copy(preparation = Preparation.Preparing) }
        job = jobs.launch { publish(acquire(photo, edit, existing = null)) }
    }

    suspend fun awaitRunning() {
        job?.join()
    }

    /** Cancels the running preparation and deletes the prepared file. */
    fun reset() {
        job?.cancel()
        job = null
        prepared?.let { files.delete(it.file) }
        prepared = null
    }

    /** Applies the end of a preparation to the screen state. */
    fun publish(result: Acquisition) {
        when (result) {
            is Acquisition.Ready -> {
                prepared = result.upload
                store.update { it.copy(preparation = Preparation.Ready) }
            }
            is Acquisition.Failed -> {
                if (result.copyKey == null) {
                    store.update { it.copy(preparation = Preparation.None) }
                } else {
                    store.update { it.copy(preparation = Preparation.Failed(result.copyKey)) }
                    store.showError(result.copyKey)
                }
            }
        }
    }

    /**
     * Issues a policy and makes sure a file within its `maxBytes` exists: [existing] is reused when it fits, otherwise the
     * original is encoded again with [edit] (REQ-UPL-042). The lease starts when the policy arrives (REQ-UPL-041).
     */
    suspend fun acquire(photo: PickedPhoto, edit: PhotoEdit, existing: PreparedUpload?): Acquisition {
        val policy = when (val answer = guardedApiCall("requestUpload") { creation.requestUpload() }) {
            is ApiResult.Failure -> return failureOf(answer.error)
            is ApiResult.Success -> answer.value
        }
        val lease = UploadUrlLease(monotonic.nanoTime(), policy.expiresInSeconds)
        if (policy.contentType != AppConstants.POST_IMAGE_CONTENT_TYPE) return Acquisition.Failed(UploadCopyKeys.ERROR_PREPARE)
        if (existing != null && existing.size <= policy.maxBytes) {
            return Acquisition.Ready(PreparedUpload(existing.file, existing.size, policy, lease))
        }
        val encoded = encoder.encode(photo, edit, policy.maxBytes) as? EncodeOutcome.Encoded
            ?: return Acquisition.Failed(UploadCopyKeys.ERROR_PREPARE)
        val file = saveOwned(encoded.bytes)
        existing?.let { files.delete(it.file) }
        return Acquisition.Ready(PreparedUpload(file, encoded.bytes.size, policy, lease))
    }

    /** Saves [bytes]; a preparation cancelled meanwhile deletes the file again instead of leaking it. */
    private suspend fun saveOwned(bytes: ByteArray): TempImage {
        val file = files.save(bytes)
        try {
            currentCoroutineContext().ensureActive()
        } catch (e: CancellationException) {
            files.delete(file)
            throw e
        }
        return file
    }

    // D-02: only status / errorCode decide, never the server message.
    private fun failureOf(error: ApiError): Acquisition.Failed = when {
        error is ApiError.Network -> Acquisition.Failed(UploadCopyKeys.ERROR_NETWORK)
        error is ApiError.Http && error.status == HTTP_FORBIDDEN -> Acquisition.Failed(UploadCopyKeys.GATE_BANNED)
        error is ApiError.Http && error.status == HTTP_UNAUTHORIZED -> {
            store.emit(UploadEffect.ReauthRequired)
            Acquisition.Failed(null)
        }
        else -> Acquisition.Failed(UploadCopyKeys.ERROR_PREPARE)
    }

    private companion object {
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_FORBIDDEN = 403
    }
}
