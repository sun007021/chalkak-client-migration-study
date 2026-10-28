package kr.chalkak.feature.notification

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kr.chalkak.feature.auth.HomeMode

sealed interface PermissionFlowOutcome {
    /** Guest / not on the authenticated main screen: nothing happens (REQ-PUSH-002). */
    data object NotMember : PermissionFlowOutcome
    /** The "asked" flag was already stored. */
    data object AlreadyRequested : PermissionFlowOutcome
    /** Android 12 and below: no request. */
    data object NotRequired : PermissionFlowOutcome
    /** OS state already Granted/Denied: no dialog, only the flag is stored (REQ-PUSH-004). */
    data object MarkedOnly : PermissionFlowOutcome
    /** The OS dialog was requested once. */
    data class Prompted(val result: PermissionRequestResult) : PermissionFlowOutcome
    /** The request call failed: show toast [toastCopyKey] (`noti.perm.error`); the flag is stored anyway (REQ-PUSH-006). */
    data class Failed(val toastCopyKey: String) : PermissionFlowOutcome
}

/**
 * Permission request flow (REQ-PUSH-001..006). Called by the app each time an authenticated main (Home) opens; asks at most once per
 * install. The flag is stored when the dialog is requested (before the answer), so a second concurrent/later call never asks again.
 * Never calls `PATCH /notification-settings` (REQ-PUSH-005) and shows no app-made dialog (spec 확인 필요 1).
 */
class NotificationPermissionFlow(
    private val permission: NotificationPermissionPort,
    private val store: PermissionPromptStore,
) {
    private val lock = Mutex()

    suspend fun onMainEntered(mode: HomeMode): PermissionFlowOutcome {
        if (mode != HomeMode.Member) return PermissionFlowOutcome.NotMember
        return lock.withLock { askOnce() }
    }

    private suspend fun askOnce(): PermissionFlowOutcome {
        if (permission.state() == OsPermissionState.NotRequired) return PermissionFlowOutcome.NotRequired
        if (store.wasRequested()) return PermissionFlowOutcome.AlreadyRequested
        return when (permission.state()) {
            OsPermissionState.NotDetermined -> prompt()
            else -> {
                store.markRequested()
                PermissionFlowOutcome.MarkedOnly
            }
        }
    }

    private suspend fun prompt(): PermissionFlowOutcome {
        store.markRequested()
        return when (val result = requestSafely()) {
            PermissionRequestResult.Failed -> PermissionFlowOutcome.Failed(NotiCopyKeys.PERM_ERROR)
            else -> PermissionFlowOutcome.Prompted(result)
        }
    }

    private suspend fun requestSafely(): PermissionRequestResult = try {
        permission.request()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        PermissionRequestResult.Failed
    }
}

/** A push as delivered to `onMessageReceived`: display text plus the routing payload. */
data class PushMessage(val title: String?, val body: String?, val payload: PushPayload)

/**
 * Push arriving while the app can handle it (REQ-PUSH-019/020, TC-PUSH-068..073).
 *  - always: [unread] refresh once (foreground or background);
 *  - display only when [foreground] AND the OS permission is Granted: channel [PushChannel.ID], server title/body, blank body ->
 *    `push.default.body`; every type is shown (spec 확인 필요 2), no local filtering by server settings.
 */
class ForegroundPushHandler(
    private val permission: NotificationPermissionPort,
    private val display: NotificationDisplay,
    private val unread: UnreadStatusRefresher,
    private val channelName: String,
    private val defaultBody: String,
) {
    /** App start: creates channel [PushChannel.ID] with [channelName] (TC-PUSH-072). Safe to call repeatedly. */
    fun initChannel() {
        display.ensureChannel(PushChannel.ID, channelName)
    }

    suspend fun onMessageReceived(message: PushMessage, foreground: Boolean) {
        unread.refresh()
        if (foreground && permission.state() == OsPermissionState.Granted) display.show(shown(message))
    }

    private fun shown(message: PushMessage) = ShownNotification(
        channelId = PushChannel.ID,
        title = message.title,
        body = message.body?.takeIf { it.isNotBlank() } ?: defaultBody,
        payload = message.payload,
    )
}
