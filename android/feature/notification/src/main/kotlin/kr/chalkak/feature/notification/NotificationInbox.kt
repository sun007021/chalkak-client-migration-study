package kr.chalkak.feature.notification

import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.chalkak.core.common.Clock
import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.notification.NotificationItem
import kr.chalkak.core.data.notification.NotificationPage
import kr.chalkak.core.data.notification.NotificationRepository
import kr.chalkak.core.data.notification.NotificationType
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.guardedApiCall

enum class InboxPhase { Loading, Content, Empty, Error }

/** [timeText] is "M월 d일 HH:mm" in KST (D-09). [unread] = readAt == null. Title/body are the server's text. */
data class InboxRow(
    val id: String,
    val type: NotificationType,
    val title: String,
    val body: String,
    val thumbnailImageUrl: String?,
    val timeText: String,
    val unread: Boolean,
    val readAt: Instant?,
)

data class InboxUiState(
    val phase: InboxPhase = InboxPhase.Loading,
    val rows: List<InboxRow> = emptyList(),
    val hasNext: Boolean = false,
    /** Last page that is part of [rows]; 0 before the first success. */
    val currentPage: Int = 0,
    val refreshing: Boolean = false,
    val loadingMore: Boolean = false,
    /** `noti.network` (connection failure) or `noti.inbox.error`; only with [InboxPhase.Error]. */
    val errorCopyKey: String? = null,
    /** Row whose tap is being processed; further taps on it are ignored (REQ-NOTI-020). */
    val busyRowId: String? = null,
)

sealed interface InboxEffect {
    /** [id] is unique per occurrence so an identical toast shown twice re-triggers (D-20). */
    data class Toast(val id: Long, val copyKey: String) : InboxEffect
    data class Navigate(val command: NavCommand) : InboxEffect
    /** 401 that survived the refresh, or REAUTHENTICATION_REQUIRED (REQ-PUSH table): leave for the login screen, no message. */
    data object RequireLogin : InboxEffect
}

/**
 * Inbox list holder (REQ-NOTI-001..022, 033..034).
 *  - [onShown]: sends screen_view `notifications`; first time -> loading + `list(1)`; later shows (back from detail/feed) -> silent
 *    `list(1)` replace that keeps the old rows and shows no toast on failure (REQ-NOTI-012);
 *  - [onScrolledTo] with `lastVisibleIndex >= rows.size - 4` and hasNext and no page request running -> `list(currentPage + 1)`,
 *    append without duplicate ids (first occurrence wins, order kept); failure -> toast `noti.inbox.more-error`, rows and page kept;
 *  - [onPullToRefresh]: refreshing=true, `list(1)` replaces rows and resets page; failure -> toast `noti.inbox.refresh-error`, rows kept;
 *    a newer refresh supersedes an older one (the older response is dropped);
 *  - first load failure: Error phase, `noti.network` for a connection failure, otherwise `noti.inbox.error`; [onRetry] -> Loading + list(1);
 *  - [onRowClicked]: plan via [NotificationTapPlanner.forInboxRow], executed by [tapHandler]; busy row ignores repeat taps;
 *    Navigate -> effect + (read confirmed -> row unread=false, readAt kept if already set), Rejected -> toast + silent list(1) reload,
 *    RequireLogin -> effect;
 *  - [onScreenGone] cancels everything in flight without an error; [onSessionEnded] (logout/account switch) cancels, empties the
 *    state and drops late responses.
 */
