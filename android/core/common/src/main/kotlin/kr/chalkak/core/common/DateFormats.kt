package kr.chalkak.core.common

import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth

/** User-visible date strings. Always KST, no zero padding for month/day, locale independent. */
object DateFormats {
    /** "M월 d일의 주제" */
    fun topicLabel(date: LocalDate): String = "${monthDay(date)}의 주제"

    /** "M월 d일 · 오늘의 주제" */
    fun todayTopicLabel(date: LocalDate): String = "${monthDay(date)} · 오늘의 주제"

    /** "M월 d일 HH:mm" in KST, 24h, no year (D-09). */
    fun notificationTime(instant: Instant): String {
        val kst = instant.atZone(Kst.zone)
        return "${monthDay(kst.toLocalDate())} ${pad2(kst.hour)}:${pad2(kst.minute)}"
    }

    /** "chalkak-calendar-yyyy-MM.png" */
    fun calendarFileName(month: YearMonth): String =
        "chalkak-calendar-${pad4(month.year)}-${pad2(month.monthValue)}.png"

    /** "M월 d일" (header of the exhibition tab). */
    fun monthDay(date: LocalDate): String = "${date.monthValue}월 ${date.dayOfMonth}일"

    private fun pad2(value: Int): String = value.toString().padStart(2, '0')

    private fun pad4(value: Int): String = value.toString().padStart(4, '0')
}
