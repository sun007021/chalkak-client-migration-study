package kr.chalkak.core.common

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.TemporalAdjusters

/** A Sunday-start week (Sunday..Saturday). */
data class Week(val start: LocalDate, val end: LocalDate) {
    val days: List<LocalDate> get() = (0..6).map { start.plusDays(it.toLong()) }

    /** Months the week touches, in order (calendar requests are sent for each, TC-TIME-012). */
    val months: List<YearMonth> get() = days.map { YearMonth.from(it) }.distinct()
}

object WeekCalendar {
    /** "일월화수목금토" header order (REQ-TIME-005). */
    val weekdayHeaders: List<String> = listOf("일", "월", "화", "수", "목", "금", "토")

    fun weekOf(date: LocalDate): Week {
        val start = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))
        return Week(start = start, end = start.plusDays(6))
    }
}