class NotificationInboxStateHolder(
    private val scope: CoroutineScope,
    private val repo: NotificationRepository,
    private val tapHandler: NotificationTapHandler,
    private val analytics: AnalyticsTracker,
    private val clock: Clock,
) {
    private val mutableState = MutableStateFlow(InboxUiState())
    private val channel = Channel<InboxEffect>(Channel.UNLIMITED)
    private var items: List<NotificationItem> = emptyList()
    private var headJob: Job? = null
    private var moreJob: Job? = null
    private val tapJobs = mutableListOf<Job>()
    private val busyIds = mutableListOf<String>()
    private var toastCounter = 0L

    val state: StateFlow<InboxUiState> = mutableState.asStateFlow()
    val effects: Flow<InboxEffect> = channel.receiveAsFlow()

    fun onShown() {
        analytics.screenView(SCREEN)
        val shown = mutableState.value.phase
        if (shown == InboxPhase.Content || shown == InboxPhase.Empty) reload(HeadLoad.Silent) else reload(HeadLoad.Initial)
    }

    fun onRetry() = reload(HeadLoad.Initial)

    fun onPullToRefresh() = reload(HeadLoad.Refresh)

    fun onScrolledTo(lastVisibleIndex: Int) {
        val s = mutableState.value
        val nearEnd = lastVisibleIndex >= s.rows.size - NEAR_END_ROWS
        if (s.phase != InboxPhase.Content || !s.hasNext || s.loadingMore || s.refreshing || !nearEnd) return
        mutableState.update { it.copy(loadingMore = true) }
        moreJob = scope.launch { loadMore(s.currentPage + 1) }
    }

    fun onRowClicked(id: String) {
        val item = items.firstOrNull { it.id == id } ?: return
        val plan = NotificationTapPlanner.forInboxRow(item)
        if (plan.destination == null || id in busyIds) return
        setBusy { it.add(id) }
        val job = scope.launch {
            try {
                finishTap(plan, tapHandler.handle(plan))
            } finally {
                setBusy { it.remove(id) }
            }
        }
        tapJobs += job
        job.invokeOnCompletion { tapJobs.remove(job) }
    }

    /** Leaving the screen: everything in flight is cancelled without an error. */
    fun onScreenGone() {
        cancelAll()
        mutableState.update { it.copy(refreshing = false, loadingMore = false, busyRowId = null) }
    }

    /** Logout / account switch: cancel, forget everything, drop late responses. */
    fun onSessionEnded() {
        cancelAll()
        items = emptyList()
        mutableState.value = InboxUiState()
    }

    private fun cancelAll() {
        headJob?.cancel()
        moreJob?.cancel()
        tapJobs.toList().forEach { it.cancel() }
        tapJobs.clear()
        busyIds.clear()
    }

    private fun setBusy(change: (MutableList<String>) -> Unit) {
        change(busyIds)
        mutableState.update { it.copy(busyRowId = busyIds.lastOrNull()) }
    }

    // ---- loading ------------------------------------------------------------------------------------

    private enum class HeadLoad { Initial, Silent, Refresh }

    private fun reload(mode: HeadLoad) {
        headJob?.cancel()
        moreJob?.cancel()
        mutableState.update { current ->
            when (mode) {
                HeadLoad.Initial -> current.copy(phase = InboxPhase.Loading, errorCopyKey = null, loadingMore = false)
                HeadLoad.Silent -> current.copy(loadingMore = false)
                HeadLoad.Refresh -> current.copy(refreshing = true, loadingMore = false)
            }
        }
        headJob = scope.launch { loadHead(mode) }
    }

    private suspend fun loadHead(mode: HeadLoad) {
        when (val result = guardedApiCall("notification list") { repo.list(FIRST_PAGE) }) {
            is ApiResult.Success -> showFirstPage(result.value)
            is ApiResult.Failure -> failHead(mode, result.error)
        }
    }

    private fun showFirstPage(page: NotificationPage) {
        items = page.items
        mutableState.update {
            it.copy(
                phase = if (items.isEmpty()) InboxPhase.Empty else InboxPhase.Content,
                rows = rows(),
                hasNext = page.hasNext,
                currentPage = FIRST_PAGE,
                refreshing = false,
                errorCopyKey = null,
            )
        }
    }

    private fun failHead(mode: HeadLoad, error: ApiError) {
        mutableState.update { it.copy(refreshing = false) }
        when {
            error.requiresLogin() -> channel.trySend(InboxEffect.RequireLogin)
            mode == HeadLoad.Initial -> mutableState.update {
                it.copy(phase = InboxPhase.Error, errorCopyKey = if (error.isConnectionFailure()) NotiCopyKeys.NETWORK else NotiCopyKeys.INBOX_ERROR)
            }
            mode == HeadLoad.Refresh -> toast(NotiCopyKeys.INBOX_REFRESH_ERROR)
            else -> Unit
        }
    }

    private suspend fun loadMore(page: Int) {
        when (val result = guardedApiCall("notification list page") { repo.list(page) }) {
            is ApiResult.Success -> appendPage(page, result.value)
            is ApiResult.Failure -> {
                mutableState.update { it.copy(loadingMore = false) }
                if (result.error.requiresLogin()) channel.trySend(InboxEffect.RequireLogin) else toast(NotiCopyKeys.INBOX_MORE_ERROR)
            }
        }
    }

    private fun appendPage(page: Int, loaded: NotificationPage) {
        val known = items.map { it.id }.toSet()
        items = items + loaded.items.filter { it.id !in known }.distinctBy { it.id }
        mutableState.update { it.copy(rows = rows(), hasNext = loaded.hasNext, currentPage = page, loadingMore = false) }
    }

    // ---- taps ---------------------------------------------------------------------------------------

    private fun finishTap(plan: TapPlan, outcome: TapOutcome) {
        when (outcome) {
            is TapOutcome.Navigate -> {
                if (outcome.readConfirmed && plan.readNotificationId != null) markRead(plan.readNotificationId)
                outcome.toastCopyKey?.let(::toast)
                channel.trySend(InboxEffect.Navigate(NavCommand(outcome.destination, NavMode.Push)))
            }
            is TapOutcome.Rejected -> {
                toast(outcome.toastCopyKey)
                reload(HeadLoad.Silent)
            }
            TapOutcome.RequireLogin -> channel.trySend(InboxEffect.RequireLogin)
            TapOutcome.Dropped -> Unit
        }
    }

    private fun markRead(id: String) {
        val now = clock.now()
        items = items.map { if (it.id == id) it.copy(readAt = it.readAt ?: now) else it }
        mutableState.update { it.copy(rows = rows()) }
    }

    private fun toast(copyKey: String) {
        channel.trySend(InboxEffect.Toast(++toastCounter, copyKey))
    }

    private fun rows(): List<InboxRow> = items.map { item ->
        InboxRow(
            id = item.id,
            type = item.type,
            title = item.title,
            body = item.body,
            thumbnailImageUrl = item.thumbnailImageUrl,
            timeText = DateFormats.notificationTime(item.createdAt),
            unread = item.readAt == null,
            readAt = item.readAt,
        )
    }

    private companion object {
        const val SCREEN = "notifications"
        const val FIRST_PAGE = 1
        const val NEAR_END_ROWS = 4
    }
}
