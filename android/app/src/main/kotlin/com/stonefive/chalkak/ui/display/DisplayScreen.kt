@file:Suppress("UNUSED_PARAMETER", "unused")

package com.stonefive.chalkak.ui.display

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import java.time.LocalDate
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.feature.display.DisplayStateHolder
import kr.chalkak.feature.display.DisplayUiState

/** User events of the exhibition screen; [DisplayRoute] maps each to the matching `DisplayStateHolder` method. */
data class DisplayCallbacks(
    val onPreviousDate: () -> Unit = {},
    val onNextDate: () -> Unit = {},
    /** Date picker "confirm" (already combined into one date). */
    val onDateSelected: (LocalDate) -> Unit = {},
    val onSortSelected: (PostSort) -> Unit = {},
    /** The grid scrolled within the last 3 items. */
    val onReachedEnd: () -> Unit = {},
    val onRetry: () -> Unit = {},
    val onPhotoClick: (postId: String) -> Unit = {},
    val onLikeClick: (postId: String) -> Unit = {},
    val onFeaturedPageChanged: (index: Int) -> Unit = {},
    /** `ToastLayer` expiry (2.5 s) of the toast with this id -> `holder.onToastShown(id)`. */
    val onToastExpired: (id: Long) -> Unit = {},
)

/** STUB (TDD step 1): draws nothing. See the tests in `ui/display` for the contract. */
@Composable
fun DisplayScreen(
    state: DisplayUiState,
    callbacks: DisplayCallbacks,
    remoteImage: RemoteImage,
    modifier: Modifier = Modifier,
) {
    Box(modifier)
}

/**
 * STUB (TDD step 1). Collects [holder] state; calls `onScreenShown()` when it enters and `onScreenHidden()` when it leaves;
 * forwards [DisplayCallbacks] to the holder; `DisplayEffect.OpenFeed` -> [onOpenFeed]; a non-null [requestedDate]
 * (`NavigationController.consumeDisplayDateRequest()`) opens that date (`holder.onDateSelected`).
 */
@Composable
fun DisplayRoute(
    holder: DisplayStateHolder,
    remoteImage: RemoteImage,
    onOpenFeed: (PostSummary) -> Unit,
    modifier: Modifier = Modifier,
    requestedDate: LocalDate? = null,
) {
    Box(modifier)
}
