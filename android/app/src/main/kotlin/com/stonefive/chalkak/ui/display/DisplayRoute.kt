package com.stonefive.chalkak.ui.display

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import java.time.LocalDate
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.feature.display.DisplayEffect
import kr.chalkak.feature.display.DisplayStateHolder

/**
 * Collects [holder] state; calls `onScreenShown()` when it enters and `onScreenHidden()` when it leaves (not on rotation, see
 * `ScreenGoneEffect`); forwards [DisplayCallbacks] to the holder; `DisplayEffect.OpenFeed` -> [onOpenFeed]; a non-null
 * [requestedDate] (`NavigationController.consumeDisplayDateRequest()`) opens that date (`holder.onDateSelected`).
 */
@Composable
fun DisplayRoute(
    holder: DisplayStateHolder,
    remoteImage: RemoteImage,
    onOpenFeed: (PostSummary) -> Unit,
    modifier: Modifier = Modifier,
    requestedDate: LocalDate? = null,
) {
    val state by holder.state.collectAsState()
    val openFeed by rememberUpdatedState(onOpenFeed)
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is DisplayEffect.OpenFeed -> openFeed(effect.post)
            }
        }
    }
    LaunchedEffect(holder) { holder.onScreenShown() }
    ScreenGoneEffect(holder) { holder.onScreenHidden() }
    LaunchedEffect(holder, requestedDate) { requestedDate?.let(holder::onDateSelected) }

    val callbacks = remember(holder) {
        DisplayCallbacks(
            onPreviousDate = holder::onPreviousDate,
            onNextDate = holder::onNextDate,
            onDateSelected = holder::onDateSelected,
            onSortSelected = holder::onSortSelected,
            onReachedEnd = holder::onReachedEnd,
            onRetry = holder::onRetry,
            onPhotoClick = holder::onPhotoClicked,
            onLikeClick = holder::onLikeClicked,
            onFeaturedPageChanged = holder::onFeaturedPageChanged,
            onToastExpired = holder::onToastShown,
        )
    }
    DisplayScreen(state, callbacks, remoteImage, modifier)
}
