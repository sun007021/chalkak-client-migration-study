package kr.chalkak.core.network

/**
 * [path] is relative to `/api/v1` and starts with "/" (e.g. "/posts/today").
 * [jsonBody] is already-serialized JSON; null means no body (no Content-Type is sent then).
 * UUIDs must be passed lower-case (TC-NET-052); the client lower-cases path UUID segments defensively.
 */
data class ApiRequest(
    val method: HttpMethod,
    val path: String,
    val query: List<Pair<String, String>> = emptyList(),
    val jsonBody: String? = null,
)
