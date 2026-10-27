package kr.chalkak.core.network

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.network.testing.FakeRefreshApi
import kr.chalkak.core.network.testing.FakeSessionStore
import kr.chalkak.core.network.testing.RecordingEvents
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.USER_A
import kr.chalkak.core.network.testing.USER_B
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class TokenRefresherTest {
    private val clock = FakeClock()
    private val s1 = TestSessions.user(clock)
    private val s2 = TestSessions.user(clock, access = "fixture-access-token-2", refresh = "fixture-refresh-token-2")

    private class Rig(val store: FakeSessionStore, val api: FakeRefreshApi, val events: RecordingEvents, val refresher: TokenRefresher)

    private fun TestScope.rig(
        stored: StoredSession,
        api: FakeRefreshApi = FakeRefreshApi(),
    ): Rig {
        val store = FakeSessionStore(stored)
        val events = RecordingEvents()
        return Rig(store, api, events, TokenRefresher(store, api, clock, backgroundScope, events))
    }

    private suspend fun waitUntilReadStarted(store: FakeSessionStore) {
        while (store.readCount.get() == 0) yield()
    }

    @Test
    fun `TC-NET-022 success stores both new tokens with expiry computed from the response seconds`() = runTest {
        val r = rig(StoredSession.User(s1))
        val outcome = r.refresher.refresh(s1)
        val stored = r.store.storedUser!!
        assertEquals(RefreshOutcome.Refreshed(stored), outcome)
        assertEquals("fixture-access-token-2", stored.accessToken)
        assertEquals("fixture-refresh-token-2", stored.refreshToken)
        assertEquals(USER_A, stored.userId)
        assertEquals(clock.now().plusSeconds(900), stored.accessExpiresAt)
        assertEquals(clock.now().plus(Duration.ofSeconds(2_592_000)), stored.refreshExpiresAt)
        assertEquals(1, r.store.writes.size)
    }

    @Test
    fun `TC-NET-021 refresh answering REAUTHENTICATION_REQUIRED clears the session and emits go-to-login once`() = runTest {
        val r = rig(StoredSession.User(s1), FakeRefreshApi(RefreshResult.ReauthenticationRequired))
        assertEquals(RefreshOutcome.ReauthenticationRequired, r.refresher.refresh(s1))
        assertEquals(StoredSession.None, r.store.current)
        assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), r.events.events.toList())
        assertEquals(1, r.api.calls.size)
    }

    @Test
    fun `TC-NET-023 refresh network failure fails only that request keeps the session and does not retry`() = runTest {
        val r = rig(StoredSession.User(s1), FakeRefreshApi(RefreshResult.Failed(ApiError.Network(NetworkKind.TIMEOUT))))
        assertEquals(RefreshOutcome.Failed(ApiError.Network(NetworkKind.TIMEOUT)), r.refresher.refresh(s1))
        assertEquals(StoredSession.User(s1), r.store.current)
        assertEquals(0, r.store.clearCount.get())
        assertTrue(r.events.events.isEmpty())
        assertEquals(1, r.api.calls.size)
    }

    @Test
    fun `TC-NET-024 refresh 5xx is transient and keeps the session`() = runTest {
        val err = ApiError.Http(500, ErrorCode.INTERNAL_ERROR, "x")
        val r = rig(StoredSession.User(s1), FakeRefreshApi(RefreshResult.Failed(err)))
        assertEquals(RefreshOutcome.Failed(err), r.refresher.refresh(s1))
        assertEquals(StoredSession.User(s1), r.store.current)
        assertTrue(r.events.events.isEmpty())
    }

    @Test
    fun `TC-NET-025 failed refresh never overwrites the existing session`() = runTest {
        val r = rig(StoredSession.User(s1), FakeRefreshApi(RefreshResult.Failed(ApiError.InvalidResponse("missing refreshToken"))))
        assertEquals(RefreshOutcome.Failed(ApiError.InvalidResponse("missing refreshToken")), r.refresher.refresh(s1))
        assertTrue(r.store.writes.isEmpty())
        assertEquals(0, r.store.clearCount.get())
    }

    @Test
    fun `TC-NET-026 refresh 400 fails the request only and does not log out`() = runTest {
        val err = ApiError.Http(400, ErrorCode.BUSINESS_ERROR, "조회 조건이 올바르지 않습니다.")
        val r = rig(StoredSession.User(s1), FakeRefreshApi(RefreshResult.Failed(err)))
        assertEquals(RefreshOutcome.Failed(err), r.refresher.refresh(s1))
        assertEquals(0, r.store.clearCount.get())
        assertTrue(r.events.events.isEmpty())
    }

    @Test
    fun `TC-NET-015 concurrent refreshes share exactly one network call`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeRefreshApi().also { it.gate = gate }
        val r = rig(StoredSession.User(s1), api)
        val waiters = List(5) { async { r.refresher.refresh(s1) } }
        api.started.receive()
        gate.complete(Unit)
        val outcomes = waiters.awaitAll()
        assertEquals(1, api.calls.size)
        outcomes.forEach { assertEquals(RefreshOutcome.Refreshed(r.store.storedUser!!), it) }
        assertEquals(1, r.store.writes.size)
    }

    @Test
    fun `TC-NET-029 the same refresh token is never sent twice even when a stale caller arrives after completion`() = runTest {
        val r = rig(StoredSession.User(s1))
        r.refresher.refresh(s1)
        val late = r.refresher.refresh(s1)
        assertEquals(listOf("fixture-refresh-token-1"), r.api.calls.toList())
        assertEquals(RefreshOutcome.Refreshed(r.store.storedUser!!), late)
        assertEquals(1, r.store.writes.size)
    }

    @Test
    fun `TC-NET-016 store already holds a newer session so no refresh is sent`() = runTest {
        val r = rig(StoredSession.User(s2))
        assertEquals(RefreshOutcome.Refreshed(s2), r.refresher.refresh(s1))
        assertTrue(r.api.calls.isEmpty())
        assertTrue(r.store.writes.isEmpty())
    }

    @Test
    fun `race-a store read suspended while another refresh completes then no second refresh with the old token`() = runTest {
        val readGate = CompletableDeferred<Unit>()
        val r = rig(StoredSession.User(s1))
        r.store.onRead = { readGate.await() }
        val waiter = async { r.refresher.refresh(s1) }
        waitUntilReadStarted(r.store)
        r.store.current = StoredSession.User(s2) // another request's refresh finished while we were reading
        readGate.complete(Unit)
        assertEquals(RefreshOutcome.Refreshed(s2), waiter.await())
        assertTrue(r.api.calls.isEmpty(), "must not send a refresh with the old token")
        assertEquals(0, r.store.clearCount.get())
    }

    @Test
    fun `race-a store now holds a different user then the refresh is cancelled without clearing or saving`() = runTest {
        val readGate = CompletableDeferred<Unit>()
        val other = TestSessions.user(clock, userId = USER_B, access = "b-access", refresh = "b-refresh")
        val r = rig(StoredSession.User(s1))
        r.store.onRead = { readGate.await() }
        val waiter = async { r.refresher.refresh(s1) }
        waitUntilReadStarted(r.store)
        r.store.current = StoredSession.User(other)
        readGate.complete(Unit)
        assertEquals(RefreshOutcome.Skipped, waiter.await())
        assertTrue(r.api.calls.isEmpty())
        assertTrue(r.store.writes.isEmpty())
        assertEquals(0, r.store.clearCount.get())
        assertEquals(StoredSession.User(other), r.store.current)
    }

    @Test
    fun `race-a store now holds guest or nothing then the refresh is cancelled without clearing`() = runTest {
        for (state in listOf(StoredSession.Guest, StoredSession.None)) {
            val readGate = CompletableDeferred<Unit>()
            val r = rig(StoredSession.User(s1))
            r.store.onRead = { readGate.await() }
            val waiter = async { r.refresher.refresh(s1) }
            waitUntilReadStarted(r.store)
            r.store.current = state
            readGate.complete(Unit)
            assertEquals(RefreshOutcome.Skipped, waiter.await(), "$state")
            assertTrue(r.api.calls.isEmpty(), "$state")
            assertEquals(0, r.store.clearCount.get(), "$state")
            assertTrue(r.store.writes.isEmpty(), "$state")
        }
    }

    @Test
    fun `lesson-b a throwing secure store read is treated as no session and the entry is cleared`() = runTest {
        val r = rig(StoredSession.User(s1))
        r.store.failNextReads(1)
        assertEquals(RefreshOutcome.Skipped, r.refresher.refresh(s1))
        assertEquals(1, r.store.clearCount.get())
        assertTrue(r.api.calls.isEmpty())
    }

    @Test
    fun `TC-NET-027 logout during refresh then the response is not saved and the session is not revived`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeRefreshApi().also { it.gate = gate }
        val r = rig(StoredSession.User(s1), api)
        val waiter = async { r.refresher.refresh(s1) }
        api.started.receive()
        r.store.clear() // user logs out
        gate.complete(Unit)
        assertEquals(RefreshOutcome.Skipped, waiter.await())
        assertTrue(r.store.writes.isEmpty())
        assertEquals(StoredSession.None, r.store.current)
    }

    @Test
    fun `TC-NET-027 account switch during refresh then the old account's tokens are discarded`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeRefreshApi().also { it.gate = gate }
        val b = TestSessions.user(clock, userId = USER_B, access = "b-access", refresh = "b-refresh")
        val r = rig(StoredSession.User(s1), api)
        val waiter = async { r.refresher.refresh(s1) }
        api.started.receive()
        r.store.write(b)
        r.store.writes.clear()
        gate.complete(Unit)
        assertEquals(RefreshOutcome.Skipped, waiter.await())
        assertTrue(r.store.writes.isEmpty())
        assertEquals(StoredSession.User(b), r.store.current)
    }

    @Test
    fun `TC-NET-027 refresh REAUTH arriving after an account switch does not clear the new account`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeRefreshApi(RefreshResult.ReauthenticationRequired).also { it.gate = gate }
        val b = TestSessions.user(clock, userId = USER_B, access = "b-access", refresh = "b-refresh")
        val r = rig(StoredSession.User(s1), api)
        val waiter = async { r.refresher.refresh(s1) }
        api.started.receive()
        r.store.write(b)
        gate.complete(Unit)
        waiter.await()
        assertEquals(StoredSession.User(b), r.store.current)
        assertEquals(0, r.store.clearCount.get())
        assertTrue(r.events.events.isEmpty())
    }

    @Test
    fun `TC-NET-028 cancelling one waiter ends it silently while the refresh continues for the others`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeRefreshApi().also { it.gate = gate }
        val r = rig(StoredSession.User(s1), api)
        val cancelled = launch { r.refresher.refresh(s1) }
        val survivor = async { r.refresher.refresh(s1) }
        api.started.receive()
        cancelled.cancel()
        gate.complete(Unit)
        val outcome = survivor.await() // await before reading the store: the refresh finishes only now
        assertEquals(RefreshOutcome.Refreshed(r.store.storedUser!!), outcome)
        assertTrue(cancelled.isCancelled)
        assertEquals(1, api.calls.size)
        assertEquals("fixture-refresh-token-2", r.store.storedUser!!.refreshToken)
    }

    @Test
    fun `TC-NET-020 REAUTHENTICATION_REQUIRED on a normal api clears the session without calling refresh`() = runTest {
        val r = rig(StoredSession.User(s1))
        assertEquals(RefreshOutcome.ReauthenticationRequired, r.refresher.onReauthenticationRequired(s1))
        assertEquals(StoredSession.None, r.store.current)
        assertEquals(listOf<AuthEvent>(AuthEvent.GoToLogin), r.events.events.toList())
        assertTrue(r.api.calls.isEmpty())
    }

    @Test
    fun `TC-NET-019 a late REAUTHENTICATION_REQUIRED after the token was already refreshed keeps the session`() = runTest {
        val r = rig(StoredSession.User(s2))
        assertEquals(RefreshOutcome.Refreshed(s2), r.refresher.onReauthenticationRequired(s1))
        assertEquals(0, r.store.clearCount.get())
        assertTrue(r.events.events.isEmpty())
        assertTrue(r.api.calls.isEmpty())
    }

    @Test
    fun `TC-NET-019 a late REAUTHENTICATION_REQUIRED for a former account does not clear the current one`() = runTest {
        val b = TestSessions.user(clock, userId = USER_B, access = "b-access", refresh = "b-refresh")
        val r = rig(StoredSession.User(b))
        assertEquals(RefreshOutcome.Skipped, r.refresher.onReauthenticationRequired(s1))
        assertEquals(StoredSession.User(b), r.store.current)
        assertTrue(r.events.events.isEmpty())
    }

    @Test
    fun `TC-NET-057 refresh result of account A is never written into account B's store`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val api = FakeRefreshApi().also { it.gate = gate }
        val b = TestSessions.user(clock, userId = USER_B, access = "b-access", refresh = "b-refresh")
        val r = rig(StoredSession.User(s1), api)
        val waiter = async { r.refresher.refresh(s1) }
        api.started.receive()
        r.store.current = StoredSession.User(b)
        gate.complete(Unit)
        waiter.await()
        assertTrue(r.store.writes.none { it.userId == USER_A })
        assertEquals(StoredSession.User(b), r.store.current)
    }
}
