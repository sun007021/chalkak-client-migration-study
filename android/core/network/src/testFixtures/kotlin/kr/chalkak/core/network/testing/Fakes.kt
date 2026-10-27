package kr.chalkak.core.network.testing

import kr.chalkak.core.common.testing.FakeClock
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.network.AuthEventSink
import kr.chalkak.core.network.RefreshApi
import kr.chalkak.core.network.RefreshResult
import kr.chalkak.core.network.RefreshedTokens
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession
import java.time.Duration
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

const val USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const val USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

object TestSessions {
    fun user(
        clock: FakeClock,
        userId: String = USER_A,
        access: String = "fixture-access-token-1",
        refresh: String = "fixture-refresh-token-1",
        accessTtl: Duration = Duration.ofMinutes(15),
    ): Session = Session(
        userId = userId,
        accessToken = access,
        accessExpiresAt = clock.now().plus(accessTtl),
        refreshToken = refresh,
        refreshExpiresAt = clock.now().plus(Duration.ofDays(30)),
    )

    fun expiredAccess(clock: FakeClock, userId: String = USER_A): Session =
        user(clock, userId = userId, accessTtl = Duration.ofMinutes(-1))

    val tokens2 = RefreshedTokens("fixture-access-token-2", 900, "fixture-refresh-token-2", 2_592_000)
}

/** In-memory [SessionStore] with failure injection and a suspension hook inside [read]. */
class FakeSessionStore(initial: StoredSession = StoredSession.None) : SessionStore {
    @Volatile var current: StoredSession = initial
    val writes = CopyOnWriteArrayList<Session>()
    val clearCount = AtomicInteger()
    val readCount = AtomicInteger()
    private val failingReads = AtomicInteger()
    /** Called at the start of every read with the 1-based read index; may suspend (e.g. await a CompletableDeferred gate). */
    @Volatile var onRead: (suspend (Int) -> Unit)? = null

    fun failNextReads(count: Int) { failingReads.set(count) }

    override suspend fun read(): StoredSession {
        val n = readCount.incrementAndGet()
        onRead?.invoke(n)
        if (failingReads.getAndUpdate { if (it > 0) it - 1 else 0 } > 0) throw IllegalStateException("keystore corrupted")
        return current
    }

    override suspend fun write(session: Session) {
        current = StoredSession.User(session)
        writes += session
    }

    override suspend fun clear() {
        current = StoredSession.None
        clearCount.incrementAndGet()
    }

    val storedUser: Session? get() = (current as? StoredSession.User)?.session
}

class FakeRefreshApi(vararg scripted: RefreshResult) : RefreshApi {
    private val script = ConcurrentLinkedQueue(scripted.toList())
    val calls = CopyOnWriteArrayList<String>()
    val started = Channel<String>(Channel.UNLIMITED)
    /** When set, [refresh] suspends until completed. */
    @Volatile var gate: CompletableDeferred<Unit>? = null

    override suspend fun refresh(refreshToken: String): RefreshResult {
        calls += refreshToken
        started.trySend(refreshToken)
        gate?.await()
        return script.poll() ?: RefreshResult.Success(TestSessions.tokens2)
    }
}

class RecordingEvents : AuthEventSink {
    val events = CopyOnWriteArrayList<AuthEvent>()
    override fun onEvent(event: AuthEvent) { events += event }
}
