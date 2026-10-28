package kr.chalkak.feature.display

import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.common.PostTitle
import kr.chalkak.core.data.post.PostSummary
import java.time.LocalDate

/** How the detail screen was opened (decides the seed and the provisional "mine" flag until the detail answers, D-26). */
sealed interface FeedEntry {
    val postId: String

    /** From the exhibition / home ranking: seeded with the list item; `isMine` from the list item. */
    data class FromDisplay(val post: PostSummary) : FeedEntry {
        override val postId: String get() = post.id
    }

    /** From the record tab: my post; may show the passed thumbnail first. */
    data class FromRecord(override val postId: String, val thumbnailUrl: String?) : FeedEntry

    /** From a push (POST_APPROVED, AI_REVIEW_*): my post, no seed. */
    data class FromPush(override val postId: String) : FeedEntry
}

enum class FeedStatus { Loading, Content, NotFound, Error }

/** What the photo area and title row render. Fields are null while only a thumbnail seed is known. */
data class FeedContent(
    val postId: String,
    val originalImageUrl: String?,
    /** Thumbnail, or the original when the server sent no thumbnail (TC-FEED-003). */
    val thumbnailImageUrl: String?,
    val signatureImageUrl: String?,
    val title: String?,
    val likeCount: Int?,
    val isLiked: Boolean?,
    /** `topic.topicDate`; null until the detail answered (list seeds have no topic). */
    val topicDate: LocalDate?,
) {
    /** "M월 d일의 주제" (KST text of [topicDate], no device time zone), null without topicDate. */
    val dateLabel: String? get() = topicDate?.let(DateFormats::topicLabel)

    /** Trimmed title or "무제" (`feed.title-none`). */
    val displayTitle: String get() = PostTitle.displayText(title)

    /** `feed.photo-alt` ("작품 이미지: {title}") or `feed.photo-alt-none` when the title is blank. */
    val photoAltCopyKey: String get() = if (title.isNullOrBlank()) CopyKeys.FEED_PHOTO_ALT_NONE else CopyKeys.FEED_PHOTO_ALT
}

data class EditDialogState(
    val input: String,
    val saving: Boolean,
    /** Copy key of the failure shown in the dialog, null if none. */
    val errorCopyKey: String?,
    /** Raw server message of a rejected title (TC-FEED-028); display text only. */
    val serverMessage: String?,
)

data class FeedUiState(
    val status: FeedStatus,
    /** `feed.error.not-found` / `feed.error.load` / `feed.error.invalid` / `common.error.network` for NotFound and Error. */
    val errorCopyKey: String?,
    val content: FeedContent?,
    /** The detail response arrived (list seeds are provisional until then, REQ-FEED-009). */
    val confirmed: Boolean,
    val isMine: Boolean,
    /** Heart enabled: only after [confirmed]. */
    val likeEnabled: Boolean,
    /** Mine, confirmed, and the detail's `topic.topicDate` is KST today (D-23). */
    val canEditTitle: Boolean,
    val canDelete: Boolean,
    val edit: EditDialogState?,
    val deleteConfirmVisible: Boolean,
    val deleting: Boolean,
    val toast: ToastMessage?,
)

sealed interface FeedEffect {
    /** DELETE succeeded: go back, drop [postId] from lists, show [toastCopyKey] (`feed.delete.success`) once. */
    data class Deleted(val postId: String, val toastCopyKey: String) : FeedEffect

    /** The post is gone (404 on title edit or like): close the detail and refresh the list. */
    data class Closed(val postId: String) : FeedEffect

    /** Guest / session lost (401): show the login screen. */
    data object LoginRequired : FeedEffect
}
