package kr.chalkak.feature.display

import kr.chalkak.core.common.TopicDateRange
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.Topic
import java.time.LocalDate

/**
 * What the exhibition currently shows and where it is heading. Plain mutable state shared by [DisplayStateHolder]
 * (input handling, output) and [DateNavigator] (loading and committing); single-threaded like both.
 */
internal class DisplayView(today: LocalDate, initialDate: LocalDate?, initialSort: PostSort?) {
    var latest: LocalDate = today
    val range: TopicDateRange get() = TopicDateRange.forToday(latest)

    /** Opened for a given date (not "today"): the date is kept when the first load starts. */
    var explicitDate = initialDate != null

    /** Shown date (the date the user moved to; unchanged until that date loaded). */
    var date: LocalDate = range.clamp(initialDate ?: latest)
    var sort: PostSort = initialSort ?: PostSort.RECENT

    var viewKey: ListKey? = null
    var viewTopic: Topic? = null
    var baseStatus = DisplayStatus.Loading
    var failureKey: String? = null
    var featuredPage = 0

    /** Date being moved to; repeated arrows continue from it (REQ-DISP-006). */
    var pendingDate: LocalDate? = null

    /** List a sort change / reload will show once it arrived (the old list stays meanwhile). */
    var targetKey: ListKey? = null

    fun isFirstLoading() = viewKey == null && baseStatus == DisplayStatus.Loading

    fun isArchive() = date < latest

    fun sortFor(date: LocalDate) = if (date < latest) PostSort.POPULAR else sort

    /** Back to the "nothing loaded yet" state of [today] (account change). */
    fun reset(today: LocalDate) {
        viewKey = null
        viewTopic = null
        baseStatus = DisplayStatus.Loading
        failureKey = null
        featuredPage = 0
        latest = today
        date = today
        explicitDate = false
        sort = PostSort.RECENT
        pendingDate = null
        targetKey = null
    }
}
