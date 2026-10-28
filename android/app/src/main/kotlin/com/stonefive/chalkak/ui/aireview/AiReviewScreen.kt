package com.stonefive.chalkak.ui.aireview

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.aireview.AiReviewUiState

/** User events of the AI feedback area; [AiReviewRoute] maps each to the matching `AiReviewStateHolder` method. */
data class AiReviewCallbacks(
    /** Pill tap (`holder.onPillClicked()`); also the "재요청" button of the failure sheet (pill is Retry, the holder swaps the sheet). */
    val onPillClick: () -> Unit = {},
    /** Start sheet "분석 시작하기" -> `holder.onStartConfirmed()`. */
    val onStartConfirm: () -> Unit = {},
    /** Any sheet closed without an action (close button, failure "확인", system back) -> `holder.onSheetDismissed()`. */
    val onSheetDismiss: () -> Unit = {},
    val onCriteriaHelpClick: () -> Unit = {},
    val onCriteriaHelpDismiss: () -> Unit = {},
    /** `ToastLayer` expiry of the toast with this id -> `holder.onToastShown(id)`. */
    val onToastExpired: (id: Long) -> Unit = {},
)

/**
 * Stateless AI feedback area of the post detail: the pill (testids `feed.ai-*`), the persistent notice line (`feed.ai-message`),
 * and, as overlays, the start / result / failure sheets, the criteria dialog and the toast. Draws nothing for `AiPill.Hidden`
 * without a sheet or toast.
 */
@Composable
fun AiReviewSection(
    state: AiReviewUiState,
    callbacks: AiReviewCallbacks,
    modifier: Modifier = Modifier,
) {
    TODO("A6: implement the AI review section")
}
