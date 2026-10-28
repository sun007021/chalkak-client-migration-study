package com.stonefive.chalkak.ui.notification

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.stonefive.chalkak.copy.LocalCopy
import com.stonefive.chalkak.ui.common.RemoteImage
import com.stonefive.chalkak.ui.components.BackAction
import com.stonefive.chalkak.ui.components.Loading
import com.stonefive.chalkak.ui.components.ScreenGoneEffect
import com.stonefive.chalkak.ui.components.TopBar
import com.stonefive.chalkak.ui.theme.ChalkakTheme
import kotlinx.coroutines.flow.distinctUntilChanged
import kr.chalkak.feature.notification.InboxEffect
import kr.chalkak.feature.notification.InboxPhase
import kr.chalkak.feature.notification.InboxRow
import kr.chalkak.feature.notification.InboxUiState
import kr.chalkak.feature.notification.NavCommand
import kr.chalkak.feature.notification.NotiCopyKeys
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

private val ScreenPadding = 16.dp
private val ThumbnailSize = 48.dp

/**
 * Stateless inbox (testids.md "알림", TC-NOTI-*). Everything comes from [state]; taps and scroll positions go out through [callbacks].
 * Elements that tests look up by id never sit under a clickable parent (it would merge them away): a row is a tap target that
 * does not merge its children.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationScreen(
    state: InboxUiState,
    callbacks: NotificationCallbacks,
    image: RemoteImage,
    modifier: Modifier = Modifier,
) {
    val copy = LocalCopy.current
    val colors = ChalkakTheme.colors
    Column(modifier.fillMaxSize().background(colors.background).testTag("notifications.root")) {
        TopBar {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BackAction(callbacks.onBack, Modifier.testTag("notifications.back-button").semantics { contentDescription = copy["common.close"] })
                Text(
                    text = copy[NotiCopyKeys.INBOX_TITLE],
                    style = MaterialTheme.typography.titleMedium,
                    color = colors.textPrimary,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }
        when (state.phase) {
            InboxPhase.Loading -> Centered {
                Loading()
                Text(
                    text = copy[NotiCopyKeys.INBOX_LOADING],
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textNeutral,
                    modifier = Modifier.padding(top = 12.dp).testTag("notifications.loading"),
                )
            }
            InboxPhase.Empty -> Centered(Modifier.testTag("notifications.empty-state")) {
                Text(copy[NotiCopyKeys.INBOX_EMPTY_TITLE], style = MaterialTheme.typography.titleMedium, color = colors.textPrimary, textAlign = TextAlign.Center)
                Text(
                    copy[NotiCopyKeys.INBOX_EMPTY_BODY],
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.textNeutral,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            InboxPhase.Error -> Centered(Modifier.testTag("notifications.error-state")) {
                Text(
                    copy[state.errorCopyKey ?: NotiCopyKeys.INBOX_ERROR],
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
                        .testTag("notifications.retry-button")
                        .tapTarget(callbacks.onRetry)
                        .heightIn(min = 48.dp)
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                )
            }
            InboxPhase.Content -> InboxList(state, callbacks, image)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InboxList(state: InboxUiState, callbacks: NotificationCallbacks, image: RemoteImage) {
    val pullState = rememberPullToRefreshState()
    val listState = rememberLazyListState()
    ReportLastVisibleRow(listState, state.rows.size, callbacks.onScrolledTo)
    PullToRefreshBox(
        isRefreshing = state.refreshing,
        onRefresh = callbacks.onRefresh,
        modifier = Modifier.fillMaxSize(),
        state = pullState,
        indicator = {
            if (state.refreshing) {
                Box(Modifier.align(Alignment.TopCenter).padding(top = 12.dp).testTag("notifications.refresh-indicator")) { Loading() }
            } else {
                PullToRefreshDefaults.Indicator(state = pullState, isRefreshing = false, modifier = Modifier.align(Alignment.TopCenter))
            }
        },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().testTag("notifications.list"),
            contentPadding = PaddingValues(bottom = 24.dp),
        ) {
            itemsIndexed(state.rows, key = { _, row -> row.id }) { index, row ->
                InboxItem(row, callbacks.onRowClick, image)
                if (index < state.rows.lastIndex) HorizontalDivider(Modifier.padding(horizontal = ScreenPadding), color = ChalkakTheme.colors.border)
            }
            if (state.loadingMore) {
                item(key = "load-more") {
                    Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                        Loading(Modifier.testTag("notifications.load-more-indicator"))
                    }
                }
            }
        }
    }
}

/** Reports the index of the last visible row (the load-more indicator row does not count) whenever it changes. */
@Composable
private fun ReportLastVisibleRow(listState: LazyListState, rowCount: Int, report: (Int) -> Unit) {
    val latestReport by rememberUpdatedState(report)
    LaunchedEffect(listState, rowCount) {
        if (rowCount == 0) return@LaunchedEffect
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull { it.index < rowCount }?.index }
            .distinctUntilChanged()
            .collect { index -> if (index != null) latestReport(index) }
    }
}

