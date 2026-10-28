package kr.chalkak.core.data.onboarding

import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiResult
import okhttp3.OkHttpClient

/** Presigned `PUT {uploadUrl}`: `Content-Type: image/png`, no Authorization, body = PNG bytes, 60s timeout (REQ-ONB-014). */
fun interface SignatureUploader {
    suspend fun put(uploadUrl: String, png: ByteArray): ApiResult<Unit>
}

/** Delegates to `ApiClient.putPresigned(uploadUrl, AppConstants.SIGNATURE_CONTENT_TYPE, png, uploadClient)`. */
class PresignedSignatureUploader(
    private val api: ApiClient,
    private val uploadClient: OkHttpClient,
) : SignatureUploader {
    override suspend fun put(uploadUrl: String, png: ByteArray): ApiResult<Unit> = api.putPresigned(uploadUrl, AppConstants.SIGNATURE_CONTENT_TYPE, png, uploadClient)
}
