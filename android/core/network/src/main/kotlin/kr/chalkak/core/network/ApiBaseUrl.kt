package kr.chalkak.core.network

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Why `API_BASE_URL` was rejected (REQ-NET-001, REQ-NET-002). */
enum class ConfigError { MISSING, MALFORMED, INSECURE_HTTP, UNEXPECTED_PATH }

sealed interface ApiBaseUrlResult {
    data class Valid(val baseUrl: ApiBaseUrl) : ApiBaseUrlResult
    data class Invalid(val reason: ConfigError) : ApiBaseUrlResult
}

/**
 * The server origin (no path). The client appends `/api/v1` itself (REQ-NET-003).
 * https is required; http is accepted only for loopback hosts [LOOPBACK_HOSTS].
 */
class ApiBaseUrl private constructor(val origin: HttpUrl) {
    /** `<origin>/api/v1` as a URL ending without a trailing slash segment. */
    fun apiUrl(path: String, query: List<Pair<String, String>> = emptyList()): HttpUrl {
        val builder = origin.newBuilder().addPathSegments(API_PREFIX.trim('/') + "/" + path.trim('/'))
        query.forEach { (name, value) -> builder.addQueryParameter(name, value) }
        return builder.build()
    }

    companion object {
        val LOOPBACK_HOSTS: Set<String> = setOf("localhost", "127.0.0.1", "10.0.2.2")
        const val API_PREFIX: String = "/api/v1"

        /** Null/blank -> MISSING; no scheme/host -> MALFORMED; http non-loopback -> INSECURE_HTTP; path other than "" or "/" -> UNEXPECTED_PATH. */
        fun parse(raw: String?): ApiBaseUrlResult {
            if (raw.isNullOrBlank()) return ApiBaseUrlResult.Invalid(ConfigError.MISSING)
            val url = raw.trim().toHttpUrlOrNull() ?: return ApiBaseUrlResult.Invalid(ConfigError.MALFORMED)
            return when {
                !isAllowedUrl(url) -> ApiBaseUrlResult.Invalid(ConfigError.INSECURE_HTTP)
                url.encodedPath != "/" || url.query != null || url.fragment != null ->
                    ApiBaseUrlResult.Invalid(ConfigError.UNEXPECTED_PATH)
                else -> ApiBaseUrlResult.Valid(ApiBaseUrl(url))
            }
        }

        /** Same http rule for presigned upload URLs (https, or http only on loopback). */
        fun isAllowedUrl(url: HttpUrl): Boolean = url.isHttps || url.host in LOOPBACK_HOSTS
    }
}
