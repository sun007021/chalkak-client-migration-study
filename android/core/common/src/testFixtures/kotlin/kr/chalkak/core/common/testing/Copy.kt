package kr.chalkak.core.common.testing

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/** User-facing strings from `shared/copy/ko.json`. Tests assert messages through keys, never literals. */
object Copy {
    private val table: Map<String, String> by lazy {
        Json.parseToJsonElement(File(Fixtures.sharedDir, "copy/ko.json").readText(Charsets.UTF_8))
            .jsonObject.mapValues { it.value.jsonPrimitive.content }
    }

    operator fun get(key: String): String = table[key] ?: error("missing copy key: $key")
}
