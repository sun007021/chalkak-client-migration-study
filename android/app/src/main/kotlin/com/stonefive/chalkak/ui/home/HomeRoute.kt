package com.stonefive.chalkak.ui.home

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.lazy.LazyListState
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
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.common.RemoteImage
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeEvent
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.feature.home.HomeEffect
import kr.chalkak.feature.home.HomeStateHolder

/**
 * Connects [HomeScreen] to its [HomeStateHolder] and to the shared like state. Shown = `onShown()` (the holder tells a first load from a
 * silent refresh), left = `onScreenGone()`, app back in the foreground = `onForeground()`. Effects go to [onEffect] (the host navigates);
 * like failures become toasts while home is the visible screen.
 */
@Composable
fun HomeRoute(
    holder: HomeStateHolder,
    likes: LikeController,
    postChanges: PostChanges,
    listState: LazyListState,
    image: RemoteImage,
    showToast: (String) -> Unit,
    onEffect: (HomeEffect) -> Unit,
    onWeekMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val holderState by holder.state.collectAsState()
    val likeStates by likes.states.collectAsState()
    val removed by postChanges.removed.collectAsState()
    val sync = remember(holder, likes) { HomeLikeSync(likes) }
    val shown = remember(holderState, likeStates, removed) { HomeLikeOverlay.apply(holderState, likeStates, removed) }
    val latestEffect by rememberUpdatedState(onEffect)
    val latestToast by rememberUpdatedState(showToast)

    LaunchedEffect(holder, sync) { holder.state.collect(sync::onState) }
    LaunchedEffect(holder) { holder.effects.collect { latestEffect(it) } }
    LaunchedEffect(likes) {
        likes.events.collect { event -> if (event is LikeEvent.Failed) latestToast(copy[event.failure.copyKey]) }
    }
    LaunchedEffect(holder, sync) {
        sync.markLoadStart()
        holder.onShown()
    }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    ForegroundEffect(holder::onForeground)

    val callbacks = remember(holder, sync, onWeekMore) {
        HomeCallbacks(
            onNotificationClick = holder::onNotificationClicked,
            onHeroClick = holder::onHeroClicked,
            onHeroRetry = { sync.markLoadStart(); holder.onRetryHero() },
            onWeekDayClick = holder::onWeekDayClicked,
            onWeekMoreClick = onWeekMore,
            onWeekRetry = { sync.markLoadStart(); holder.onRetryWeek() },
            onRankingPostClick = holder::onRankingPostClicked,
            onRankingMoreClick = holder::onRankingMoreClicked,
            onRankingRetry = { kind -> sync.markLoadStart(); holder.onRetryRanking(kind) },
            onLikeClick = holder::onLikeClicked,
            onBannerClick = holder::onBannerClicked,
            onBannerScrolled = holder::onBannerScrolled,
            onIssueRetry = holder::onRetryIssue,
            onRefresh = { sync.markLoadStart(); holder.onPullToRefresh() },
        )
    }
    HomeScreen(state = shown, callbacks = callbacks, modifier = modifier, listState = listState, image = image)
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
