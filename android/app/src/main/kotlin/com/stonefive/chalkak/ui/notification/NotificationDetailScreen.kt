package com.stonefive.chalkak.ui.notification

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.BackAction
import com.stonefive.chalkak.ui.components.ChalkakOutlinedButton
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.components.TopBar
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kr.chalkak.core.data.notification.NotificationDetail
import kr.chalkak.feature.notification.DetailEffect
import kr.chalkak.feature.notification.DetailPhase
import kr.chalkak.feature.notification.DetailUiState
import kr.chalkak.feature.notification.NotiCopyKeys
import kr.chalkak.feature.notification.NotificationDetailStateHolder

/** Events of the notification detail screen (testids.md `notification-detail.*`). */
class NotificationDetailCallbacks(
    val onBack: () -> Unit,
    val onRetry: () -> Unit,
    /** "알림함으로" button. */
    val onToInbox: () -> Unit,
)

private val ScreenPadding = 16.dp

/**
 * Stateless notification detail (testids.md "알림 상세", TC-NOTI-042..047). The photo, the rejection reason and the "알림함으로"
 * button exist only when [state] says so; there is never a "새로 올리기" button.
 */
@Composable
fun NotificationDetailScreen(
    state: DetailUiState,
    callbacks: NotificationDetailCallbacks,
    image: RemoteImage,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(modifier.fillMaxSize().background(colors.background).testTag("notification-detail.root")) {
        TopBar {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BackAction(callbacks.onBack, Modifier.testTag("notification-detail.back-button").semantics { contentDescription = copy["common.close"] })
                Text(
                    text = copy[NotiCopyKeys.DETAIL_TITLE],
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                    modifier = Modifier.padding(start = 4.dp).testTag("notification-detail.screen-title"),
                )
            }
        }
        val detail = state.detail
        when {
            state.phase == DetailPhase.Loading ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Loading(Modifier.testTag("notification-detail.loading")) }
            state.phase == DetailPhase.Gone ->
                Box(Modifier.fillMaxSize().padding(32.dp).testTag("notification-detail.not-found-state"), contentAlignment = Alignment.Center) {
                    Text(copy[NotiCopyKeys.GONE], style = MaterialTheme.typography.bodyLarge, color = colors.textPrimary, textAlign = TextAlign.Center)
                }
            state.phase == DetailPhase.Error || detail == null ->
                Column(
                    Modifier.fillMaxSize().padding(32.dp).testTag("notification-detail.error-state"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        copy[state.errorCopyKey ?: NotiCopyKeys.DETAIL_ERROR],
                        style = MaterialTheme.typography.bodyLarge,
                        color = colors.textPrimary,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = copy[NotiCopyKeys.INBOX_RETRY],
                        style = MaterialTheme.typography.titleSmall,
                        color = colors.textPrimary,
                        modifier = Modifier
                            .padding(top = 12.dp)
                            .testTag("notification-detail.retry-button")
                            .tapTarget(callbacks.onRetry)
                            .heightIn(min = 48.dp)
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                    )
                }
            else -> DetailContent(state, detail, callbacks, image)
        }
    }
}

@Composable
private fun DetailContent(state: DetailUiState, detail: NotificationDetail, callbacks: NotificationDetailCallbacks, image: RemoteImage) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(Modifier.fillMaxSize().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = ScreenPadding)) {
        Text(
            text = detail.title,
            style = MaterialTheme.typography.headlineSmall,
            color = colors.textPrimary,
            modifier = Modifier.padding(top = 8.dp).testTag("notification-detail.title"),
        )
        Text(
            text = detail.body,
            style = MaterialTheme.typography.bodyLarge,
            color = colors.textPrimary,
            modifier = Modifier.padding(top = 12.dp).testTag("notification-detail.body"),
        )
        if (state.showOriginalPhoto) {
            image(
                detail.originalImageUrl,
                Modifier
                    .padding(top = 16.dp)
                    .fillMaxWidth()
                    .height(PHOTO_HEIGHT)
                    .clip(RoundedCornerShape(14.dp))
                    .testTag("notification-detail.photo"),
            )
        }
        if (state.showRejectionReason && detail.rejectionReason != null) {
            Column(
                Modifier
                    .padding(top = 16.dp)
                    .fillMaxWidth()
                    .background(colors.inputBackground, RoundedCornerShape(14.dp))
                    .padding(16.dp)
                    .testTag("notification-detail.rejection-section"),
            ) {
                Text(copy[NotiCopyKeys.DETAIL_REASON], style = MaterialTheme.typography.titleSmall, color = colors.textPrimary)
                Text(
                    text = detail.rejectionReason!!,
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textNeutral,
                    modifier = Modifier.padding(top = 8.dp).testTag("notification-detail.rejection-reason"),
                )
            }
        }
        if (state.showToInboxButton) {
            ChalkakOutlinedButton(
                text = copy[NotiCopyKeys.DETAIL_TO_INBOX],
                onClick = callbacks.onToInbox,
                modifier = Modifier.padding(top = 20.dp).fillMaxWidth().testTag("notification-detail.back-to-inbox-button"),
            )
        }
        Spacer(Modifier.height(16.dp))
    }
}

private val PHOTO_HEIGHT = 120.dp

/**
 * `holder.onShown(notificationId)` on enter, `holder.onScreenGone()` on leave (not on rotation).
 * Effects: `Toast` -> [showToast] (copy text), `InvalidateInbox` -> [onInvalidateInbox], `OpenInbox` -> [onOpenInbox],
 * `Close` -> [onClose], `RequireLogin` -> [onRequireLogin]. "알림함으로" goes through the holder (`onToInboxClicked(inboxIsBelow)`);
 * the back button itself calls [onClose].
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
    val copy = LocalCopy.current
    val state by holder.state.collectAsState()
    val latestToast by rememberUpdatedState(showToast)
    val latestClose by rememberUpdatedState(onClose)
    val latestOpenInbox by rememberUpdatedState(onOpenInbox)
    val latestInvalidate by rememberUpdatedState(onInvalidateInbox)
    val latestLogin by rememberUpdatedState(onRequireLogin)
    val latestInboxBelow by rememberUpdatedState(inboxIsBelow)
    LaunchedEffect(holder, notificationId) { holder.onShown(notificationId) }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is DetailEffect.Toast -> latestToast(copy[effect.copyKey])
                DetailEffect.InvalidateInbox -> latestInvalidate()
                DetailEffect.OpenInbox -> latestOpenInbox()
                DetailEffect.Close -> latestClose()
                DetailEffect.RequireLogin -> latestLogin()
            }
        }
    }
    val callbacks = remember(holder) {
        NotificationDetailCallbacks(
            onBack = { latestClose() },
            onRetry = holder::onRetry,
            onToInbox = { holder.onToInboxClicked(latestInboxBelow) },
        )
    }
    NotificationDetailScreen(state, callbacks, image, modifier)
}
