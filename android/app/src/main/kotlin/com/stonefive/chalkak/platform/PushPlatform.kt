package com.stonefive.chalkak.platform

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.result.ActivityResultLauncher
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.stonefive.chalkak.MainActivity
import com.stonefive.chalkak.R
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.withContext
import kr.chalkak.feature.notification.PushPayloadParser
import java.util.concurrent.atomic.AtomicInteger
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
    /** FCM `onNewToken`: hot; the latest token may be replayed to a late collector (registration de-duplicates). */
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
        /** No token, no permission needed, in-memory stores, display does nothing (JVM tests, builds without Firebase wiring). */
        fun headless(): PushPlatform = PushPlatform(
            tokens = HeadlessTokens,
            permission = HeadlessPermission,
            display = HeadlessDisplay,
            promptStore = InMemoryPromptStore(),
            pendingTaps = InMemoryPendingTaps(),
        )

        /** Real Android adapters; tokens come from the FCM adapter ([FcmTokens]) when the Gradle flag is on, else there are none. */
        fun android(context: Context, bridge: PushPermissionBridge = PushPermissionBridge()): PushPlatform {
            val app = context.applicationContext
            return PushPlatform(
                tokens = FcmTokens.create(app),
                permission = AndroidNotificationPermission(app, bridge),
                display = AndroidNotificationDisplay(app),
                promptStore = AndroidPermissionPromptStore(app),
                pendingTaps = AndroidPendingTapStore(app),
                permissionBridge = bridge,
            )
        }
    }
}

/** Bridge between the `RequestPermission` Activity result and the suspending [AndroidNotificationPermission.request]. */
class PushPermissionBridge {
    @Volatile
    var launcher: ActivityResultLauncher<String>? = null

    @Volatile
    private var pending: CompletableDeferred<Boolean>? = null

    /** Drops [registered] when the Activity that owns it is destroyed. A launcher of a newer Activity stays. */
    fun detach(registered: ActivityResultLauncher<*>) {
        if (launcher === registered) launcher = null
    }

    /** A new request replaces an unanswered one (that one counts as denied). */
    internal fun begin(): CompletableDeferred<Boolean> {
        pending?.complete(false)
        return CompletableDeferred<Boolean>().also { pending = it }
    }

    internal fun finish(request: CompletableDeferred<Boolean>) {
        if (pending === request) pending = null
    }

    fun onResult(granted: Boolean) {
        pending?.complete(granted)
        pending = null
    }
}

