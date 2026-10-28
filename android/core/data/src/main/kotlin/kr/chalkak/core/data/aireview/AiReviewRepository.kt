package kr.chalkak.core.data.aireview

import kr.chalkak.core.common.InstantParser
import kr.chalkak.core.network.ApiClient
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiRequest
import kr.chalkak.core.network.HttpMethod
import kr.chalkak.core.network.ApiResult
import java.time.Instant

/**
 * AI review API. Both calls carry the Bearer token and no body; the repository maps and validates the wire data
 * and never decides UI copy (D-02). Results that break the contract are `Failure(InvalidResponse)`.
 */
interface AiReviewRepository {
    /** `GET /posts/{postId}/ai-review`. Idempotent: ApiClient retries 5xx/network twice and honours Retry-After (D-21). */
    suspend fun get(postId: String): ApiResult<AiReview>

    /**
     * `POST /posts/{postId}/ai-review`, no body, NEVER retried (D-21). 200 and 202 are both success; the outcome is
     * read from the body `status`, not the HTTP code (REQ-AIR-021, TC-AIR-008).
     */
    suspend fun request(postId: String): ApiResult<AiReview>
}

class DefaultAiReviewRepository(private val api: ApiClient) : AiReviewRepository {
    override suspend fun get(postId: String): ApiResult<AiReview> = call(HttpMethod.GET, postId)

    override suspend fun request(postId: String): ApiResult<AiReview> = call(HttpMethod.POST, postId)

    private suspend fun call(method: HttpMethod, postId: String): ApiResult<AiReview> =
        when (val result = api.send(ApiRequest(method, "/posts/$postId/ai-review"), AiReviewResponse.serializer())) {
            is ApiResult.Success -> AiReviewMapper.toDomain(result.value)
            is ApiResult.Failure -> result
        }
}

/** Wire -> domain with the contract checks of REQ-AIR-042/043/045. Pure, so the NaN / boundary cases need no HTTP. */
internal object AiReviewMapper {
    private val SCORE_RANGE = 0.0..10.0

    fun toDomain(response: AiReviewResponse): ApiResult<AiReview> {
        val status = AiReviewStatus.entries.firstOrNull { it.name == response.status }
            ?: return invalid("unknown status")
        if ((status == AiReviewStatus.COMPLETED) != (response.result != null)) return invalid("result does not match status")
        val result = response.result?.let { resultOf(it) ?: return invalid("result out of contract") }
        val requestedAt = parseTime(response.requestedAt) ?: return invalid("bad requestedAt")
        val completedAt = parseTime(response.completedAt) ?: return invalid("bad completedAt")
        return ApiResult.Success(AiReview(status, requestedAt.value, completedAt.value, result, response.canRequestAgain))
    }

    private class Parsed(val value: Instant?)

    /** null input is a valid absent time; unparsable text is a contract violation (returns null). */
    private fun parseTime(raw: String?): Parsed? {
        if (raw == null) return Parsed(null)
        return InstantParser.parse(raw)?.let { Parsed(it) }
    }

    private fun resultOf(r: AiReviewResultResponse): AiReviewResult? {
        val scores = listOf(r.overallScore) + r.criteria.map { it.score }
        if (scores.any { it.isNaN() || it !in SCORE_RANGE }) return null
        val f = r.feedback
        if (listOf(f.summary, f.strength, f.weakness, f.suggestion).any { it.isBlank() }) return null
        return AiReviewResult(
            r.overallScore,
            r.criteria.map { AiCriterion(it.key, it.label, it.score) },
            r.distinctivePerspective,
            AiFeedback(f.summary, f.strength, f.weakness, f.suggestion),
        )
    }

    private fun invalid(reason: String) = ApiResult.Failure(ApiError.InvalidResponse("ai-review: $reason"))
}
