package kr.chalkak.feature.aireview

import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.AiReviewStatus

/** Which sheet a review opens; pure so the holder only decides WHEN. */
internal object AiSheets {
    fun failed(review: AiReview, isToday: Boolean) = AiSheet.Failed(AiPillLogic.failureReason(review, isToday))

    fun result(review: AiReview): AiSheet? = review.result?.let { AiSheet.Result(AiResultUi.from(it)) }

    /** REQ-AIR-046: push entry opens the result (COMPLETED) or failure (FAILED) sheet; PROCESSING / NONE open nothing. */
    fun forEntry(review: AiReview, isToday: Boolean): AiSheet? = when (review.status) {
        AiReviewStatus.COMPLETED -> result(review)
        AiReviewStatus.FAILED -> failed(review, isToday)
        else -> null
    }
}

/** Toast ids and the "one failure message per polling run" rule (REQ-AIR-029). */
internal class AiToasts {
    private var seq = 0L
    private var shownInRun = false

    fun newRun() {
        shownInRun = false
    }

    /** A toast for a repeating failure (poll / re-check): null when this run already showed one. */
    fun once(copyKey: String): AiToast? = if (shownInRun) null else create(copyKey, null)

    fun create(copyKey: String?, serverMessage: String?): AiToast {
        shownInRun = true
        return AiToast(++seq, copyKey, serverMessage)
    }
}
