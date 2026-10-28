package kr.chalkak.core.data.post

import kotlinx.serialization.Serializable
import java.time.LocalDate

/** Wire values of `GET /posts?sort=` (always lower-case, TC-DISP-003). */
enum class PostSort(val wire: String) {
    RECENT("recent"),
    POPULAR("popular"),
    RANDOM("random"),
}

/** `GET /topics?date=` response. Dates stay strings (the label comes from the response text, D-09 / TC-DISP-041). */
@Serializable
data class Topic(
    val id: String,
    val title: String,
    val topicDate: String,
    val startsAt: String,
    val endsAt: String,
    val phase: String,
) {
    /** [topicDate] as a calendar date (the canonical date used for `GET /posts`, TC-DISP-002). */
    val date: LocalDate get() = LocalDate.parse(topicDate)
}

/** One item of `GET /posts` (list) - shared by display, home ranking and record. */
@Serializable
data class PostSummary(
    val id: String,
    val authorId: String,
    val originalImageUrl: String,
    val thumbnailImageUrl: String? = null,
    val signatureOriginalImageUrl: String,
    val signatureThumbnailImageUrl: String? = null,
    val title: String? = null,
    val submittedAt: String? = null,
    val likeCount: Int,
    val isLiked: Boolean,
    val isMine: Boolean,
) {
    /** Thumbnail, or the original when the server sent none (TC-FEED-003). */
    val thumbnailOrOriginalUrl: String get() = thumbnailImageUrl ?: originalImageUrl
}

@Serializable
data class PostPage(
    val currentPage: Int,
    val pageSize: Int,
    val hasNext: Boolean,
    val randomSeed: String? = null,
    val posts: List<PostSummary>,
)

@Serializable
data class PostTopicRef(val id: String, val title: String, val topicDate: String) {
    val date: LocalDate get() = LocalDate.parse(topicDate)
}

/** `GET /posts/{id}`. There is no `isMine`; mine = `authorId == logged-in userId` (D-26). */
@Serializable
data class PostDetail(
    val id: String,
    val authorId: String,
    val topic: PostTopicRef,
    val originalImageUrl: String,
    val thumbnailImageUrl: String? = null,
    val signatureOriginalImageUrl: String,
    val title: String? = null,
    val likeCount: Int,
    val isLiked: Boolean,
) {
    /** Thumbnail, or the original when the server sent none (TC-FEED-003). */
    val thumbnailOrOriginalUrl: String get() = thumbnailImageUrl ?: originalImageUrl
}

/** `PUT /posts/{id}` response. */
@Serializable
data class TitleUpdateResult(val postId: String, val title: String? = null)

/** `PUT|DELETE /posts/{id}/likes` response. */
@Serializable
data class LikeResult(val postId: String, val likeCount: Int, val isLiked: Boolean)

/**
 * Query of `GET /posts` (REQ-DISP-024, F1..F7). Invalid combinations cannot be constructed:
 *  - [page] >= 1;
 *  - [randomSeed] (when non-null) matches `[A-Za-z0-9_-]{1,64}`;
 *  - a seed is only allowed with [PostSort.RANDOM] (F5) and RANDOM pages >= 2 require a seed (F4).
 * Violations throw [IllegalArgumentException]. `pageSize` is always `AppConstants.PAGE_SIZE`.
 */
data class PostsQuery(
    val topicDate: LocalDate,
    val sort: PostSort,
    val page: Int = 1,
    val randomSeed: String? = null,
) {
    init {
        require(page >= 1) { "page must be >= 1" }
        if (randomSeed != null) {
            require(SEED_REGEX.matches(randomSeed)) { "invalid randomSeed" }
            require(sort == PostSort.RANDOM) { "randomSeed is only for random sort" }
        }
        require(sort != PostSort.RANDOM || page == 1 || randomSeed != null) { "random page >= 2 needs a randomSeed" }
    }

    private companion object {
        val SEED_REGEX = Regex("[A-Za-z0-9_-]{1,64}")
    }
}
