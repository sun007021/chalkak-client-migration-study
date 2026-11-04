package com.stonefive.chalkak.ui.notification

import androidx.compose.foundation.background
import com.stonefive.chalkak.ui.components.ChalkakTopBar
import com.stonefive.chalkak.R
import androidx.compose.ui.res.painterResource
import androidx.compose.material3.Icon
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

private val ThumbnailSize = 44.dp

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
        ChalkakTopBar(
            title = copy[NotiCopyKeys.INBOX_TITLE],
            onBack = callbacks.onBack,
            backModifier = Modifier.testTag("notifications.back-button").semantics { contentDescription = copy["common.close"] },
        )
        when (state.phase) {
            InboxPhase.Loading -> Centered {
                Loading()
                Text(
                    text = copy[NotiCopyKeys.INBOX_LOADING],
                    style = ChalkakTheme.typography.subheadline,
                    color = colors.textSecondary,
                    modifier = Modifier.padding(top = ChalkakTheme.spacing.lg).testTag("notifications.loading"),
                )
            }
            InboxPhase.Empty -> Column(
                Modifier.fillMaxSize().padding(top = 144.dp, start = ChalkakTheme.spacing.screenHorizontal, end = ChalkakTheme.spacing.screenHorizontal).testTag("notifications.empty-state"),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.sm),
            ) {
                Icon(painterResource(R.drawable.ic_bell), contentDescription = null, tint = colors.iconSecondary, modifier = Modifier.size(34.dp))
                Text(copy[NotiCopyKeys.INBOX_EMPTY_TITLE], style = ChalkakTheme.typography.body, color = colors.textSecondary, textAlign = TextAlign.Center)
                Text(
                    copy[NotiCopyKeys.INBOX_EMPTY_BODY],
                    style = ChalkakTheme.typography.subheadline,
                    color = colors.textMuted,
                    textAlign = TextAlign.Center,
                )
            }
            InboxPhase.Error -> Centered(Modifier.testTag("notifications.error-state")) {
                Text(
                    copy[state.errorCopyKey ?: NotiCopyKeys.INBOX_ERROR],
                    style = ChalkakTheme.typography.body,
                    color = colors.textSecondary,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = copy[NotiCopyKeys.INBOX_RETRY],
                    style = ChalkakTheme.typography.body,
                    color = colors.actionPrimary,
                    modifier = Modifier
                        .padding(top = ChalkakTheme.spacing.md)
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
                if (index < state.rows.lastIndex) HorizontalDivider(Modifier.padding(horizontal = ChalkakTheme.spacing.screenHorizontal), thickness = 1.dp, color = ChalkakTheme.colors.border)
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

/** Row (screens-c 3.1.2): unread dot column (12 wide, 8 dot in `inputCursor`), text column, 44dp thumbnail; 24dp above and below. */
@Composable
private fun InboxItem(row: InboxRow, onClick: (String) -> Unit, image: RemoteImage) {
    val colors = ChalkakTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("notifications.item-${row.id}")
            .tapTarget { onClick(row.id) }
            .padding(horizontal = ChalkakTheme.spacing.screenHorizontal, vertical = ChalkakTheme.spacing.xl),
        verticalAlignment = Alignment.Top,
    ) {
        Box(Modifier.width(ChalkakTheme.spacing.md).padding(top = ChalkakTheme.spacing.xs)) {
            if (row.unread) {
                Box(
                    Modifier
                        .size(ChalkakTheme.spacing.sm)
                        .background(colors.inputCursor, CircleShape)
                        .testTag("notifications.item-unread-${row.id}"),
                )
            }
        }
        Column(Modifier.weight(1f).padding(start = ChalkakTheme.spacing.md), verticalArrangement = Arrangement.spacedBy(ChalkakTheme.spacing.sm)) {
            Text(
                text = row.title,
                style = ChalkakTheme.typography.subheadline,
                color = colors.textPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.testTag("notifications.item-title-${row.id}"),
            )
            if (row.body.isNotBlank()) {
                Text(
                    text = row.body,
                    style = ChalkakTheme.typography.caption,
                    color = colors.textSecondary,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.testTag("notifications.item-body-${row.id}"),
                )
            }
            Text(
                text = row.timeText,
                style = ChalkakTheme.typography.caption,
                color = colors.textInactive,
                modifier = Modifier.testTag("notifications.item-time-${row.id}"),
            )
        }
        image(
            row.thumbnailImageUrl,
            Modifier.padding(start = ChalkakTheme.spacing.lg).size(ThumbnailSize).clip(RoundedCornerShape(6.dp)).testTag("notifications.item-thumbnail-${row.id}"),
        )
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
