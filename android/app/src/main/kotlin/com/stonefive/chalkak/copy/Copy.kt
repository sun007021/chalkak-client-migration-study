package com.stonefive.chalkak.copy

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject

/**
 * User-facing strings from `shared/copy/ko.json` (flat `key -> text`). The file is copied into the APK assets by the
 * `copySharedAssets*` Gradle task (`assets/shared/copy/ko.json`); it is never committed under `app/`.
 *
 * Placeholders are written `{name}` in the text (for example `{n}일`); [format] fills them.
 * A missing key renders as the key itself (visible in screenshots, never a crash); tests assert the keys they use.
 */
class Copy(private val strings: Map<String, String>) {
    operator fun get(key: String): String = strings[key] ?: key

    fun getOrNull(key: String): String? = strings[key]

    fun contains(key: String): Boolean = key in strings

    /** `format("display.picker.day", "n" to 5)` -> text with `{n}` replaced. */
    fun format(key: String, vararg args: Pair<String, Any>): String =
        args.fold(get(key)) { text, (name, value) -> text.replace("{$name}", value.toString()) }

    companion object {
        const val ASSET_PATH = "shared/copy/ko.json"

        fun fromJson(text: String): Copy {
            val root: JsonObject = Json.parseToJsonElement(text).jsonObject
            return Copy(root.mapValues { (key, value) -> (value as? JsonPrimitive)?.content ?: error("copy value of $key is not a string") })
        }

        fun load(context: Context): Copy =
            context.assets.open(ASSET_PATH).bufferedReader(Charsets.UTF_8).use { fromJson(it.readText()) }
    }
}

val LocalCopy = staticCompositionLocalOf<Copy> { error("ProvideCopy is missing above this composable") }

@Composable
fun ProvideCopy(copy: Copy, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalCopy provides copy, content = content)
}
