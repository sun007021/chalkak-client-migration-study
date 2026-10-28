package kr.chalkak.feature.aireview

import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.AiReviewResult
import java.time.LocalDate
import java.util.Locale

/**
 * The post an [AiReviewStateHolder] serves. The HOST (feed detail now, home card later) creates it once the post is
 * known to be mine and passes it with `setTarget`; `null` means "no AI feedback here" (someone else's post, a guest, the
 * detail not loaded yet). [topicDate] is the detail's `topic.topicDate` (REQ-AIR-003).
 */
data class AiReviewTarget(val postId: String, val topicDate: LocalDate)

/** What the pill / card shows. [copyKey] is the `ai.pill.*` key; [enabled] false = shown but not tappable. */
enum class AiPill(val copyKey: String?, val enabled: Boolean) {
    Hidden(null, false),
    Checking("ai.pill.checking", false),
    Recheck("ai.pill.recheck", true),
    Request("ai.pill.request", true),
    Requesting("ai.pill.requesting", false),
    Processing("ai.pill.processing", false),
    View("ai.pill.view", true),
    Retry("ai.pill.retry", true),
    Failed("ai.pill.failed", true),
}

/** Message shown once. [id] is unique per occurrence; exactly one of [copyKey] / [serverMessage] is set (D-02, D-20). */
data class AiToast(val id: Long, val copyKey: String?, val serverMessage: String?)

/** Sheets the pill can open. At most one is open. */
sealed interface AiSheet {
    /** Start sheet ("분석 시작하기"); [retry] switches the title to the re-request wording. */
    data class Start(val retry: Boolean) : AiSheet {
        val titleCopyKey: String get() = if (retry) "ai.start.title-retry" else "ai.start.title"
        val lineCopyKeys: List<String> get() = listOf("ai.start.line1", "ai.start.line2", "ai.start.line3")
        val confirmCopyKey: String get() = "ai.start.confirm"
    }

    data class Result(val content: AiResultUi) : AiSheet

    /** Failure sheet. [reasonCopyKey] is `ai.failed.no-more` / `ai.failed.past`, or null when the spec names no reason. */
    data class Failed(val reasonCopyKey: String?) : AiSheet {
        val titleCopyKey: String get() = "ai.failed.title"
        val confirmCopyKey: String get() = "ai.failed.confirm"
    }
}

data class AiCriterionRow(val label: String, val scoreText: String)

/** One text section of the result sheet; [titleCopyKey] is `ai.result.strength|weakness|suggestion`. */
data class AiSection(val titleCopyKey: String, val body: String)

/** Everything the result sheet draws, in display order (REQ-AIR-037..040). Scores are the server's, never recomputed. */
data class AiResultUi(
    val summary: String,
    val scoreText: String,
    val criteria: List<AiCriterionRow>,
    val showPerspectiveBadge: Boolean,
    val sections: List<AiSection>,
) {
    /** `ai.result.score-a11y` with `{X}` replaced by [scoreText]. */
    val scoreA11yCopyKey: String get() = "ai.result.score-a11y"

    companion object {
        fun from(result: AiReviewResult): AiResultUi = AiResultUi(
            summary = result.feedback.summary,
            scoreText = AiScoreFormat.format(result.overallScore),
            criteria = result.criteria.map { AiCriterionRow(it.label, AiScoreFormat.format(it.score)) },
            showPerspectiveBadge = result.distinctivePerspective,
            sections = listOf(
                AiSection("ai.result.strength", result.feedback.strength),
                AiSection("ai.result.weakness", result.feedback.weakness),
                AiSection("ai.result.suggestion", result.feedback.suggestion),
            ),
        )
    }
}

/** Score as shown: one decimal, locale independent (7.5 -> "7.5", 10 -> "10.0", 0 -> "0.0"; spec "확인 필요" 3, [추정]). */
object AiScoreFormat {
    fun format(score: Double): String = String.format(Locale.ROOT, "%.1f", score)
}

data class AiReviewUiState(
    val pill: AiPill,
    val sheet: AiSheet?,
    /** The "기준 설명" dialog (`ai.result.criteria-dialog-title`) is open on top of the result sheet. */
    val criteriaDialogOpen: Boolean,
    /** Persistent line under the pill: `ai.poll.timeout` after the polling window ended, else null. */
    val noticeCopyKey: String?,
    val toast: AiToast?,
    /** Last server answer for the current target, null before the first one (or after a target / user change). */
    val review: AiReview?,
)

sealed interface AiReviewEffect {
    /** 401 `REAUTHENTICATION_REQUIRED` from any call: the host sends the user to login (D-17). */
    data object LoginRequired : AiReviewEffect
}
