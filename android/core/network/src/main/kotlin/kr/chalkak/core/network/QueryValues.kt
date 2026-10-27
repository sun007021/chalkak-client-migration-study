package kr.chalkak.core.network

import java.time.LocalDate
import java.util.Locale

/** Locale- and timezone-independent encoders for query/path/body values (TC-NET-052, TC-NET-053). */
object QueryValues {
    private val UUID_REGEX = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    /** `yyyy-MM-dd`, ASCII digits regardless of default locale/calendar. */
    fun date(date: LocalDate): String = date.toString()

    /** Plain ASCII decimal (no grouping, no Arabic-Indic digits). */
    fun int(value: Int): String = value.toString()

    /** Lower-case wire form (e.g. `LATEST` -> `latest`). */
    fun sort(name: String): String = name.lowercase(Locale.ROOT)

    /** Canonical lower-case UUID text (Swift-style upper-case input is converted). */
    fun uuid(raw: String): String {
        require(isUuid(raw)) { "not a UUID" }
        return raw.lowercase(Locale.ROOT)
    }

    fun isUuid(raw: String): Boolean = UUID_REGEX.matches(raw)
}
