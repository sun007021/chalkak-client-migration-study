package kr.chalkak.core.data.home

import kotlinx.serialization.Serializable

@Serializable
data class TopicDto(
    val id: String,
    val title: String,
    val topicDate: String,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val phase: String,
)

@Serializable
data class PostDto(
    val id: String,
    val authorId: String,
    val originalImageUrl: String,
    val thumbnailImageUrl: String,
    val title: String? = null,
    val likeCount: Int = 0,
    val isLiked: Boolean = false,
    val isMine: Boolean = false,
)

@Serializable
data class PostListDto(
    val currentPage: Int = 1,
    val pageSize: Int = 20,
    val hasNext: Boolean = false,
    val posts: List<PostDto> = emptyList(),
)

@Serializable
data class TodayPostDto(
    val topicDate: String,
    val isPosted: Boolean,
    val postId: String? = null,
    val moderationStatus: String? = null,
)

@Serializable
data class CalendarPostDto(
    val topicDate: String,
    val postId: String,
    val thumbnailImageUrl: String,
    val status: String,
)

@Serializable
data class CalendarDto(val year: Int, val month: Int, val posts: List<CalendarPostDto> = emptyList())

@Serializable
data class UnreadStatusDto(val hasUnread: Boolean)

@Serializable
data class BannerDto(
    val id: String,
    val title: String,
    val subtitle: String,
    val webViewUrl: String,
    val thumbnailUrl: String? = null,
    val createdAt: String,
)

@Serializable
data class BannerPageDto(
    val currentPage: Int = 1,
    val pageSize: Int = 10,
    val hasNext: Boolean? = null,
    val banners: List<BannerDto>,
)
