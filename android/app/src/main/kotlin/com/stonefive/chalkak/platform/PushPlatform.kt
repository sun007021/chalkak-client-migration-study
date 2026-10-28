package com.stonefive.chalkak.platform

import android.content.Context
import android.content.Intent
import androidx.activity.result.ActivityResultLauncher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kr.chalkak.feature.notification.FcmTokenSource
import kr.chalkak.feature.notification.NotificationDisplay
import kr.chalkak.feature.notification.NotificationPermissionPort
import kr.chalkak.feature.notification.OsPermissionState
import kr.chalkak.feature.notification.PendingTap
import kr.chalkak.feature.notification.PendingTapStore
import kr.chalkak.feature.notification.PermissionPromptStore
import kr.chalkak.feature.notification.PermissionRequestResult
import kr.chalkak.feature.notification.PushPayload
import kr.chalkak.feature.notification.ShownNotification

/**
 * FCM token source. The Firebase adapter (behind a Gradle flag, like kakaoOn/kakaoOff) implements it; without Firebase
 * [currentToken] is null and [refreshed] never emits.
 */
interface PushTokenSource : FcmTokenSource {
    /** FCM `onNewToken`: hot, no replay. */
    val refreshed: Flow<String>
}

/** Everything push specific that needs Android or FCM, as ports of `:feature:notification`. */
class PushPlatform(
    val tokens: PushTokenSource,
    val permission: NotificationPermissionPort,
    val display: NotificationDisplay,
    val promptStore: PermissionPromptStore,
    val pendingTaps: PendingTapStore,
    /** Result channel of the `POST_NOTIFICATIONS` request, wired by `MainActivity` (like `PhotoPickBridge`). */
    val permissionBridge: PushPermissionBridge = PushPermissionBridge(),
) {
    companion object {
        /** STUB (A8 test step): in-memory stores, no token, permission NotRequired, display no-ops. */
        fun headless(): PushPlatform = PushPlatform(
            tokens = NotImplementedTokens,
            permission = NotImplementedPermission,
            display = NotImplementedDisplay,
            promptStore = NotImplementedPromptStore,
            pendingTaps = NotImplementedPendingTaps,
        )

        /** STUB (A8 test step): real Android adapters; tokens come from the FCM adapter when the flag is on, else none. */
        fun android(context: Context, bridge: PushPermissionBridge = PushPermissionBridge()): PushPlatform =
            headless()
    }
}

/** STUB. Bridge between the `RequestPermission` Activity result and the suspending [AndroidNotificationPermission.request]. */
class PushPermissionBridge {
    @Volatile
    var launcher: ActivityResultLauncher<String>? = null

    /** Drops [registered] when the Activity that owns it is destroyed. A launcher of a newer Activity stays. */
    fun detach(registered: ActivityResultLauncher<*>) {
        TODO("A8 implementer")
    }

    fun onResult(granted: Boolean) {
        TODO("A8 implementer")
    }
}

/** STUB. [sdkInt] is injectable for tests; below 33 the state is NotRequired and no request is made. */
class AndroidNotificationPermission(
    context: Context,
    private val bridge: PushPermissionBridge,
    private val sdkInt: Int = android.os.Build.VERSION.SDK_INT,
) : NotificationPermissionPort {
    override suspend fun state(): OsPermissionState = TODO("A8 implementer")
    override suspend fun request(): PermissionRequestResult = TODO("A8 implementer")
}

/** STUB. Channel + notification builder; the content intent of a shown notification parses back with [PushIntentParser]. */
class AndroidNotificationDisplay(context: Context) : NotificationDisplay {
    override fun ensureChannel(channelId: String, name: String) = TODO("A8 implementer")
    override fun show(notification: ShownNotification) = TODO("A8 implementer")
}

/** STUB. Survives process death (SharedPreferences or DataStore); a corrupt record reads as null. */
class AndroidPendingTapStore(context: Context) : PendingTapStore {
    override suspend fun load(): PendingTap? = TODO("A8 implementer")
    override suspend fun save(tap: PendingTap) = TODO("A8 implementer")
    override suspend fun clear() = TODO("A8 implementer")
}

/** STUB. Device-level "already asked" flag, persisted. */
class AndroidPermissionPromptStore(context: Context) : PermissionPromptStore {
    override suspend fun wasRequested(): Boolean = TODO("A8 implementer")
    override suspend fun markRequested() = TODO("A8 implementer")
}

/** STUB. Notification tap intent -> payload (TC-PUSH-050 Android half). */
object PushIntentParser {
    /** Null when [intent] is null, has no extras, or is not an FCM / own-notification tap. Never throws. */
    fun fromIntent(intent: Intent?): PushPayload? = null
}

private object NotImplementedTokens : PushTokenSource {
    override val refreshed: Flow<String> = emptyFlow()
    override suspend fun currentToken(): String? = TODO("A8 implementer")
}

private object NotImplementedPermission : NotificationPermissionPort {
    override suspend fun state(): OsPermissionState = TODO("A8 implementer")
    override suspend fun request(): PermissionRequestResult = TODO("A8 implementer")
}

private object NotImplementedDisplay : NotificationDisplay {
    override fun ensureChannel(channelId: String, name: String) = TODO("A8 implementer")
    override fun show(notification: ShownNotification) = TODO("A8 implementer")
}

private object NotImplementedPromptStore : PermissionPromptStore {
    override suspend fun wasRequested(): Boolean = TODO("A8 implementer")
    override suspend fun markRequested() = TODO("A8 implementer")
}

private object NotImplementedPendingTaps : PendingTapStore {
    override suspend fun load(): PendingTap? = TODO("A8 implementer")
    override suspend fun save(tap: PendingTap) = TODO("A8 implementer")
    override suspend fun clear() = TODO("A8 implementer")
}
