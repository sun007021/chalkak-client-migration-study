package kr.chalkak.feature.upload

import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.feature.upload.edit.PhotoEdit
import kr.chalkak.feature.upload.image.PickedPhoto
import java.time.LocalDate

sealed interface TopicState {
    data object Loading : TopicState

    data class Loaded(val topicId: String, val title: String) : TopicState

    /** [copyKey] is `upload.topic.load-failed`, or `upload.error.network` for a connection failure (TC-UPL-012). */
    data class Failed(val copyKey: String) : TopicState
}

/** Background photo preparation (policy + WebP encode) as the screen sees it. */
sealed interface Preparation {
    /** Nothing prepared (no photo, or everything was thrown away and the next "전시하기" starts from scratch). */
    data object None : Preparation

    data object Preparing : Preparation

    data object Ready : Preparation

    data class Failed(val copyKey: String) : Preparation
}

/** One user-visible message. [id] is unique per occurrence (D-20). [serverMessage] is shown verbatim and wins over [copyKey]. */
data class UploadError(val id: Long, val copyKey: String? = null, val serverMessage: String? = null)

/** The editor must be shown for [photo]. [isFirstEdit] = just picked (cancelling drops the pick); false = re-edit via photo tap. */
data class EditorRequest(val photo: PickedPhoto, val initialEdit: PhotoEdit, val isFirstEdit: Boolean)

data class PhotoUploadUiState(
    val topic: TopicState = TopicState.Loading,
    /** The confirmed selection (set when the first editor session ends with "완료"). */
    val photo: PickedPhoto? = null,
    val edit: PhotoEdit = PhotoEdit.IDENTITY,
    val editor: EditorRequest? = null,
    val title: String = "",
    val preparation: Preparation = Preparation.None,
    val submitting: Boolean = false,
    /** True once the post exists (201 or recovery); the upload screen can no longer submit (REQ-UPL-064). */
    val completed: Boolean = false,
    val error: UploadError? = null,
    val cameraAvailable: Boolean = true,
) {
    /** Photo selected, not submitting, no editor open, not completed. Independent of [preparation] (REQ-UPL-037). */
    val canSubmit: Boolean get() = photo != null && !submitting && editor == null && !completed

    /** `upload.submitting` while [submitting], else `upload.submit`. */
    val submitLabelKey: String get() = if (submitting) UploadCopyKeys.SUBMITTING else UploadCopyKeys.SUBMIT
}

/** What the success screen needs. */
data class SuccessInfo(val postId: String, val topicDate: LocalDate, val topicTitle: String, val status: ModerationStatus)

sealed interface UploadEffect {
    /** 201 or recovered: show the success screen (screen_view `photo_upload_success` was sent). */
    data class ShowSuccess(val info: SuccessInfo) : UploadEffect

    /** Success screen "확인했어요.": open the exhibition at [topicDate] and do not come back to the upload screen (REQ-UPL-062). */
    data class OpenDisplay(val topicDate: LocalDate) : UploadEffect

    /** 401 that survived the token refresh: login screen. Photo / title / prepared state are kept until [PhotoUploadStateHolder.onSessionEnded]. */
    data object ReauthRequired : UploadEffect
}
