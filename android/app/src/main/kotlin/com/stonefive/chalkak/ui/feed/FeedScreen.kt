@file:Suppress("UNUSED_PARAMETER", "unused")

package com.stonefive.chalkak.ui.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import kr.chalkak.feature.display.FeedStateHolder
import kr.chalkak.feature.display.FeedUiState

/** User events of the post detail; [FeedRoute] maps each to the matching `FeedStateHolder` method. */
data class FeedCallbacks(
    val onBack: () -> Unit = {},
    val onLikeClick: () -> Unit = {},
    val onEditClick: () -> Unit = {},
    val onTitleInput: (String) -> Unit = {},
    val onEditCancel: () -> Unit = {},
    val onSaveClick: () -> Unit = {},
    val onDeleteClick: () -> Unit = {},
    val onDeleteCancel: () -> Unit = {},
    val onDeleteConfirm: () -> Unit = {},
    val onRetry: () -> Unit = {},
    /** `ToastLayer` expiry of the toast with this id -> `holder.onToastShown(id)`. */
    val onToastExpired: (id: Long) -> Unit = {},
)

/** STUB (TDD step 1): draws nothing. See the tests in `ui/feed` for the contract. */
@Composable
fun FeedScreen(
    state: FeedUiState,
    callbacks: FeedCallbacks,
    remoteImage: RemoteImage,
    modifier: Modifier = Modifier,
) {
    Box(modifier)
}

/**
 * STUB (TDD step 1). Collects [holder] state; `onScreenShown()` on enter, `onScreenHidden()` on leave (and `onCleared()`
 * when the route is removed); forwards [FeedCallbacks]; effects: `Deleted` -> [onDeleted], `Closed` -> [onClosed],
 * `LoginRequired` -> [onLoginRequired]; back -> [onBack].
 */
@Composable
fun FeedRoute(
    holder: FeedStateHolder,
    remoteImage: RemoteImage,
    onBack: () -> Unit,
    onDeleted: (postId: String, toastCopyKey: String) -> Unit,
    onClosed: (postId: String) -> Unit,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier)
}
