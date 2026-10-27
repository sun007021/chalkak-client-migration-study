package kr.chalkak.core.data.settings

import kr.chalkak.core.common.InstantParser
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.HttpMethod

interface FeedbackRepository {
    /**
     * `POST /feedbacks {content}` sent exactly as given (the caller trims and validates, REQ-FDBK-003..007).
     * Never retried (D-21), Bearer attached, 401 refresh handled by ApiClient. 201 -> receipt.
     */
    suspend fun send(content: String): ApiResult<FeedbackReceipt>
}

class DefaultFeedbackRepository(private val api: ApiClient) : FeedbackRepository {
    override suspend fun send(content: String): ApiResult<FeedbackReceipt> {
        val body = ApiJson.instance.encodeToString(FeedbackRequest.serializer(), FeedbackRequest(content))
        val request = ApiRequest(HttpMethod.POST, "/feedbacks", jsonBody = body)
        return when (val result = api.send(request, FeedbackCreatedResponse.serializer())) {
            is ApiResult.Success -> receiptOf(result.value)
            is ApiResult.Failure -> result
        }
    }

    private fun receiptOf(response: FeedbackCreatedResponse): ApiResult<FeedbackReceipt> {
        val createdAt = InstantParser.parse(response.createdAt)
            ?: return ApiResult.Failure(ApiError.InvalidResponse("bad createdAt"))
        return ApiResult.Success(FeedbackReceipt(response.feedbackId, createdAt))
    }
}
