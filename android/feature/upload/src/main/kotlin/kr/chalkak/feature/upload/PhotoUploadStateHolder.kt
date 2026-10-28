package kr.chalkak.feature.upload

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.common.PostTitle
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.data.upload.PostCreationRepository
import kr.chalkak.core.data.upload.PostCreations
import kr.chalkak.core.data.upload.PostImageUploader
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.ImageSize
import kr.chalkak.feature.upload.image.PhotoCodec
import kr.chalkak.feature.upload.image.PhotoSource
import kr.chalkak.feature.upload.image.PickedPhoto
import kr.chalkak.feature.upload.image.PostImageEncoder
import java.time.LocalDate

/**
 * Upload screen state (UPL). [topicDate] is pinned by the gate and never recomputed from a clock (REQ-UPL-008). Contract:
 *
 *  - [onScreenShown]: `screen_view photo_upload` once; loads `home.topic(topicDate)` once (a topicDate that differs from the request, or
 *    404 / 5xx / InvalidResponse -> `Failed(upload.topic.load-failed)`, network -> `Failed(upload.error.network)`, 401 -> ReauthRequired).
 *  - Picking: a [PickerResult.Cancelled] changes nothing. A picked photo is probed with `codec.readBounds` (null / throw -> error
 *    `upload.error.prepare`, no editor). Only the latest pick counts; an older pick's late probe is dropped. CAMERA captures are saved
 *    to the gallery exactly once, right after capture; failure -> error `upload.camera.save-failed`, or `toaster.show` when the screen is gone;
 *    the selection and the upload continue either way. ALBUM picks are never saved.
 *  - Editor: a probed pick opens `editor = EditorRequest(photo, IDENTITY, isFirstEdit = true)`. [onEditorDone] with a first edit confirms the
 *    photo and starts preparation immediately; with a re-edit it restarts preparation only when the edit differs from the current one.
 *    [onEditorCancelled]: first edit -> the pick is dropped (no preparation); re-edit -> everything stays. [onPhotoTapped] re-opens the editor with the current edit.
 *  - Preparation (REQ-UPL-025..036): `creation.requestUpload()` -> policy `contentType` must be `image/webp` (else `Failed(upload.error.prepare)`, no encode) ->
 *    `encoder.encode(photo, edit, policy.maxBytes)` -> `files.save`. The lease starts when the policy arrives. A newer preparation / photo / screen exit cancels the
 *    running one, deletes its files, and its late result never changes state. Failures: network -> `upload.error.network`, 403 -> `upload.gate.banned`,
 *    others / Unreadable / SizeLimitExceeded -> `upload.error.prepare`; `preparation = Failed` and `error` is set; the photo and title stay.
 *  - [onSubmitClicked] (ignored unless [PhotoUploadUiState.canSubmit]): waits for a running preparation, restarts preparation when None / Failed, refreshes an
 *    expired lease (new policy, new uploadId; re-encodes with the saved edit when the new `maxBytes` is smaller than the file, else reuses the file), then
 *    `uploader.put(policy.uploadUrl, policy.contentType, bytes)`, then `creation.create(topicId, policy.uploadId, PostTitle.toRequestValue(title))`.
 *    PUT failure: network -> `upload.error.network` (policy kept); Http / Config -> `upload.error.upload` and the policy is dropped (next submit issues a new one).
 *    create: 403 -> `upload.gate.banned`; 401 -> [UploadEffect.ReauthRequired]; Network or InvalidResponse -> `home.today()` recovery (isPosted -> success with today's
 *    status; otherwise `upload.error.network`, policy kept); 400 -> `home.today()` (isPosted -> `upload.error.duplicate`; 404 or other topicDate -> `upload.error.topic-changed`;
 *    else serverMessage + everything prepared is thrown away); other failures (404, 5xx) -> `upload.error.create` (404 also throws the preparation away).
 *    Success: files deleted, `PostCreations.announce`, `screen_view photo_upload_success`, [UploadEffect.ShowSuccess], `completed = true`.
 *  - [onScreenGone] cancels everything and deletes the files; no effect is emitted afterwards. [onSessionEnded] additionally forgets photo, edit, title and policy.
 */
