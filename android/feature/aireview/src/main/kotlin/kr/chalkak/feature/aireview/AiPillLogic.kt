package kr.chalkak.feature.aireview

import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.AiReviewStatus

/** What the holder knows besides the last server answer. */
internal enum class AiGate {
    /** Nothing pending; the pill follows the review. */
    Idle,

    /** A GET is open (shown as "checking" only while there is no review yet). */
    Checking,

    /** The first GET failed (REQ-AIR-016). */
    CheckFailed,

    /** GET / POST answered 404: no pill, no more calls (REQ-AIR-005). */
    Gone,
}

internal object AiPillLogic {
    fun pill(
        hasTarget: Boolean,
        gate: AiGate,
        requesting: Boolean,
        review: AiReview?,
        isToday: Boolean,
    ): AiPill = when {
        !hasTarget || gate == AiGate.Gone -> AiPill.Hidden
        requesting -> AiPill.Requesting
        review == null -> unknownPill(gate)
        else -> reviewPill(review, isToday)
    }

    /** REQ-AIR-003/013: a new analysis or re-request is possible only for today's topic and a request-able status. */
    fun requestAllowed(review: AiReview?, isToday: Boolean): Boolean = isToday && when (review?.status) {
        AiReviewStatus.NONE -> true
        AiReviewStatus.FAILED -> review.canRequestAgain
        else -> false
    }

    /** Reason on the failure sheet; null when the spec names none (re-requestable FAILED opened by a push). */
    fun failureReason(review: AiReview, isToday: Boolean): String? = when {
        !review.canRequestAgain -> "ai.failed.no-more"
        !isToday -> "ai.failed.past"
        else -> null
    }

    private fun unknownPill(gate: AiGate) = when (gate) {
        AiGate.Checking -> AiPill.Checking
        AiGate.CheckFailed -> AiPill.Recheck
        else -> AiPill.Hidden
    }

    private fun reviewPill(review: AiReview, isToday: Boolean): AiPill = when (review.status) {
        AiReviewStatus.NONE -> if (isToday) AiPill.Request else AiPill.Hidden
        AiReviewStatus.PROCESSING -> AiPill.Processing
        AiReviewStatus.COMPLETED -> AiPill.View
        AiReviewStatus.FAILED -> if (requestAllowed(review, isToday)) AiPill.Retry else AiPill.Failed
    }
}
