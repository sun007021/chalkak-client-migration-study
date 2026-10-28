package kr.chalkak.feature.notification

import kr.chalkak.core.network.RefreshOutcome
import kr.chalkak.core.network.Session

/** FCM token source (adapter in :app wraps FirebaseMessaging). Null = the SDK has no token yet (TC-PUSH-018/019). */
fun interface FcmTokenSource {
    suspend fun currentToken(): String?
}

/** `TokenRefresher.refresh(sent)` seen from here (adapter in :app). Clearing the session on REAUTH is done by the refresher itself. */
fun interface SessionRefresher {
    suspend fun refresh(sent: Session): RefreshOutcome
}

/** Android OS notification permission as the OS reports it. */
enum class OsPermissionState {
    /** Android 12 and below: no runtime permission exists (REQ-PUSH-003). */
    NotRequired,
    NotDetermined,
    Granted,
    Denied,
}

sealed interface PermissionRequestResult {
    data object Granted : PermissionRequestResult
    data object Denied : PermissionRequestResult
    /** The request call itself failed (REQ-PUSH-006). */
    data object Failed : PermissionRequestResult
}

/** `POST_NOTIFICATIONS` access (adapter in :app). [request] may also throw; the flow treats a throw like [PermissionRequestResult.Failed]. */
interface NotificationPermissionPort {
    suspend fun state(): OsPermissionState
    suspend fun request(): PermissionRequestResult
}

/** Device-level "already asked" flag (one per app install, not per account: REQ-PUSH-001, TC-PUSH-011). */
interface PermissionPromptStore {
    suspend fun wasRequested(): Boolean
    suspend fun markRequested()
}

/** What the OS notification should show. [body] is already the final text (default copy applied). */
data class ShownNotification(
    val channelId: String,
    val title: String?,
    val body: String,
    val payload: PushPayload,
)

/** Android notification channel + notification builder (adapter in :app). */
interface NotificationDisplay {
    fun ensureChannel(channelId: String, name: String)
    fun show(notification: ShownNotification)
}

/** Re-fetches `GET /notifications/unread-status` (wired to HomeStateHolder in :app). Guests never fetch; that rule lives in home. */
fun interface UnreadStatusRefresher {
    fun refresh()
}

/** Persists the one pending push tap across process death (REQ-PUSH-031, TC-PUSH-063). */
interface PendingTapStore {
    suspend fun load(): PendingTap?
    suspend fun save(tap: PendingTap)
    suspend fun clear()
}

/** [userId] is the member who was signed in when the tap arrived, null when the session was not known yet (cold start). */
data class PendingTap(val payload: PushPayload, val userId: String?)

/** `shared/copy/ko.json` keys used by this module. */
object NotiCopyKeys {
    const val INBOX_TITLE = "noti.inbox.title"
    const val INBOX_LOADING = "noti.inbox.loading"
    const val INBOX_EMPTY_TITLE = "noti.inbox.empty.title"
    const val INBOX_EMPTY_BODY = "noti.inbox.empty.body"
    const val INBOX_ERROR = "noti.inbox.error"
    const val INBOX_RETRY = "noti.inbox.retry"
    const val INBOX_REFRESH_ERROR = "noti.inbox.refresh-error"
    const val INBOX_MORE_ERROR = "noti.inbox.more-error"
    const val NETWORK = "noti.network"
    const val READ_ERROR_NETWORK = "noti.read.error.network"
    const val GONE = "noti.gone"
    const val DETAIL_TITLE = "noti.detail.title"
    const val DETAIL_REASON = "noti.detail.reason"
    const val DETAIL_TO_INBOX = "noti.detail.to-inbox"
    const val DETAIL_ERROR = "noti.detail.error"
    const val PERM_ERROR = "noti.perm.error"
    const val PUSH_DEFAULT_BODY = "push.default.body"
    const val PUSH_CHANNEL_NAME = "push.channel.name"
}

/** Android notification channel used for every push type (REQ-PUSH-019, TC-PUSH-072). */
object PushChannel {
    const val ID = "moderation_push"
}
