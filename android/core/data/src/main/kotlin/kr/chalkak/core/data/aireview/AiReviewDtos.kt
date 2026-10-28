package kr.chalkak.core.data.aireview

import kotlinx.serialization.Serializable
import java.time.Instant

/** Server `status` of an AI review. Anything else is an invalid response (TC-AIR-007). */
enum class AiReviewStatus { NONE, PROCESSING, COMPLETED, FAILED }

/** Wire body shared by `GET` and `POST /posts/{id}/ai-review`. [status] stays a string so an unknown value is mapped, not thrown. */
@Serializable
data class AiReviewResponse(
    val status: String,
    val requestedAt: String? = null,
    val completedAt: String? = null,
    val result: AiReviewResultResponse? = null,
    /** A missing field means `false` (REQ-AIR-033, TC-AIR-006). */
    val canRequestAgain: Boolean = false,
)

@Serializable
data class AiReviewResultResponse(
    val overallScore: Double,
    val criteria: List<AiCriterionResponse> = emptyList(),
    val distinctivePerspective: Boolean = false,
    val feedback: AiFeedbackResponse,
)

@Serializable
data class AiCriterionResponse(val key: String, val label: String, val score: Double)

@Serializable
data class AiFeedbackResponse(val summary: String, val strength: String, val weakness: String, val suggestion: String)

data class AiCriterion(val key: String, val label: String, val score: Double)

data class AiFeedback(val summary: String, val strength: String, val weakness: String, val suggestion: String)

data class AiReviewResult(
    val overallScore: Double,
    val criteria: List<AiCriterion>,
    val distinctivePerspective: Boolean,
    val feedback: AiFeedback,
)

/**
 * Validated domain view of the response. Invariants (enforced by the repository, REQ-AIR-042/043/045):
 * `result != null` exactly when `status == COMPLETED`; scores are within 0.0..10.0.
 * [requestedAt] is informational only: the polling window never uses it (REQ-AIR-026).
 */
data class AiReview(
    val status: AiReviewStatus,
    val requestedAt: Instant?,
    val completedAt: Instant?,
    val result: AiReviewResult?,
    val canRequestAgain: Boolean,
)
