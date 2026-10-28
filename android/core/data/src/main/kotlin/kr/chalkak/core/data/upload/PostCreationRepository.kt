package kr.chalkak.core.data.upload

import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod

/**
 * Upload policy + post creation (UPL). Results are [ApiResult]; the repository only maps wire data and validates the
 * contract, it never decides UI copy (D-02). Retry / refresh is done by [ApiClient].
 */
interface PostCreationRepository {
    /**
     * `POST /posts/uploads` (no body, Bearer). Idempotent: ApiClient retries 5xx / network twice (D-21).
     * A response with a missing field or a blank id / url is `Failure(InvalidResponse)` (TC-UPL-026).
     * `contentType` and `maxBytes` are returned as sent (TC-UPL-024, TC-UPL-025).
     */
    suspend fun requestUpload(): ApiResult<UploadPolicy>

    /**
     * `POST /posts` with `{topicId, photoUploadId, title}` (title omitted/null when absent) and Bearer. Never retried
     * automatically (D-21). A 201 whose `moderationStatus` is not VALIDATING / PENDING (unknown, missing, APPROVED...) is
     * `Failure(InvalidResponse)` (REQ-UPL-046, TC-UPL-061). [title] is sent exactly as given (the caller already trimmed it).
     */
    suspend fun create(topicId: String, uploadId: String, title: String?): ApiResult<CreatedPost>
}

class DefaultPostCreationRepository(private val api: ApiClient) : PostCreationRepository {
    override suspend fun requestUpload(): ApiResult<UploadPolicy> =
        api.send(ApiRequest(HttpMethod.POST, "/posts/uploads"), UploadPolicyResponse.serializer()).mapValidated { r ->
            when {
                r.uploadId.isBlank() -> Problem("blank uploadId")
                r.uploadUrl.isBlank() -> Problem("blank uploadUrl")
                else -> Ok(UploadPolicy(r.uploadId, r.uploadUrl, r.expiresInSeconds, r.contentType, r.maxBytes))
            }
        }

    override suspend fun create(topicId: String, uploadId: String, title: String?): ApiResult<CreatedPost> {
        val body = ApiJson.instance.encodeToString(CreatePostRequest.serializer(), CreatePostRequest(topicId, uploadId, title))
        return api.send(ApiRequest(HttpMethod.POST, "/posts", jsonBody = body), CreatePostResponse.serializer()).mapValidated { r ->
            when (val status = creationStatus(r.moderationStatus)) {
                null -> Problem("moderationStatus is not VALIDATING or PENDING")
                else -> Ok(CreatedPost(r.postId, status))
            }
        }
    }

    private fun creationStatus(wire: String): ModerationStatus? = when (wire) {
        "VALIDATING" -> ModerationStatus.VALIDATING
        "PENDING" -> ModerationStatus.PENDING
        else -> null
    }

    private sealed interface Check<out R>
    private class Ok<R>(val value: R) : Check<R>
    private class Problem(val reason: String) : Check<Nothing>

    private inline fun <T, R> ApiResult<T>.mapValidated(check: (T) -> Check<R>): ApiResult<R> = when (this) {
        is ApiResult.Failure -> this
        is ApiResult.Success -> when (val c = check(value)) {
            is Ok -> ApiResult.Success(c.value)
            is Problem -> ApiResult.Failure(ApiError.InvalidResponse(c.reason))
        }
    }
}
