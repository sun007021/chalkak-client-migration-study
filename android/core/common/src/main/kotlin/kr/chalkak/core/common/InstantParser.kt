package kr.chalkak.core.common

import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/** Parses server `Instant` strings: `Z` / `+00:00`, 0/3/6/9 fraction digits. Returns null when invalid. */
object InstantParser {
    fun parse(text: String): Instant? =
        try {
            OffsetDateTime.parse(text).toInstant()
        } catch (_: DateTimeParseException) {
            null
        }
}
