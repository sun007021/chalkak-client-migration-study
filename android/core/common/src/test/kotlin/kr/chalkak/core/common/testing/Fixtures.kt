package kr.chalkak.core.common.testing

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.time.Instant
import java.util.Locale
import java.util.TimeZone

/**
 * Reads the repo-level `shared/` assets (no copies). The `shared.dir` system property is set in Gradle.
 * NOTE: may move to a `:core:testing` module once other modules need it.
 */
object Fixtures {
    val sharedDir: File = File(requireNotNull(System.getProperty("shared.dir")) { "shared.dir system property missing" })

    fun read(path: String): String = File(sharedDir, "fixtures/$path").readText(Charsets.UTF_8)
    fun json(path: String): JsonElement = Json.parseToJsonElement(read(path))
    fun constants(): JsonObject = Json.parseToJsonElement(File(sharedDir, "constants.json").readText(Charsets.UTF_8)).jsonObject

    val fixtureNow: Instant by lazy { Instant.parse(constants().getValue("FIXTURE_NOW").jsonPrimitive.content) }
}

/** Runs [block] with the JVM default time zone / locale swapped, then restores them. */
fun <T> withDevice(zoneId: String? = null, languageTag: String? = null, block: () -> T): T {
    val oldZone = TimeZone.getDefault()
    val oldLocale = Locale.getDefault()
    try {
        if (zoneId != null) TimeZone.setDefault(TimeZone.getTimeZone(zoneId))
        if (languageTag != null) Locale.setDefault(Locale.forLanguageTag(languageTag))
        return block()
    } finally {
        TimeZone.setDefault(oldZone)
        Locale.setDefault(oldLocale)
    }
}
