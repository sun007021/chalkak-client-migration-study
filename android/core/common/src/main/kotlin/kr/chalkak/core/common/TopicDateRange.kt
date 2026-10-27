package kr.chalkak.core.common

import java.time.LocalDate
import java.time.YearMonth

/** Selectable topic dates: [earliest] (FIRST_TOPIC_DATE, D-12) through [latest] (KST today, no future). */
data class TopicDateRange(val earliest: LocalDate, val latest: LocalDate) {
    init {
        require(earliest <= latest) { "earliest($earliest) must not be after latest($latest)" }
    }

    fun contains(date: LocalDate): Boolean = date >= earliest && date <= latest

    /** The previous day, or null when it would be before [earliest]. */
    fun previous(date: LocalDate): LocalDate? = date.minusDays(1).takeIf { it >= earliest }

    /** The next day, or null when it would be after [latest] (never request a future topic). */
    fun next(date: LocalDate): LocalDate? = date.plusDays(1).takeIf { it <= latest }

    /** Clamps into the range (also fixes a device clock that is ahead of KST). */
    fun clamp(date: LocalDate): LocalDate = when {
        date > latest -> latest
        date < earliest -> earliest
        else -> date
    }

    /** Picker month-end correction: day 31 in a 30-day month -> last day; 2027-02-29 -> 02-28. Then [clamp]ed. */
    fun pick(year: Int, month: Int, day: Int): LocalDate = clamp(clampDayOfMonth(year, month, day))

    companion object {
        fun forToday(today: LocalDate, earliest: LocalDate = AppConstants.FIRST_TOPIC_DATE): TopicDateRange =
            TopicDateRange(earliest = earliest, latest = maxOf(today, earliest))
    }
}

/** Day of month clamped to the month's length (31 -> 30, leap years respected). */
fun clampDayOfMonth(year: Int, month: Int, day: Int): LocalDate =
    YearMonth.of(year, month).let { it.atDay(minOf(day, it.lengthOfMonth())) }
