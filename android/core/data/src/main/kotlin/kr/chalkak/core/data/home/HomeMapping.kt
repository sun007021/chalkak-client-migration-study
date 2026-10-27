package kr.chalkak.core.data.home

import kr.chalkak.core.common.InstantParser
import kr.chalkak.core.common.Kst
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import java.net.URI
import java.net.URISyntaxException
import java.time.LocalDate

/** DTO -> domain mapping. A [Malformed] is turned into `Failure(InvalidResponse)` by [mapValid]. */
internal class Malformed(reason: String) : Exception(reason)

internal inline fun <T, R> ApiResult<T>.mapValid(transform: (T) -> R): ApiResult<R> =
    when (this) {
        is ApiResult.Failure -> this
        is ApiResult.Success -> try {
            ApiResult.Success(transform(value))
        } catch (e: Malformed) {
            ApiResult.Failure(ApiError.InvalidResponse(e.message ?: "invalid response"))
        }
    }

private fun apiDate(text: String, field: String): LocalDate = Kst.parseApiDate(text) ?: throw Malformed("bad $field")

private fun moderationStatus(text: String): ModerationStatus =
    ModerationStatus.entries.firstOrNull { it.name == text } ?: throw Malformed("unknown moderationStatus")

/** The https URL itself, or null when it is not https or has no host. */
fun httpsUrlOrNull(text: String?): String? {
    if (text == null) return null
    val uri = try {
        URI(text)
    } catch (_: URISyntaxException) {
        return null
    }
    return text.takeIf { uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank() }
}

internal fun TopicDto.toDomain(requestedDate: LocalDate): HomeTopic {
    val date = apiDate(topicDate, "topicDate")
    if (date != requestedDate) throw Malformed("topicDate mismatch")
    return HomeTopic(id, title, date, phase)
}

internal fun PostDto.toDomain() =
    HomePost(id, authorId, thumbnailImageUrl, originalImageUrl, title, likeCount, isLiked, isMine)

/** REQ-HOME-017: isPosted=false must carry no postId/status; isPosted=true needs both. */
internal fun TodayPostDto.toDomain(): TodayPost {
    val status = moderationStatus?.let(::moderationStatus)
    if (isPosted && (postId == null || status == null)) throw Malformed("posted without postId/status")
    if (!isPosted && (postId != null || status != null)) throw Malformed("not posted with postId/status")
    return TodayPost(apiDate(topicDate, "topicDate"), isPosted, postId, status)
}

internal fun CalendarPostDto.toDomain() =
    CalendarEntry(apiDate(topicDate, "topicDate"), postId, thumbnailImageUrl, moderationStatus(status))

internal fun BannerPageDto.toDomain() =
    BannerPage(currentPage, pageSize, hasNext ?: false, banners.map { it.toDomain() })

private fun BannerDto.toDomain() = Banner(
    id = id,
    title = title,
    subtitle = subtitle,
    webViewUrl = httpsUrlOrNull(webViewUrl) ?: throw Malformed("webViewUrl is not https"),
    thumbnailUrl = httpsUrlOrNull(thumbnailUrl),
    createdAt = InstantParser.parse(createdAt) ?: throw Malformed("bad createdAt"),
)
