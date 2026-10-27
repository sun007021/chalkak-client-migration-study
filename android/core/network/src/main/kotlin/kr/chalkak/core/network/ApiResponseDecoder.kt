package kr.chalkak.core.network

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** What came back over HTTP, before interpretation. [body] is UTF-8 text ("" when absent). */
data class RawResponse(
    val status: Int,
    val contentType: String?,
    val body: String,
    val headers: Map<String, String> = emptyMap(),
) {
    fun header(name: String): String? = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value

    val isSuccessful: Boolean get() = status in 200..299
}

class ApiResponseDecoder(private val json: Json = ApiJson.instance) {
    /**
     * 2xx + `application/json` (charset allowed) + parseable body -> Success.
     * Empty body, non-JSON content type, malformed JSON, missing required field, type mismatch,
     * or unknown enum without a safe serializer -> Failure(InvalidResponse). Never throws.
     * Non-2xx -> Failure([parseError]).
     */
    fun <T> decode(response: RawResponse, serializer: KSerializer<T>): ApiResult<T> {
        if (!response.isSuccessful) return ApiResult.Failure(parseError(response))
        if (response.body.isBlank()) return invalid("empty body")
        if (!isJson(response.contentType)) return invalid("unexpected content type ${response.contentType}")
        return try {
            ApiResult.Success(json.decodeFromString(serializer, response.body))
        } catch (e: Exception) {
            invalid("cannot decode body: ${e::class.simpleName}")
        }
    }

    /** For 204/empty-success endpoints: any 2xx is success and the body is never decoded. Non-2xx -> Failure([parseError]). */
    fun decodeNoContent(response: RawResponse): ApiResult<Unit> =
        if (response.isSuccessful) ApiResult.Success(Unit) else ApiResult.Failure(parseError(response))

    /**
     * `{errorCode,message}` -> Http(status, code, message). Empty/HTML/non-JSON body -> Http(status, fallback, null)
     * where fallback is INTERNAL_ERROR for 5xx and BUSINESS_ERROR otherwise. Unknown code -> BUSINESS_ERROR.
     * Preserves the `Retry-After` header in `retryAfterRaw`.
     */
    fun parseError(response: RawResponse): ApiError.Http {
        val obj = try {
            json.parseToJsonElement(response.body) as? JsonObject
        } catch (e: Exception) {
            null
        }
        val rawCode = (obj?.get("errorCode") as? JsonPrimitive)?.contentOrNull
        val code = if (rawCode != null) {
            ErrorCode.from(rawCode)
        } else if (response.status >= 500) {
            ErrorCode.INTERNAL_ERROR
        } else {
            ErrorCode.BUSINESS_ERROR
        }
        val message = (obj?.get("message") as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
        return ApiError.Http(response.status, code, message, response.header("Retry-After"))
    }

    private fun invalid(reason: String) = ApiResult.Failure(ApiError.InvalidResponse(reason))

    private fun isJson(contentType: String?): Boolean =
        contentType?.substringBefore(';')?.trim().equals("application/json", ignoreCase = true)
}
