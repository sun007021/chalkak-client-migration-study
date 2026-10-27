package kr.chalkak.core.network.testing

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.network.RawResponse

/** A fixture file interpreted with its manifest entry (status, headers) and the `_raw/_contentType/_fault` reserved keys. */
data class FixtureResponse(
    val status: Int,
    val headers: Map<String, String>,
    val contentType: String?,
    val body: String,
    /** "timeout" | "disconnect" | null */
    val fault: String?,
) {
    companion object {
        fun load(path: String, status: Int? = null): FixtureResponse {
            val entry = Fixtures.manifestEntry(path)
            val manifestStatus = entry["status"]?.jsonPrimitive?.int ?: 200
            val headers = entry["headers"]?.jsonObject?.mapValues { it.value.jsonPrimitive.content } ?: emptyMap()
            val text = Fixtures.read(path)
            val obj = Fixtures.json(path) as? JsonObject
            val fault = obj?.get("_fault")?.jsonPrimitive?.contentOrNull
            return when {
                fault != null -> FixtureResponse(status ?: manifestStatus, headers, null, "", fault)
                obj != null && "_raw" in obj -> FixtureResponse(
                    status ?: manifestStatus,
                    headers,
                    obj["_contentType"]?.jsonPrimitive?.contentOrNull,
                    obj.getValue("_raw").jsonPrimitive.content,
                    null,
                )
                else -> FixtureResponse(status ?: manifestStatus, headers, "application/json; charset=utf-8", text, null)
            }
        }
    }
}

object RawResponses {
    fun fromFixture(path: String, status: Int? = null): RawResponse {
        val f = FixtureResponse.load(path, status)
        check(f.fault == null) { "fault fixtures have no response: $path" }
        return RawResponse(f.status, f.contentType, f.body, f.headers)
    }
}
