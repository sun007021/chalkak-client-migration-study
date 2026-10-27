package kr.chalkak.core.data.home

import java.time.Instant
import java.time.LocalDate

/** `GET /topics?date=` response (only the fields home needs). */
data class HomeTopic(val id: String, val title: String, val topicDate: LocalDate, val phase: String)

/** One card of `GET /posts?sort=popular` (home ranking / popular rows). */
data class HomePost(
    val id: String,
    val authorId: String,
    val thumbnailImageUrl: String,
    val originalImageUrl: String,
    val title: String?,
    val likeCount: Int,
    val isLiked: Boolean,
    val isMine: Boolean,
)

/** Moderation states the server may send for the caller's own post. Anything else is an invalid response (TC-HOME-011). */
enum class ModerationStatus { VALIDATING, PENDING, APPROVED }

/** `GET /posts/today`. Invariant (REQ-HOME-017): isPosted=false -> postId/status null; isPosted=true -> postId and status set. */
data class TodayPost(
    val topicDate: LocalDate,
    val isPosted: Boolean,
    val postId: String?,
    val status: ModerationStatus?,
)

/** One day of `GET /posts/calendar` (server never sends REJECTED / VALIDATING days). */
data class CalendarEntry(
    val topicDate: LocalDate,
    val postId: String,
    val thumbnailImageUrl: String,
    val status: ModerationStatus,
)

/** [thumbnailUrl] is null when the server value is not a usable https URL: the banner stays, the thumbnail slot falls back (TC-BANR-007). */
data class Banner(
    val id: String,
    val title: String,
    val subtitle: String,
    val webViewUrl: String,
    val thumbnailUrl: String?,
    val createdAt: Instant,
)

/** [hasNext] is false when the field is absent (TC-BANR-004). */
data class BannerPage(val currentPage: Int, val pageSize: Int, val hasNext: Boolean, val banners: List<Banner>)
