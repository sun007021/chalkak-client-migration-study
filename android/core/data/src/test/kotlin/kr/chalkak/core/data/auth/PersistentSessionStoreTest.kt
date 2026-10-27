package kr.chalkak.core.data.auth

import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.auth.testing.InMemorySecureStorage
import kr.chalkak.core.data.auth.testing.StorageFixture
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.StoredSession
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertTrue

class PersistentSessionStoreTest {
    private fun store(fixture: String): Pair<PersistentSessionStore, InMemorySecureStorage> {
        val storage = StorageFixture.load(fixture).toStorage()
        return PersistentSessionStore(storage) to storage
    }

    @Test
    fun `TC-BOOT-001 empty storage reads as None`() = runTest {
        assertEquals(StoredSession.None, store("boot/session__empty.json").first.read())
    }

    @Test
    fun `TC-BOOT-002 userId and tokens read as a User session`() = runTest {
        val s = assertIs<StoredSession.User>(store("boot/session__authenticated.json").first.read()).session
        assertEquals("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", s.userId)
        assertEquals("fixture-refresh-token-1", s.refreshToken)
        assertEquals(Instant.parse("2026-11-26T03:00:00Z"), s.refreshExpiresAt)
    }

    @Test
    fun `TC-BOOT-003 guest flag alone reads as Guest`() = runTest {
        assertEquals(StoredSession.Guest, store("boot/session__guest.json").first.read())
    }

    @Test
    fun `TC-BOOT-006 partial credentials are wiped and read as None`() = runTest {
        val (store, storage) = store("boot/session__partial.json")
        assertEquals(StoredSession.None, store.read())
        assertEquals(1, storage.wipeCount)
        assertEquals(SessionRecord(), storage.record)
    }

    @Test
    fun `TC-BOOT-007 undecryptable storage throws from read so the caller can clear`() = runTest {
        val (store, storage) = store("boot/session__corrupted.json")
        assertFailsWith<IllegalStateException> { store.read() }
        store.clear()
        assertEquals(SessionRecord(), storage.record)
        assertEquals(StoredSession.None, store.read())
    }

    @Test
    fun `TC-BOOT-008 user session wins over a lingering guest flag`() = runTest {
        assertIs<StoredSession.User>(store("boot/session__authenticated-and-guest.json").first.read())
    }

    @Test
    fun `TC-AUTH-052 six values round trip through write and read`() = runTest {
        val storage = InMemorySecureStorage()
        val store = PersistentSessionStore(storage)
        val clock = FakeClock()
        val session = Session("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "acc", clock.now().plusSeconds(900), "ref", clock.now().plusSeconds(2_592_000))
        store.write(session)
        assertEquals(StoredSession.User(session), store.read())
        assertEquals(session.accessToken, storage.record.accessToken)
        assertEquals(session.accessExpiresAt, storage.record.accessTokenExpiresAt)
        assertEquals(session.refreshExpiresAt, storage.record.refreshTokenExpiresAt)
        assertEquals(false, storage.record.guest)
    }

    @Test
    fun `TC-AUTH-034 writing a user session removes the guest flag`() = runTest {
        val (store, storage) = store("boot/session__guest.json")
        val clock = FakeClock()
        store.write(Session("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a", clock.now().plusSeconds(1), "r", clock.now().plusSeconds(2)))
        assertEquals(false, storage.record.guest)
        assertIs<StoredSession.User>(store.read())
    }

    @Test
    fun `TC-AUTH-032 markGuest wipes credentials and persists the flag across a new store instance`() = runTest {
        val (store, storage) = store("boot/session__authenticated.json")
        store.markGuest()
        assertEquals(null, storage.record.refreshToken)
        assertEquals(null, storage.record.userId)
        assertEquals(StoredSession.Guest, PersistentSessionStore(storage).read())
    }

    @Test
    fun `TC-AUTH-033 clearGuest removes the flag`() = runTest {
        val (store, _) = store("boot/session__guest.json")
        store.clearGuest()
        assertEquals(StoredSession.None, store.read())
    }

    @Test
    fun `TC-AUTH-052 clear wipes everything including the guest flag`() = runTest {
        val (store, storage) = store("boot/session__authenticated-and-guest.json")
        store.clear()
        assertTrue(storage.record == SessionRecord())
    }
}
