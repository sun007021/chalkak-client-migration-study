package com.stonefive.chalkak.ui.aireview

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import kr.chalkak.feature.aireview.AiReviewStateHolder
import kr.chalkak.feature.aireview.AiReviewTarget

/**
 * Collects [holder] state and draws [AiReviewSection]. Order on enter: `holder.setTarget(target)` first (re-sent whenever [target]
 * changes, also null), THEN `holder.onScreenShown()`. On leave: `onScreenHidden()`, plus `onCleared()` when [finishOnLeave].
 * The `LoginRequired` effect calls [onLoginRequired]. Sheets close on system back.
 */
@Composable
fun AiReviewRoute(
    holder: AiReviewStateHolder,
    target: AiReviewTarget?,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
    finishOnLeave: Boolean = true,
) {
    // A6 stub: no behaviour yet.
}