@Composable
private fun InboxItem(row: InboxRow, onClick: (String) -> Unit, image: RemoteImage) {
    val colors = ChalkakTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("notifications.item-${row.id}")
            .tapTarget { onClick(row.id) }
            .heightIn(min = 48.dp)
            .padding(horizontal = ScreenPadding, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        image(
            row.thumbnailImageUrl,
            Modifier.size(ThumbnailSize).clip(RoundedCornerShape(10.dp)).testTag("notifications.item-thumbnail-${row.id}"),
        )
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(0.dp)) {
            Text(
                text = row.title,
                style = MaterialTheme.typography.titleSmall,
                color = colors.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.testTag("notifications.item-title-${row.id}"),
            )
            Text(
                text = row.body,
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textNeutral,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.testTag("notifications.item-body-${row.id}"),
            )
            Text(
                text = row.timeText,
                style = MaterialTheme.typography.bodySmall,
                color = colors.textInactive,
                modifier = Modifier.testTag("notifications.item-time-${row.id}"),
            )
        }
        if (row.unread) {
            Box(
                Modifier
                    .padding(start = 8.dp)
                    .size(8.dp)
                    .background(colors.destructive, CircleShape)
                    .testTag("notifications.item-unread-${row.id}"),
            )
        }
    }
}

@Composable
private fun Centered(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) { content() }
}

/** Tap target without merging its descendants into one node (so tagged children stay addressable). */
@Composable
internal fun Modifier.tapTarget(onClick: () -> Unit): Modifier {
    val latest by rememberUpdatedState(onClick)
    return this
        .pointerInput(Unit) { detectTapGestures { latest() } }
        .semantics {
            role = Role.Button
            onClick { latest(); true }
        }
}

/**
 * Connects [NotificationScreen] to [holder]: `holder.onShown()` on enter, `holder.onScreenGone()` on leave (not on rotation), effects:
 * `Toast` -> [showToast] with the copy text, `Navigate` -> [onNavigate], `RequireLogin` -> [onRequireLogin].
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
    val copy = LocalCopy.current
    val state by holder.state.collectAsState()
    val latestToast by rememberUpdatedState(showToast)
    val latestNavigate by rememberUpdatedState(onNavigate)
    val latestLogin by rememberUpdatedState(onRequireLogin)
    LaunchedEffect(holder) { holder.onShown() }
    ScreenGoneEffect(holder) { holder.onScreenGone() }
    LaunchedEffect(holder) {
        holder.effects.collect { effect ->
            when (effect) {
                is InboxEffect.Toast -> latestToast(copy[effect.copyKey])
                is InboxEffect.Navigate -> latestNavigate(effect.command)
                InboxEffect.RequireLogin -> latestLogin()
            }
        }
    }
    val callbacks = remember(holder, onBack) {
        NotificationCallbacks(
            onBack = onBack,
            onRowClick = holder::onRowClicked,
            onScrolledTo = holder::onScrolledTo,
            onRefresh = holder::onPullToRefresh,
            onRetry = holder::onRetry,
        )
    }
    NotificationScreen(state, callbacks, image, modifier)
}
