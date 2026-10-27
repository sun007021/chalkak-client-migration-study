package kr.chalkak.core.network

import okhttp3.HttpUrl

/** Where the Authorization header may and may not go (REQ-NET-017, TC-NET-014/031/051). */
object RequestRules {
    private val PUBLIC_GET_PATHS = setOf("/posts", "/topics", "/banners")

    /** `POST /auth/refresh`, `POST /auth/logout`, `/auth/social-*`, `GET /banners` never carry Authorization. */
    fun neverSendsAuthorization(method: HttpMethod, path: String): Boolean = when (method) {
        HttpMethod.POST -> path == "/auth/refresh" || path == "/auth/logout" || path.startsWith("/auth/social-")
        HttpMethod.GET -> path == "/banners"
        else -> false
    }

    /** Public GETs: `/posts` (list only, not `/posts/{id}`), `/topics`, `/banners`. Guests call them without a header. */
    fun isPublicGet(method: HttpMethod, path: String): Boolean = method == HttpMethod.GET && path in PUBLIC_GET_PATHS

    /** https always; http only for loopback (mock server); any other http never gets a token. */
    fun canAttachAuthorization(url: HttpUrl): Boolean = ApiBaseUrl.isAllowedUrl(url)
}
