package kr.chalkak.feature.notification

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
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
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.auth.testing.EventLog
import kr.chalkak.core.network.RefreshOutcome
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.FakeSessionStore
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

const val USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const val USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/**
 * Scope for the holders under test: runs on the test scheduler (so `runCurrent`/`advanceUntilIdle`/`advanceTimeBy` drive it)
 * but, unlike `backgroundScope`, counts as foreground work.
 */
fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] into a list for the rest of the test (eager, so no emission is missed). */
fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    @OptIn(ExperimentalCoroutinesApi::class)
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
}

class RecordingUnread : UnreadStatusRefresher {
    var calls = 0
    override fun refresh() { calls++ }
}

class FakeFcmTokenSource(var token: String? = null) : FcmTokenSource {
    var calls = 0
    override suspend fun currentToken(): String? {
        calls++
        return token
    }
}

/** Scripted [SessionRefresher]. Unscripted calls return Refreshed(a session with a `session_id` token). On success it writes to [store] like the real one. */
class ScriptedRefresher(private val store: FakeSessionStore, private val log: EventLog = EventLog()) : SessionRefresher {
    val calls = CopyOnWriteArrayList<Session>()
    val outcomes = ArrayDeque<RefreshOutcome>()

    override suspend fun refresh(sent: Session): RefreshOutcome {
        log.add("refresh")
        calls += sent
        val outcome = outcomes.removeFirstOrNull()
            ?: RefreshOutcome.Refreshed(sent.copy(accessToken = JwtTokens.withSessionId, refreshToken = "fixture-refresh-token-2"))
        if (outcome is RefreshOutcome.Refreshed) store.write(outcome.session)
        return outcome
    }
}

object JwtTokens {
    val withSessionId: String = Fixtures.json("push/jwt__with-session-id.json").jsonObject.getValue("token").jsonPrimitive.content
    val withoutSessionId: String = Fixtures.json("push/jwt__without-session-id.json").jsonObject.getValue("token").jsonPrimitive.content
}

fun memberSession(userId: String = USER_A, accessToken: String = JwtTokens.withSessionId): Session = Session(
    userId = userId,
    accessToken = accessToken,
    accessExpiresAt = Instant.parse("2026-12-01T00:00:00Z"),
    refreshToken = "fixture-refresh-token-1",
    refreshExpiresAt = Instant.parse("2027-01-01T00:00:00Z"),
)

fun member(userId: String = USER_A, accessToken: String = JwtTokens.withSessionId): StoredSession =
    StoredSession.User(memberSession(userId, accessToken))

class FakePermissionPort(
    var state: OsPermissionState = OsPermissionState.NotDetermined,
    var result: PermissionRequestResult = PermissionRequestResult.Granted,
) : NotificationPermissionPort {
    var requests = 0
    var failure: Exception? = null
    var gate: CompletableDeferred<Unit>? = null

    override suspend fun state(): OsPermissionState = state

    override suspend fun request(): PermissionRequestResult {
        requests++
        failure?.let { throw it }
        gate?.await()
        return result
    }
}

class InMemoryPromptStore(var requested: Boolean = false) : PermissionPromptStore {
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
    /** When set, every store call throws it (a broken disk). */
    var failWith: Exception? = null
    override suspend fun load(): PendingTap? = failWith?.let { throw it } ?: current
    override suspend fun save(tap: PendingTap) {
        saves++
        failWith?.let { throw it }
        current = tap
    }
    override suspend fun clear() {
        clears++
        failWith?.let { throw it }
        current = null
    }
}

/** A `push/payload__*.json` fixture: FCM `data` (values may be non-strings) plus the display `notification`. */
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