class PhotoUploadStateHolder(
    private val scope: CoroutineScope,
    private val topicDate: LocalDate,
    home: HomeRepository,
    creation: PostCreationRepository,
    uploader: PostImageUploader,
    encoder: PostImageEncoder,
    private val codec: PhotoCodec,
    files: TempImageStore,
    private val gallery: GallerySaver,
    private val toaster: AppToaster,
    camera: CameraAvailability,
    monotonic: MonotonicClock,
    creations: PostCreations,
    private val analytics: AnalyticsTracker,
) {
    private val store = UploadStore(cameraAvailable = camera.hasCamera())
    private val jobs = UploadJobs(scope) { failUnexpectedly() }
    private val topic = UploadTopic(topicDate, home, store)
    private val preparer = UploadPreparer(creation, encoder, files, monotonic, store, jobs)
    private val submitter = UploadSubmitter(
        topicDate, home, creation, uploader, files, preparer, topic, creations, analytics, monotonic, store,
    )
    private var shown = false
    private var gone = false
    private var pickGeneration = 0
    private var topicJob: Job? = null
    private var pickJob: Job? = null
    private var submitJob: Job? = null

    val state: StateFlow<PhotoUploadUiState> get() = store.state
    val effects: Flow<UploadEffect> get() = store.effects

    fun onScreenShown() {
        if (shown) return
        shown = true
        analytics.screenViewSafely(SCREEN)
        loadTopic()
    }

    fun onTopicRetryClicked() {
        if (store.current.topic is TopicState.Failed) loadTopic()
    }

    fun onAlbumPicked(result: PickerResult) {
        if (result is PickerResult.Picked) probe(result.photo)
    }

    fun onCameraCaptured(result: PickerResult) {
        if (result !is PickerResult.Picked) return
        saveCaptureToGallery(result.photo)
        probe(result.photo)
    }

    fun onEditorDone(edit: PhotoEdit) {
        if (gone) return
        val request = store.current.editor ?: return
        if (request.isFirstEdit) {
            store.update { it.copy(photo = request.photo, edit = edit, editor = null) }
            preparer.start(request.photo, edit)
        } else {
            val changed = edit != store.current.edit
            store.update { it.copy(edit = edit, editor = null) }
            if (changed) preparer.start(request.photo, edit)
        }
    }

    fun onEditorCancelled() {
        store.update { it.copy(editor = null) }
    }

    fun onPhotoTapped() {
        val current = store.current
        val photo = current.photo ?: return
        if (current.submitting || current.editor != null || current.completed) return
        store.update { it.copy(editor = EditorRequest(photo, current.edit, isFirstEdit = false)) }
    }

    fun onTitleChanged(raw: String) {
        if (store.current.submitting || store.current.completed) return
        store.update { it.copy(title = PostTitle.limitInput(raw)) }
    }

    fun onSubmitClicked() {
        if (!store.current.canSubmit) return
        store.update { it.copy(submitting = true) }
        submitJob = jobs.launch {
            try {
                submitter.submit()
            } finally {
                store.update { it.copy(submitting = false) }
            }
        }
    }

    fun onErrorShown(id: Long) {
        if (store.current.error?.id == id) store.update { it.copy(error = null) }
    }

    fun onSuccessConfirmed() {
        if (store.current.completed) store.emit(UploadEffect.OpenDisplay(topicDate))
    }

    fun onScreenGone() {
        gone = true
        store.close()
        listOf(topicJob, pickJob, submitJob).forEach { it?.cancel() }
        preparer.reset()
        store.update { it.copy(submitting = false, preparation = Preparation.None, editor = null) }
    }

    fun onSessionEnded() {
        onScreenGone()
        store.update { it.copy(photo = null, edit = PhotoEdit.IDENTITY, title = "", error = null, completed = false) }
    }

    // ---- internals ------------------------------------------------------------------------------------------

    private fun loadTopic() {
        topicJob?.cancel()
        topicJob = jobs.launch { topic.load() }
    }

    /** Reads the header of [photo]; only the latest pick may open the editor (REQ-UPL-019). */
    private fun probe(photo: PickedPhoto) {
        if (gone) return
        val generation = ++pickGeneration
        pickJob?.cancel()
        pickJob = jobs.launch {
            val bounds = readBounds(photo)
            if (generation != pickGeneration) return@launch
            if (bounds == null) {
                store.showError(UploadCopyKeys.ERROR_PREPARE)
            } else {
                store.update { it.copy(editor = EditorRequest(photo, PhotoEdit.IDENTITY, isFirstEdit = true)) }
            }
        }
    }

    private suspend fun readBounds(photo: PickedPhoto): ImageSize? = try {
        codec.readBounds(photo)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null // an undecodable photo is "unreadable" (REQ-UPL-018)
    }

    /** Saved once, right after capture. It outlives the screen, so a late failure goes to the app toast (REQ-UPL-016). */
    private fun saveCaptureToGallery(photo: PickedPhoto) {
        if (photo.source != PhotoSource.CAMERA) return
        jobs.launch {
            val saved = try {
                gallery.saveCapture(photo)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                false // denied permission or I/O failure: same message as a refusal
            }
            if (saved) return@launch
            if (gone) toaster.show(UploadCopyKeys.CAMERA_SAVE_FAILED) else store.showError(UploadCopyKeys.CAMERA_SAVE_FAILED)
        }
    }

    /** A job threw something that is not an `ApiError` (a bug): end whatever was running with the prepare message. */
    private fun failUnexpectedly() {
        store.update {
            it.copy(submitting = false, preparation = if (it.preparation == Preparation.Preparing) Preparation.Failed(UploadCopyKeys.ERROR_PREPARE) else it.preparation)
        }
        store.showError(UploadCopyKeys.ERROR_PREPARE)
    }

    private companion object {
        const val SCREEN = "photo_upload"
    }
}
