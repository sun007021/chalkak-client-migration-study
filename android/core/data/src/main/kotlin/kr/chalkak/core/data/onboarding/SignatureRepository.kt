package kr.chalkak.core.data.onboarding

import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod

/** Settings-side signature API (SIGN). All calls carry the Bearer token (refresh handled by ApiClient). */
interface SignatureRepository {
    /** `GET /users/me/signature`. `400 SIGNATURE_REGISTRATION_REQUIRED` is returned as `Failure(Http(400, SIGNATURE_REGISTRATION_REQUIRED))`. */
    suspend fun current(): ApiResult<SignatureImages>

    /** `POST /users/me/signature/uploads` (no body). Idempotent: ApiClient retries 5xx/network twice (D-21). */
    suspend fun requestUpload(): ApiResult<SignatureUpload>

    /**
     * `PUT /users/me/signature {signatureOriginalUploadId}`. The response URL is deliberately discarded (D-18): the
     * result is Unit; callers re-read [current].
     */
    suspend fun confirm(uploadId: String): ApiResult<Unit>
}

class DefaultSignatureRepository(private val api: ApiClient) : SignatureRepository {
    override suspend fun current(): ApiResult<SignatureImages> =
        api.send(ApiRequest(HttpMethod.GET, "/users/me/signature"), SignatureImagesResponse.serializer()).map {
            SignatureImages(originalUrl = it.signatureOriginalImageUrl, thumbnailUrl = it.signatureThumbnailImageUrl)
        }

    override suspend fun requestUpload(): ApiResult<SignatureUpload> =
        api.send(ApiRequest(HttpMethod.POST, "/users/me/signature/uploads"), SignatureUploadResponse.serializer()).map {
            SignatureUpload(uploadId = it.uploadId, uploadUrl = it.uploadUrl)
        }

    override suspend fun confirm(uploadId: String): ApiResult<Unit> {
        val body = ApiJson.instance.encodeToString(SignatureConfirmRequest.serializer(), SignatureConfirmRequest(uploadId))
        return api.send(ApiRequest(HttpMethod.PUT, "/users/me/signature", jsonBody = body), SignatureImagesResponse.serializer())
            .map { }
    }
}

private inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> =
    when (this) {
        is ApiResult.Success -> ApiResult.Success(transform(value))
        is ApiResult.Failure -> this
    }
