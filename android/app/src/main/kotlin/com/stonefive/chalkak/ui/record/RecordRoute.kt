package com.stonefive.chalkak.ui.record

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
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import java.time.LocalDate
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.record.RecordEffect
import kr.chalkak.feature.record.RecordStateHolder

/**
 * Connects [RecordScreen] to its [RecordStateHolder]. Shown = `onShown(requestedDate)` once, left = `onScreenGone()`, app back in the
 * foreground = `onForeground()`. Effects: toasts via [showToast], feed / display / login requests to the host callbacks.
 * [today] is the KST date supplied by the app's clock (never read from the system here).
 */
@Composable
fun RecordRoute(
    holder: RecordStateHolder,
    image: RemoteImage,
    showToast: (String) -> Unit,
    onOpenFeed: (FeedEntry.FromRecord) -> Unit,
    onOpenDisplay: (LocalDate) -> Unit,
    onLoginRequired: () -> Unit,
    today: () -> LocalDate,
    modifier: Modifier = Modifier,
    requestedDate: LocalDate? = null,
) {
    val copy = LocalCopy.current
    val state by holder.state.collectAsState()
    val latestToast by rememberUpdatedState(showToast)
    val latestFeed by rememberUpdatedState(onOpenFeed)
    val latestDisplay by rememberUpdatedState(onOpenDisplay)
    val latestLogin by rememberUpdatedState(onLoginRequired)

    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is RecordEffect.ShowToast -> latestToast(copy[effect.copyKey])
                is RecordEffect.OpenFeed -> latestFeed(effect.entry)
                is RecordEffect.OpenDisplay -> latestDisplay(effect.topicDate)
                RecordEffect.LoginRequired -> latestLogin()
            }
        }
    }
    LaunchedEffect(holder) { holder.onShown(requestedDate) }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    ForegroundEffect(holder::onForeground)

    val callbacks = remember(holder) {
        RecordCallbacks(
            onPreviousMonth = holder::onPreviousMonth,
            onNextMonth = holder::onNextMonth,
            onMonthPicked = holder::onMonthPicked,
            onDateSelected = holder::onDateSelected,
            onPendingBadgeTapped = holder::onPendingBadgeTapped,
            onOpenFeed = holder::onOpenFeed,
            onOpenDisplay = holder::onOpenDisplay,
            onRetry = holder::onRetry,
            onLoginTapped = holder::onLoginTapped,
            onSaveImage = holder::onSaveImage,
        )
    }
    RecordScreen(state = state, callbacks = callbacks, image = image, today = today(), modifier = modifier)
}

/** Calls [onForeground] when the Activity comes back after having been paused (not for the resume that follows the first show). */
@Composable
private fun ForegroundEffect(onForeground: () -> Unit) {
    val owner = LocalActivity.current as? LifecycleOwner ?: return
    val latest by rememberUpdatedState(onForeground)
    DisposableEffect(owner) {
        var paused = false
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_PAUSE -> paused = true
                Lifecycle.Event.ON_RESUME -> if (paused) {
                    paused = false
                    latest()
                }
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
}
