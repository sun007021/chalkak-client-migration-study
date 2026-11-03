package com.stonefive.chalkak.ui.aireview

import androidx.activity.compose.BackHandler
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import kr.chalkak.feature.aireview.AiReviewEffect
import kr.chalkak.feature.aireview.AiReviewStateHolder
import kr.chalkak.feature.aireview.AiReviewTarget

/**
 * Collects [holder] state and draws [AiReviewSection]. Order on enter: `holder.setTarget(target)` first (re-sent whenever [target]
 * changes, also null), THEN `holder.onScreenShown()`. On leave: `onScreenHidden()`, plus `onCleared()` when [finishOnLeave].
 * The `LoginRequired` effect calls [onLoginRequired]. System back closes the criteria dialog first, then an open sheet.
 * [layout] places the pill and the overlay (see [AiLayout]).
 */
@Composable
fun AiReviewRoute(
    holder: AiReviewStateHolder,
    target: AiReviewTarget?,
    onLoginRequired: () -> Unit,
    modifier: Modifier = Modifier,
    finishOnLeave: Boolean = true,
    layout: AiLayout = AiStackedLayout,
) {
    val state by holder.state.collectAsState()
    val login by rememberUpdatedState(onLoginRequired)
    val latestTarget by rememberUpdatedState(target)
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                AiReviewEffect.LoginRequired -> login()
            }
        }
    }
    // Synchronous, in this order: the target must be known before the screen counts as shown, or the first GET would be skipped.
    DisposableEffect(holder) {
        holder.setTarget(latestTarget)
        holder.onScreenShown()
        onDispose { }
    }
    LaunchedEffect(holder, target) { holder.setTarget(target) }
    BackgroundEffect(holder)
    ScreenGoneEffect(holder) {
        holder.onScreenHidden()
        if (finishOnLeave) holder.onCleared()
    }
    BackHandler(enabled = state.criteriaDialogOpen) { holder.onCriteriaHelpDismissed() }
    BackHandler(enabled = state.sheet != null && !state.criteriaDialogOpen) { holder.onSheetDismissed() }

    val callbacks = remember(holder) {
        AiReviewCallbacks(
            onPillClick = holder::onPillClicked,
            onStartConfirm = holder::onStartConfirmed,
            onSheetDismiss = holder::onSheetDismissed,
            onCriteriaHelpClick = holder::onCriteriaHelpClicked,
            onCriteriaHelpDismiss = holder::onCriteriaHelpDismissed,
            onToastExpired = holder::onToastShown,
        )
    }
    AiReviewSection(state, callbacks, modifier, layout)
}

/**
 * The app going to the background counts as leaving (TC-AIR-042: polling stops, late answers are dropped) and coming back as
 * entering again (GET first, TC-AIR-061). Not for a recreation of the Activity (rotation): the holder's in-flight work goes on.
 */
@Composable
private fun BackgroundEffect(holder: AiReviewStateHolder) {
    val activity = LocalActivity.current
    val owner = activity as? LifecycleOwner ?: return
    DisposableEffect(holder, owner) {
        var stopped = false
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> if (activity?.isChangingConfigurations != true) {
                    stopped = true
                    holder.onScreenHidden()
                }
                Lifecycle.Event.ON_START -> if (stopped) {
                    stopped = false
                    holder.onScreenShown()
                }
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
}
