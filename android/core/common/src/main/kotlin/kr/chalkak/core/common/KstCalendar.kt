package kr.chalkak.core.common

import java.time.LocalDate
import java.time.YearMonth

/** "Today" and friends, computed from an injected [Clock]. */
class KstCalendar(private val clock: Clock) {
    fun today(): LocalDate = Kst.dateOf(clock.now())

    /** D-19: recomputed on each call; never cached at process start. */
    fun currentMonth(): YearMonth = YearMonth.from(today())

    /** D-23: the title edit button is shown only when the post's topicDate is KST today. */
    fun isTitleEditAllowed(topicDate: LocalDate): Boolean = topicDate == today()

    /** REQ-TIME-007: true when KST midnight passed since [since] (screen should reload for the new date). */
    fun hasDateChangedSince(since: LocalDate): Boolean = today() != since

    /** D-19: server month list (any order) + current month, de-duplicated, newest first. */
    fun selectableMonths(serverMonths: List<YearMonth>): List<YearMonth> =
        (serverMonths + currentMonth()).distinct().sortedDescending()
}
