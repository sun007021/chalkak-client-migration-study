package com.stonefive.chalkak.ui.notification

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.stonefive.chalkak.ui.common.RemoteImage
import kr.chalkak.feature.notification.DetailUiState
import kr.chalkak.feature.notification.NotificationDetailStateHolder

/** Events of the notification detail screen (testids.md `notification-detail.*`). */
class NotificationDetailCallbacks(
    val onBack: () -> Unit,
    val onRetry: () -> Unit,
    /** "알림함으로" button. */
    val onToInbox: () -> Unit,
)

/** STUB (A8 test step): the implementer draws the detail. Stateless. */
@Composable
fun NotificationDetailScreen(
    state: DetailUiState,
    callbacks: NotificationDetailCallbacks,
    image: RemoteImage,
    modifier: Modifier = Modifier,
) {
}

/**
 * STUB (A8 test step). `holder.onShown(notificationId)` on enter, `holder.onScreenGone()` on leave (not on rotation).
 * Effects: `Toast` -> [showToast] (copy text), `InvalidateInbox` -> [onInvalidateInbox], `OpenInbox` -> [onOpenInbox],
 * `Close` -> [onClose], `RequireLogin` -> [onRequireLogin]. Back button and "알림함으로" go through the holder
 * (`onToInboxClicked(inboxIsBelow)`); the back button itself calls [onClose].
 */
@Composable
fun NotificationDetailRoute(
    holder: NotificationDetailStateHolder,
    notificationId: String,
    inboxIsBelow: Boolean,
    image: RemoteImage,
    showToast: (String) -> Unit,
    onClose: () -> Unit,
    onOpenInbox: () -> Unit,
    onInvalidateInbox: () -> Unit,
    onRequireLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
}
