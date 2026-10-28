package kr.chalkak.core.data.upload

import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiResult
import okhttp3.OkHttpClient

/**
 * Presigned `PUT {uploadUrl}`: no Authorization, `Content-Type` exactly [contentType] (the policy value), body = the WebP
 * bytes untouched, 60s timeout, idempotent retries (REQ-UPL-043, REQ-UPL-045). An `http://` non-loopback URL is
 * `Failure(Config(INSECURE_HTTP))` and nothing is sent (TC-UPL-056).
 */
fun interface PostImageUploader {
    suspend fun put(uploadUrl: String, contentType: String, webp: ByteArray): ApiResult<Unit>
}

/** Delegates to `ApiClient.putPresigned(uploadUrl, contentType, webp, uploadClient)`. */
class PresignedPostImageUploader(
    private val api: ApiClient,
    private val uploadClient: OkHttpClient,
) : PostImageUploader {
    override suspend fun put(uploadUrl: String, contentType: String, webp: ByteArray): ApiResult<Unit> = api.putPresigned(uploadUrl, contentType, webp, uploadClient)
}
