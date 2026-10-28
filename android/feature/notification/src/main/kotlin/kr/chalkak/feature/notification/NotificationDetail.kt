package kr.chalkak.feature.notification

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.notification.NotificationDetail
import kr.chalkak.core.data.notification.NotificationRepository
import kr.chalkak.core.data.notification.NotificationType
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

enum class DetailPhase { Loading, Content, Gone, Error }

data class DetailUiState(
    val phase: DetailPhase = DetailPhase.Loading,
    /** Null unless [phase] is Content: a 404 or error never shows stale or other data (TC-NOTI-045). */
    val detail: NotificationDetail? = null,
    /** `noti.network` or `noti.detail.error`; only with [DetailPhase.Error]. */
    val errorCopyKey: String? = null,
    /** originalImageUrl is present (a null URL hides the area; REQ-NOTI-024/047). */
    val showOriginalPhoto: Boolean = false,
    /** rejectionReason is present ("반려 사유" section; a null reason hides it). */
    val showRejectionReason: Boolean = false,
    /** "알림함으로" button: POST_REJECTED only. There is never a "새로 올리기" button. */
    val showToInboxButton: Boolean = false,
)

sealed interface DetailEffect {
    data class Toast(val id: Long, val copyKey: String) : DetailEffect
    /** Inbox list must be reloaded (404 on the detail, REQ-NOTI-027). Unread is refreshed through [UnreadStatusRefresher]. */
    data object InvalidateInbox : DetailEffect
    /** "알림함으로" with the inbox NOT below: open the inbox (replacing this detail). */
    data object OpenInbox : DetailEffect
    /** "알림함으로" with the inbox already below, or back: just close the detail. */
    data object Close : DetailEffect
    data object RequireLogin : DetailEffect
}

/**
 * Notification detail holder (REQ-NOTI-023..027, 014). [onShown] sends screen_view `notification_detail` once per entry and loads
 * `detail(id)` (never a read request). 404 -> Gone + toast `noti.gone` + InvalidateInbox + unread refresh; connection failure ->
 * Error(`noti.network`); other failure -> Error(`noti.detail.error`); [onRetry] reloads; 401 -> RequireLogin.
 */
class NotificationDetailStateHolder(
    private val scope: CoroutineScope,
    private val repo: NotificationRepository,
    private val analytics: AnalyticsTracker,
    private val unread: UnreadStatusRefresher,
) {
    private val mutableState = MutableStateFlow(DetailUiState())
    private val channel = Channel<DetailEffect>(Channel.UNLIMITED)
    private var notificationId: String? = null
    private var job: Job? = null
    private var toastCounter = 0L

    val state: StateFlow<DetailUiState> = mutableState.asStateFlow()
    val effects: Flow<DetailEffect> = channel.receiveAsFlow()

    fun onShown(notificationId: String) {
        this.notificationId = notificationId
        analytics.screenView(SCREEN)
        load()
    }

    fun onRetry() = load()

    fun onToInboxClicked(inboxIsBelow: Boolean) {
        channel.trySend(if (inboxIsBelow) DetailEffect.Close else DetailEffect.OpenInbox)
    }

    fun onScreenGone() {
        job?.cancel()
    }

    private fun load() {
        val id = notificationId ?: return
        job?.cancel()
        mutableState.value = DetailUiState()
        job = scope.launch {
            when (val result = guardedApiCall("notification detail") { repo.detail(id) }) {
                is ApiResult.Success -> mutableState.value = content(result.value)
                is ApiResult.Failure -> fail(result.error)
            }
        }
    }

    private fun content(detail: NotificationDetail) = DetailUiState(
        phase = DetailPhase.Content,
        detail = detail,
        showOriginalPhoto = detail.originalImageUrl != null && detail.type != NotificationType.NOTICE,
        showRejectionReason = detail.rejectionReason != null,
        showToInboxButton = detail.type == NotificationType.POST_REJECTED,
    )

    private fun fail(error: ApiError) {
        when {
            error.requiresLogin() -> channel.trySend(DetailEffect.RequireLogin)
            error.isNotFound() -> gone()
            else -> mutableState.value = DetailUiState(
                phase = DetailPhase.Error,
                errorCopyKey = if (error.isConnectionFailure()) NotiCopyKeys.NETWORK else NotiCopyKeys.DETAIL_ERROR,
            )
        }
    }

    private fun gone() {
        mutableState.value = DetailUiState(phase = DetailPhase.Gone)
        channel.trySend(DetailEffect.Toast(++toastCounter, NotiCopyKeys.GONE))
        channel.trySend(DetailEffect.InvalidateInbox)
        unread.refresh()
    }

    private companion object {
        const val SCREEN = "notification_detail"
    }
}
