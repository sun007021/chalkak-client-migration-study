package kr.chalkak.feature.home

import kr.chalkak.core.common.WeekCalendar
import kr.chalkak.core.common.Week
import kr.chalkak.core.data.home.CalendarEntry
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.home.TodayPost
import kr.chalkak.core.network.ApiError

/** Pure mapping helpers of the home holder. */

internal const val RANKING_LIMIT = 5

internal fun ApiError.isNetwork(): Boolean = this is ApiError.Network

internal fun ApiError.isCancelled(): Boolean = this is ApiError.Cancelled

internal fun ApiError.isHttp(status: Int): Boolean = this is ApiError.Http && this.status == status

/** Toast copy for a failure that left existing content in place (D-20). */
internal fun ApiError.toastKey(): String = if (isNetwork()) HomeCopyKeys.COMMON_NETWORK else HomeCopyKeys.COMMON_GENERIC

/** Seven cells Sunday..Saturday; [entries] with a topicDate outside the week are ignored. */
internal fun weekDays(week: Week, entries: List<CalendarEntry>): List<WeekDay> =
    week.days.mapIndexed { index, date ->
        WeekDay(date, WeekCalendar.weekdayHeaders[index], entries.firstOrNull { it.topicDate == date })
    }

/** Hero for a successful `GET /posts/today`; [thumbnailUrl] is only read for photo states. */
internal inline fun heroOf(today: TodayPost, thumbnailUrl: (postId: String) -> String?): HeroState {
    val postId = today.postId
    val status = today.status
    return when {
        !today.isPosted -> HeroState.Empty()
        postId == null || status == null -> HeroState.Error()
        status == ModerationStatus.VALIDATING -> HeroState.Processing
        else -> HeroState.Photo(postId, today.topicDate, thumbnailUrl(postId), status)
    }
}

/** Hero for a failed `GET /posts/today` that is not a cancellation: 404 and 403 are states, the rest an error. */
internal fun heroOfFailure(error: ApiError): HeroState = when {
    error.isHttp(404) -> HeroState.NoOpenTopic
    error.isHttp(403) -> HeroState.Empty(banned = true)
    else -> HeroState.Error(network = error.isNetwork())
}

internal fun rankingOf(posts: List<HomePost>): Section<List<HomePost>> = Section.Ready(posts.take(RANKING_LIMIT))
