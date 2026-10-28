package com.stonefive.chalkak.di

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession
import org.junit.Test
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNull

@OptIn(ExperimentalCoroutinesApi::class)
class UserTrackingSessionStoreTest {
    private fun session(userId: String) = Session(userId, "a", Instant.EPOCH, "r", Instant.EPOCH)

    private class FakeStore(var stored: StoredSession = StoredSession.None) : SessionStore {
        var gate: CompletableDeferred<Unit>? = null
        override suspend fun read(): StoredSession {
            val snapshot = stored
            gate?.await()
            return snapshot
        }
        override suspend fun write(session: Session) { stored = StoredSession.User(session) }
        override suspend fun clear() { stored = StoredSession.None }
    }

    @Test
    fun `read write and clear keep the user id`() = runTest {
        val store = UserTrackingSessionStore(FakeStore(StoredSession.User(session("u1"))))
        assertNull(store.userId)
        store.read()
        assertEquals("u1", store.userId)
        store.write(session("u2"))
        assertEquals("u2", store.userId)
        store.clear()
        assertNull(store.userId)
    }

    @Test
    fun `a read that started before a clear does not bring the old user back`() = runTest(UnconfinedTestDispatcher()) {
        val fake = FakeStore(StoredSession.User(session("u1")))
        val store = UserTrackingSessionStore(fake)
        fake.gate = CompletableDeferred()
        val reading = launch { store.read() }
        store.clear()
        fake.gate!!.complete(Unit)
        reading.join()
        assertNull(store.userId)
    }

    @Test
    fun `a read that started before a write does not replace the new user`() = runTest(UnconfinedTestDispatcher()) {
        val fake = FakeStore(StoredSession.None)
        val store = UserTrackingSessionStore(fake)
        fake.gate = CompletableDeferred()
        val reading = launch { store.read() }
        store.write(session("u2"))
        fake.gate!!.complete(Unit)
        reading.join()
        assertEquals("u2", store.userId)
    }
}
