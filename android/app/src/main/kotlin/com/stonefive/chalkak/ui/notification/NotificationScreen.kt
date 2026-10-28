package com.stonefive.chalkak.ui.notification

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import kr.chalkak.feature.notification.InboxUiState
import kr.chalkak.feature.notification.NavCommand
import kr.chalkak.feature.notification.NotificationInboxStateHolder

/** Events of the inbox list screen (testids.md `notifications.*`). */
class NotificationCallbacks(
    val onBack: () -> Unit,
    /** Tap on `notifications.item-{id}`. */
    val onRowClick: (id: String) -> Unit,
    /** Index of the last visible row; sent on every scroll change. */
    val onScrolledTo: (lastVisibleIndex: Int) -> Unit,
    val onRefresh: () -> Unit,
    val onRetry: () -> Unit,
)

/** STUB (A8 test step): the implementer draws the inbox. Stateless: everything comes from [state]. */
@Composable
fun NotificationScreen(
    state: InboxUiState,
    callbacks: NotificationCallbacks,
    image: RemoteImage,
    modifier: Modifier = Modifier,
) {
}

/**
 * STUB (A8 test step). Connects [NotificationScreen] to [holder]: `holder.onShown()` on enter, `holder.onScreenGone()` on leave
 * (not on rotation), effects: `Toast` -> [showToast] with the copy text, `Navigate` -> [onNavigate], `RequireLogin` -> [onRequireLogin].
 */
@Composable
fun NotificationRoute(
    holder: NotificationInboxStateHolder,
    image: RemoteImage,
    showToast: (String) -> Unit,
    onNavigate: (NavCommand) -> Unit,
    onRequireLogin: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
}
