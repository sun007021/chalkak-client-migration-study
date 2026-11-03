package com.stonefive.chalkak.testing

import com.stonefive.chalkak.platform.PushPlatform
import com.stonefive.chalkak.platform.PushTokenSource
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.feature.notification.NotificationDisplay
import kr.chalkak.feature.notification.NotificationPermissionPort
import kr.chalkak.feature.notification.OsPermissionState
import kr.chalkak.feature.notification.PendingTap
import kr.chalkak.feature.notification.PendingTapStore
import kr.chalkak.feature.notification.PermissionPromptStore
import kr.chalkak.feature.notification.PermissionRequestResult
import kr.chalkak.feature.notification.PushPayload
import kr.chalkak.feature.notification.ShownNotification
import kr.chalkak.feature.notification.UnreadStatusRefresher
import java.util.concurrent.CopyOnWriteArrayList

const val NOTI_USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const val NOTI_USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/** A `shared/fixtures/push/payload__<name>.json`: the FCM `data` map (values may be non-strings) and the display texts. */
class PushFixture(val data: Map<String, Any?>, val title: String?, val body: String?) {
    /** Built without production parsing code: only String values count. */
    val payload: PushPayload
        get() = PushPayload(
            type = data["type"] as? String,
            notificationId = data["notificationId"] as? String,
            sourceType = data["sourceType"] as? String,
            sourceId = data["sourceId"] as? String,
            eventId = data["eventId"] as? String,
        )

    companion object {
        fun load(name: String): PushFixture {
            val root = Fixtures.json("push/payload__$name.json").jsonObject
            val notification = root["notification"]?.jsonObject
            return PushFixture(
                data = root.getValue("data").jsonObject.mapValues { it.value.toAny() },
                title = notification?.get("title")?.jsonPrimitive?.content,
                body = notification?.get("body")?.jsonPrimitive?.content,
            )
        }

        private fun JsonElement.toAny(): Any? = when (this) {
            is JsonNull -> null
            is JsonPrimitive -> if (isString) content else (longOrNull ?: doubleOrNull ?: booleanOrNull)
            is JsonObject -> mapValues { it.value.toAny() }
            is JsonArray -> map { it.toAny() }
        }
    }
}

fun pushPayload(name: String): PushPayload = PushFixture.load(name).payload

class FakePermissionPort(
    var state: OsPermissionState = OsPermissionState.NotDetermined,
    var result: PermissionRequestResult = PermissionRequestResult.Granted,
) : NotificationPermissionPort {
    var requests = 0
    var stateCalls = 0
    var failure: Exception? = null
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun state(): OsPermissionState { stateCalls++; return state }

    override suspend fun request(): PermissionRequestResult {
        requests++
        failure?.let { throw it }
        gate?.await()
        return result
    }
}

class InMemoryPromptStore(@Volatile var requested: Boolean = false) : PermissionPromptStore {
    var marks = 0
    override suspend fun wasRequested(): Boolean = requested
    override suspend fun markRequested() {
        marks++
        requested = true
    }
}

class RecordingDisplay : NotificationDisplay {
    val channels = CopyOnWriteArrayList<Pair<String, String>>()
    val shown = CopyOnWriteArrayList<ShownNotification>()
    override fun ensureChannel(channelId: String, name: String) { channels += channelId to name }
    override fun show(notification: ShownNotification) { shown += notification }
}

class InMemoryPendingTapStore(@Volatile var current: PendingTap? = null) : PendingTapStore {
    var saves = 0
    var clears = 0
    override suspend fun load(): PendingTap? = current
    override suspend fun save(tap: PendingTap) { saves++; current = tap }
    override suspend fun clear() { clears++; current = null }
}

class RecordingUnreadRefresher : UnreadStatusRefresher {
    @Volatile var calls = 0
    override fun refresh() { calls++ }
}

/** [PushTokenSource] with a settable current token and a hot [refreshed] flow ([emitRefreshed]). */
class FakePushTokens(@Volatile var token: String? = null) : PushTokenSource {
    private val flow = MutableSharedFlow<String>(extraBufferCapacity = 16)
    var calls = 0
    override val refreshed: Flow<String> = flow
    override suspend fun currentToken(): String? { calls++; return token }
    fun emitRefreshed(value: String) { check(flow.tryEmit(value)) }
}

/** A [PushPlatform] made of the fakes above. */
class FakePush(
    val tokens: FakePushTokens = FakePushTokens(),
    val permission: FakePermissionPort = FakePermissionPort(),
    val display: RecordingDisplay = RecordingDisplay(),
    val promptStore: InMemoryPromptStore = InMemoryPromptStore(),
    val pendingTaps: InMemoryPendingTapStore = InMemoryPendingTapStore(),
) {
    val platform = PushPlatform(tokens, permission, display, promptStore, pendingTaps)
}
