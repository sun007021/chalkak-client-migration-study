package kr.chalkak.feature.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.auth.PersistentSessionStore
import kr.chalkak.core.data.auth.SessionRecord
import kr.chalkak.core.data.auth.testing.InMemorySecureStorage
import kr.chalkak.core.data.auth.testing.RecordingUserDataResetter
import kr.chalkak.core.data.auth.testing.StorageFixture
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BootGateTest {
    private val clock = FakeClock()

    private class Rig(
        val gate: BootGate,
        val push: RecordingPush,
        val preloader: FakePreloader,
        val checker: ScriptedUpdateChecker,
        val launcher: FakeLauncher,
        val resetter: RecordingUserDataResetter,
        val states: List<BootState>,
    )

    private fun TestScope.rig(
        store: SessionStore,
        checker: ScriptedUpdateChecker = ScriptedUpdateChecker(UpdateCheckResult.UpToDate),
        preloader: FakePreloader = FakePreloader(),
        events: kotlinx.coroutines.flow.Flow<AuthEvent> = emptyFlow(),
        clock: FakeClock = this@BootGateTest.clock,
    ): Rig {
        val push = RecordingPush()
        val launcher = FakeLauncher()
        val resetter = RecordingUserDataResetter()
        val gate = BootGate(holderScope(), clock, store, checker, launcher, preloader, push, resetter, events)
        val states = collectAll(gate.state)
        gate.start()
        return Rig(gate, push, preloader, checker, launcher, resetter, states)
    }

    private fun fixtureStore(path: String): Pair<PersistentSessionStore, InMemorySecureStorage> {
        val storage = StorageFixture.load(path).toStorage()
        return PersistentSessionStore(storage) to storage
    }

    // ---- auth gate -------------------------------------------------------------------------------

    @Test
    fun `TC-BOOT-001 no session opens login and home is never shown`() = runTest {
        val (store, _) = fixtureStore("boot/session__empty.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Login(LoginReason.NoSession), r.gate.state.value)
        assertTrue(r.states.none { it is BootState.Home })
        assertTrue(r.preloader.modes.isEmpty())
    }

    @Test
    fun `TC-BOOT-002 valid user session opens member home and starts push registration`() = runTest {
        val (store, _) = fixtureStore("boot/session__authenticated.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Home(HomeMode.Member), r.gate.state.value)
        assertEquals(1, r.push.calls)
        assertTrue(r.states.none { it is BootState.Login })
    }

    @Test
    fun `TC-BOOT-003 guest flag opens guest home with no push registration`() = runTest {
        val (store, _) = fixtureStore("boot/session__guest.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Home(HomeMode.Guest), r.gate.state.value)
        assertEquals(0, r.push.calls)
    }

    @Test
    fun `TC-BOOT-004 expired refresh token clears the session and opens login`() = runTest {
        val (store, storage) = fixtureStore("boot/session__expired-refresh.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Login(LoginReason.NoSession), r.gate.state.value)
        assertEquals(SessionRecord(), storage.record)
        assertEquals(0, r.push.calls)
    }

    @Test
    fun `TC-BOOT-005 refresh expiry at now minus 1s and now is expired and now plus 1s is valid`() = runTest {
        for ((offset, expected) in listOf(
            -1L to BootState.Login(LoginReason.NoSession),
            0L to BootState.Login(LoginReason.NoSession),
            1L to BootState.Home(HomeMode.Member),
        )) {
            val s = Session("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a", clock.now().plusSeconds(900), "r", clock.now().plusSeconds(offset))
            val r = rig(io(StoredSession.User(s)))
            advanceUntilIdle()
            assertEquals(expected, r.gate.state.value, "offset $offset")
        }
    }

    @Test
    fun `TC-BOOT-006 partial credentials open login`() = runTest {
        val (store, storage) = fixtureStore("boot/session__partial.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Login(LoginReason.NoSession), r.gate.state.value)
        assertEquals(SessionRecord(), storage.record)
    }

    @Test
    fun `TC-BOOT-007 undecryptable storage does not crash clears storage and opens login`() = runTest {
        val (store, storage) = fixtureStore("boot/session__corrupted.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Login(LoginReason.NoSession), r.gate.state.value)
        assertEquals(SessionRecord(), storage.record)
        assertFalse(storage.corrupted)
    }

    @Test
    fun `TC-BOOT-008 user session plus guest flag opens member home`() = runTest {
        val (store, _) = fixtureStore("boot/session__authenticated-and-guest.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Home(HomeMode.Member), r.gate.state.value)
        assertEquals(listOf(HomeMode.Member), r.preloader.modes)
    }

    @Test
    fun `TC-BOOT-009 expired access token with valid refresh token still opens home`() = runTest {
        val (store, _) = fixtureStore("boot/session__access-expired.json")
        val r = rig(store)
        advanceUntilIdle()
        assertEquals(BootState.Home(HomeMode.Member), r.gate.state.value)
    }

    private fun io(stored: StoredSession) = kr.chalkak.core.data.auth.testing.InMemorySessionStore(stored)

    // ---- splash timing ---------------------------------------------------------------------------

    private fun memberStore() = fixtureStore("boot/session__authenticated.json").first

    @Test
    fun `TC-BOOT-010 preload finishing at 100ms releases the splash at 100ms`() = runTest {
        val pre = FakePreloader().apply { gate = CompletableDeferred() }
        val r = rig(memberStore(), preloader = pre)
        advanceTimeBy(99); runCurrent()
        assertEquals(BootState.Splash, r.gate.state.value)
        advanceTimeBy(1); pre.gate!!.complete(Unit); runCurrent()
        assertEquals(BootState.Home(HomeMode.Member), r.gate.state.value)
        assertEquals(100L, currentTime)
    }

    @Test
    fun `TC-BOOT-011 unfinished preload keeps splash until 700ms exactly`() = runTest {
        val pre = FakePreloader().apply { gate = CompletableDeferred() }
        val r = rig(memberStore(), preloader = pre)
        advanceTimeBy(699); runCurrent()
        assertEquals(BootState.Splash, r.gate.state.value)
        advanceTimeBy(1); runCurrent()
        assertEquals(BootState.Home(HomeMode.Member), r.gate.state.value)
        advanceTimeBy(1); runCurrent()
        assertEquals(BootState.Home(HomeMode.Member), r.gate.state.value)
    }

    @Test
    fun `TC-BOOT-012 preload failure releases immediately and home opens in error state`() = runTest {
        val r = rig(memberStore(), preloader = FakePreloader(PreloadResult.Failed))
        runCurrent()
        assertEquals(BootState.Home(HomeMode.Member, preloadFailed = true), r.gate.state.value)
        assertEquals(0L, currentTime)
    }

    @Test
    fun `TC-BOOT-013 guest preloads in guest mode with the same 700ms cap`() = runTest {
        val pre = FakePreloader().apply { gate = CompletableDeferred() }
        val r = rig(fixtureStore("boot/session__guest.json").first, preloader = pre)
        advanceTimeBy(699); runCurrent()
        assertEquals(BootState.Splash, r.gate.state.value)
        advanceTimeBy(1); runCurrent()
        assertEquals(BootState.Home(HomeMode.Guest), r.gate.state.value)
        assertEquals(listOf(HomeMode.Guest), pre.modes)
        assertEquals(0, r.push.calls)
    }

    @Test
    fun `TC-BOOT-014 login destination does not wait for or start any preload`() = runTest {
        val pre = FakePreloader().apply { gate = CompletableDeferred() }
        val r = rig(fixtureStore("boot/session__empty.json").first, preloader = pre)
        runCurrent()
        assertEquals(BootState.Login(LoginReason.NoSession), r.gate.state.value)
        assertEquals(0L, currentTime)
        assertTrue(pre.modes.isEmpty())
    }

    @Test
    fun `TC-BOOT-015 while the session is being read the state stays Splash`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val slow = object : SessionStore {
            override suspend fun read(): StoredSession { gate.await(); return StoredSession.None }
            override suspend fun write(session: Session) = Unit
            override suspend fun clear() = Unit
        }
        val r = rig(slow)
        advanceTimeBy(5_000); runCurrent()
        assertEquals(BootState.Splash, r.gate.state.value)
        gate.complete(Unit); runCurrent()
        assertEquals(BootState.Login(LoginReason.NoSession), r.gate.state.value)
    }

    // ---- update gate -----------------------------------------------------------------------------

    @Test
    fun `TC-BOOT-034 required update beats a valid session no home no push no preload`() = runTest {
        val r = rig(memberStore(), checker = ScriptedUpdateChecker(UpdateCheckResult.UpdateRequired))
        advanceUntilIdle()
        assertEquals(BootState.UpdateRequired, r.gate.state.value)
        assertEquals(0, r.push.calls)
        assertTrue(r.preloader.modes.isEmpty())
        assertTrue(r.states.none { it is BootState.Home || it is BootState.Login })
    }

    @Test
    fun `TC-BOOT-035 push navigation is held while the update gate is closed and allowed once home is open`() = runTest {
        val r = rig(memberStore(), checker = ScriptedUpdateChecker(UpdateCheckResult.UpdateRequired))
        advanceUntilIdle()
        assertFalse(r.gate.pushNavigationAllowed.value)
        val open = rig(memberStore())
        advanceUntilIdle()
        assertTrue(open.gate.pushNavigationAllowed.value)
    }

    @Test
    fun `TC-BOOT-023 unavailable check and a throwing checker do not block the app`() = runTest {
        val unavailable = rig(memberStore(), checker = ScriptedUpdateChecker(UpdateCheckResult.Unavailable))
        val throwing = rig(memberStore(), checker = ScriptedUpdateChecker().apply { failure = java.io.IOException("offline") })
        advanceUntilIdle()
        assertEquals(BootState.Home(HomeMode.Member), unavailable.gate.state.value)
        assertEquals(BootState.Home(HomeMode.Member), throwing.gate.state.value)
    }

    @Test
    fun `TC-BOOT-025 and TC-BOOT-027 later recheck that finds a required update closes the gate`() = runTest {
        val r = rig(memberStore(), checker = ScriptedUpdateChecker(UpdateCheckResult.Unavailable, UpdateCheckResult.UpdateRequired))
        advanceUntilIdle()
        assertEquals(BootState.Home(HomeMode.Member), r.gate.state.value)
        r.gate.recheckUpdate(); advanceUntilIdle()
        assertEquals(BootState.UpdateRequired, r.gate.state.value)
    }

    @Test
    fun `TC-BOOT-026 required state survives a failing recheck`() = runTest {
        val checker = ScriptedUpdateChecker(UpdateCheckResult.UpdateRequired, UpdateCheckResult.Unavailable)
        val r = rig(memberStore(), checker = checker)
        advanceUntilIdle()
        r.gate.recheckUpdate(); advanceUntilIdle()
        assertEquals(2, checker.calls)
        assertEquals(BootState.UpdateRequired, r.gate.state.value)
    }

    @Test
    fun `TC-BOOT-029 update button launches the store flow once even when tapped repeatedly`() = runTest {
        val r = rig(memberStore(), checker = ScriptedUpdateChecker(UpdateCheckResult.UpdateRequired))
        advanceUntilIdle()
        r.launcher.gate = CompletableDeferred()
        r.gate.onUpdateClicked(); r.gate.onUpdateClicked(); r.gate.onUpdateClicked(); runCurrent()
        assertEquals(1, r.launcher.calls)
    }

    @Test
    fun `TC-BOOT-031 cancelled or failed update flow keeps the gate closed and can be retried`() = runTest {
        val r = rig(memberStore(), checker = ScriptedUpdateChecker(UpdateCheckResult.UpdateRequired))
        advanceUntilIdle()
        for (result in listOf(UpdateFlowResult.Cancelled, UpdateFlowResult.Failed)) {
            r.launcher.result = result
            r.gate.onUpdateClicked(); advanceUntilIdle()
            assertEquals(BootState.UpdateRequired, r.gate.state.value)
        }
        assertEquals(2, r.launcher.calls)
        assertEquals(0, r.push.calls)
    }

    // ---- re-authentication ----------------------------------------------------------------------

    @Test
    fun `TC-AUTH-056 GoToLogin event moves to login with reauthentication reason and resets account data`() = runTest {
        val events = MutableSharedFlow<AuthEvent>(extraBufferCapacity = 4)
        val r = rig(memberStore(), events = events)
        advanceUntilIdle()
        events.emit(AuthEvent.GoToLogin); advanceUntilIdle()
        assertEquals(BootState.Login(LoginReason.Reauthentication), r.gate.state.value)
        assertEquals(1, r.resetter.count)
    }

    @Test
    fun `TC-AUTH-056 the relay forwards network GoToLogin events`() = runTest {
        val relay = AuthEventRelay()
        val r = rig(memberStore(), events = relay.events)
        advanceUntilIdle()
        relay.onEvent(AuthEvent.GoToLogin); advanceUntilIdle()
        assertEquals(BootState.Login(LoginReason.Reauthentication), r.gate.state.value)
    }

    @Test
    fun `TC-AUTH-056 a GoToLogin event during the splash preload is not overwritten by Home when the preload ends`() = runTest {
        val events = MutableSharedFlow<AuthEvent>(extraBufferCapacity = 4)
        val pre = FakePreloader().apply { gate = CompletableDeferred() }
        val r = rig(memberStore(), preloader = pre, events = events)
        runCurrent()
        events.emit(AuthEvent.GoToLogin); runCurrent()
        assertEquals(BootState.Login(LoginReason.Reauthentication), r.gate.state.value)
        advanceTimeBy(700); runCurrent()
        assertEquals(BootState.Login(LoginReason.Reauthentication), r.gate.state.value)
        assertFalse(r.gate.pushNavigationAllowed.value)
    }
}
