package kr.chalkak.core.common

import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.chrono.IsoChronology
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.time.format.ResolverStyle
import java.util.Locale

/** KST (Asia/Seoul) date calculations. Independent of the device time zone and locale. */
object Kst {
    val zone: ZoneId = AppConstants.SERVICE_TIME_ZONE

    private val apiDateFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("uuuu-MM-dd", Locale.ROOT)
        .withDecimalStyle(DecimalStyle.STANDARD)
        .withChronology(IsoChronology.INSTANCE)
        .withResolverStyle(ResolverStyle.STRICT)

    /** KST calendar date of [instant]. */
    fun dateOf(instant: Instant): LocalDate = instant.atZone(zone).toLocalDate()

    /** Calendar date -> `yyyy-MM-dd` in ASCII digits / Gregorian calendar regardless of default Locale. */
    fun formatApiDate(date: LocalDate): String = apiDateFormat.format(date)

    /** `yyyy-MM-dd` -> date, or null when malformed. */
    fun parseApiDate(text: String): LocalDate? =
        try {
            LocalDate.parse(text, apiDateFormat)
        } catch (_: DateTimeException) {
            null
        }
}