/** [sdkInt] is injectable for tests; below 33 the state is NotRequired and no request is made. */
class AndroidNotificationPermission(
    private val context: Context,
    private val bridge: PushPermissionBridge,
    private val sdkInt: Int = android.os.Build.VERSION.SDK_INT,
) : NotificationPermissionPort {
    override suspend fun state(): OsPermissionState = when {
        sdkInt < TIRAMISU -> OsPermissionState.NotRequired
        held() -> OsPermissionState.Granted
        else -> OsPermissionState.NotDetermined
    }

    override suspend fun request(): PermissionRequestResult {
        if (sdkInt < TIRAMISU) return PermissionRequestResult.Granted
        val launcher = bridge.launcher ?: return PermissionRequestResult.Failed
        val answer = bridge.begin()
        return try {
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
            if (answer.await()) PermissionRequestResult.Granted else PermissionRequestResult.Denied
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (_: Exception) {
            PermissionRequestResult.Failed
        } finally {
            bridge.finish(answer)
        }
    }

    private fun held(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private companion object {
        const val TIRAMISU = 33
    }
}

/** Channel + notification builder; the content intent of a shown notification parses back with [PushIntentParser]. */
class AndroidNotificationDisplay(private val context: Context) : NotificationDisplay {
    private val manager get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val ids = AtomicInteger()

    override fun ensureChannel(channelId: String, name: String) {
        manager.createNotificationChannel(NotificationChannel(channelId, name, NotificationManager.IMPORTANCE_DEFAULT))
    }

    override fun show(notification: ShownNotification) {
        val id = ids.incrementAndGet()
        val tap = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(PushIntentParser.LOCAL_MARKER, true)
        PushIntentParser.KEYS.forEach { (key, read) -> read(notification.payload)?.let { tap.putExtra(key, it) } }
        val content = PendingIntent.getActivity(context, id, tap, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val built = NotificationCompat.Builder(context, notification.channelId)
            .setSmallIcon(R.drawable.chalkak_notification_mark)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setAutoCancel(true)
            .setContentIntent(content)
            .build()
        try {
            manager.notify(id, built)
        } catch (_: SecurityException) {
            // Permission revoked between the check and the call: nothing to show.
        }
    }
}

/** Survives process death (SharedPreferences, committed); a corrupt record reads as null. */
class AndroidPendingTapStore(context: Context) : PendingTapStore {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override suspend fun load(): PendingTap? = withContext(Dispatchers.IO) {
        try {
            if (!prefs.getBoolean(PRESENT, false)) return@withContext null
            PendingTap(
                payload = PushPayload(
                    type = prefs.getString("type", null),
                    notificationId = prefs.getString("notificationId", null),
                    sourceType = prefs.getString("sourceType", null),
                    sourceId = prefs.getString("sourceId", null),
                    eventId = prefs.getString("eventId", null),
                ),
                userId = prefs.getString("userId", null),
            )
        } catch (_: Exception) {
            null
        }
    }

    override suspend fun save(tap: PendingTap) {
        withContext(Dispatchers.IO) {
            prefs.edit()
                .clear()
                .putBoolean(PRESENT, true)
                .putString("type", tap.payload.type)
                .putString("notificationId", tap.payload.notificationId)
                .putString("sourceType", tap.payload.sourceType)
                .putString("sourceId", tap.payload.sourceId)
                .putString("eventId", tap.payload.eventId)
                .putString("userId", tap.userId)
                .commit()
        }
    }

    override suspend fun clear() {
        withContext(Dispatchers.IO) { prefs.edit().clear().commit() }
    }

    private companion object {
        const val PREFS = "chalkak_push_pending_tap"
        const val PRESENT = "present"
    }
}

/** Device-level "already asked" flag, persisted. */
class AndroidPermissionPromptStore(context: Context) : PermissionPromptStore {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override suspend fun wasRequested(): Boolean = withContext(Dispatchers.IO) { prefs.getBoolean(KEY, false) }

    override suspend fun markRequested() {
        withContext(Dispatchers.IO) { prefs.edit().putBoolean(KEY, true).commit() }
    }

    private companion object {
        const val PREFS = "chalkak_push_prompt"
        const val KEY = "requested"
    }
}

/** Notification tap intent -> payload (TC-PUSH-050 Android half): a system-tray FCM tap or a tap on a notification this app showed. */
object PushIntentParser {
    internal const val LOCAL_MARKER = "com.stonefive.chalkak.push.LOCAL"
    private const val FCM_MESSAGE_ID = "google.message_id"

    internal val KEYS: List<Pair<String, (PushPayload) -> String?>> = listOf(
        "type" to { p -> p.type },
        "notificationId" to { p -> p.notificationId },
        "sourceType" to { p -> p.sourceType },
        "sourceId" to { p -> p.sourceId },
        "eventId" to { p -> p.eventId },
    )

    /** Null when [intent] is null, has no extras, or is not an FCM / own-notification tap. Never throws. */
    fun fromIntent(intent: Intent?): PushPayload? = try {
        val extras = intent?.extras
        when {
            extras == null -> null
            extras.containsKey(FCM_MESSAGE_ID) || extras.getBoolean(LOCAL_MARKER, false) -> {
                // getString yields null for a value of another type, which counts as missing (TC-PUSH-049).
                val data = KEYS.associate { (key, _) -> key to extras.getString(key) }
                PushPayloadParser.fromData(data)
            }
            else -> null
        }
    } catch (_: Exception) {
        null
    }
}

private object HeadlessTokens : PushTokenSource {
    override val refreshed: Flow<String> = emptyFlow()
    override suspend fun currentToken(): String? = null
}

private object HeadlessPermission : NotificationPermissionPort {
    override suspend fun state(): OsPermissionState = OsPermissionState.NotRequired
    override suspend fun request(): PermissionRequestResult = PermissionRequestResult.Granted
}

private object HeadlessDisplay : NotificationDisplay {
    override fun ensureChannel(channelId: String, name: String) = Unit
    override fun show(notification: ShownNotification) = Unit
}

private class InMemoryPromptStore : PermissionPromptStore {
    @Volatile
    private var requested = false
    override suspend fun wasRequested(): Boolean = requested
    override suspend fun markRequested() {
        requested = true
    }
}

private class InMemoryPendingTaps : PendingTapStore {
    @Volatile
    private var current: PendingTap? = null
    override suspend fun load(): PendingTap? = current
    override suspend fun save(tap: PendingTap) {
        current = tap
    }
    override suspend fun clear() {
        current = null
    }
}
