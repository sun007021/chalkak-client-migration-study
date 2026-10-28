package com.stonefive.chalkak.ui.feed

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import kr.chalkak.feature.display.FeedEffect
import kr.chalkak.feature.aireview.AiReviewStateHolder
import kr.chalkak.feature.display.FeedStateHolder

/**
 * Collects [holder] state; `onScreenShown()` on enter, `onScreenHidden()` and `onCleared()` when the route leaves (not on
 * rotation: the holder survives it); forwards [FeedCallbacks]; effects: `Deleted` -> [onDeleted], `Closed` -> [onClosed],
 * `LoginRequired` -> [onLoginRequired]; back (button or system) -> [onBack]. The holder serves one post, so a route that
 * leaves is finished ([finishOnLeave], default). A host that composes only the top route (MainHost) passes `false` and calls
 * `holder.onCleared()` itself once the entry is popped, so a feed covered by another stacked screen keeps its like/title
 * subscriptions and just revalidates when it shows again.
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
    finishOnLeave: Boolean = true,
    /**
     * AI feedback holder of this post (null = no AI area). The target is `AiReviewTarget(postId, topicDate)` only for my post
     * whose detail is confirmed; otherwise null. Its lifecycle follows this route ([finishOnLeave] as for [holder]).
     */
    aiReview: AiReviewStateHolder? = null,
) {
    val state by holder.state.collectAsState()
    val back by rememberUpdatedState(onBack)
    val deleted by rememberUpdatedState(onDeleted)
    val closed by rememberUpdatedState(onClosed)
    val login by rememberUpdatedState(onLoginRequired)
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is FeedEffect.Deleted -> deleted(effect.postId, effect.toastCopyKey)
                is FeedEffect.Closed -> closed(effect.postId)
                FeedEffect.LoginRequired -> login()
            }
        }
    }
    LaunchedEffect(holder) { holder.onScreenShown() }
    ScreenGoneEffect(holder) {
        holder.onScreenHidden()
        if (finishOnLeave) holder.onCleared()
    }
    // Always registered: while a title save or a delete is running the dialogs ignore back, and it must not fall through to the
    // host's handler (which would pop this feed and finish the holder while the request is in flight).
    val blocked = state.deleting || state.edit?.saving == true
    BackHandler(enabled = state.edit == null && !state.deleteConfirmVisible || blocked) { if (!blocked) back() }

    val callbacks = remember(holder) {
        FeedCallbacks(
            onBack = { back() },
            onLikeClick = holder::onLikeClicked,
            onEditClick = holder::onEditClicked,
            onTitleInput = holder::onTitleInput,
            onEditCancel = holder::onEditCancelled,
            onSaveClick = holder::onSaveClicked,
            onDeleteClick = holder::onDeleteClicked,
            onDeleteCancel = holder::onDeleteCancelled,
            onDeleteConfirm = holder::onDeleteConfirmed,
            onRetry = holder::onRetry,
            onToastExpired = holder::onToastShown,
        )
    }
    FeedScreen(state, callbacks, remoteImage, modifier)
}
