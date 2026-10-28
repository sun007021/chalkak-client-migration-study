package kr.chalkak.feature.notification

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.auth.testing.EventLog
import kr.chalkak.core.data.notification.PushDeviceRepository
import kr.chalkak.core.data.notification.testing.FakePushDeviceRepository
import kr.chalkak.core.data.notification.testing.httpFail
import kr.chalkak.core.data.notification.testing.offlineFail
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.RefreshOutcome
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.FakeSessionStore
import kr.chalkak.feature.auth.PushRegistrar
import kr.chalkak.feature.onboarding.DeviceRegistrar
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Device registration rules (REQ-PUSH-007..016) with fake token source, session store, refresher and device API. */
class PushRegistrationTest {
    private class Rig(
        val store: FakeSessionStore,
        val tokens: FakeFcmTokenSource,
        val devices: FakePushDeviceRepository,
        val refresher: ScriptedRefresher,
        val log: EventLog,
        val coordinator: PushRegistrationCoordinator,
    )

    private fun rig(stored: StoredSession = member(), token: String? = "fcm-token-1"): Rig {
        val log = EventLog()
        val store = FakeSessionStore(stored)
        val tokens = FakeFcmTokenSource(token)
        val devices = FakePushDeviceRepository(log)
        val refresher = ScriptedRefresher(store, log)
        return Rig(store, tokens, devices, refresher, log, PushRegistrationCoordinator(store, tokens, devices, refresher))
    }

    // ---- when to register ---------------------------------------------------------------------

    @Test
    fun `TC-PUSH-012 a signed-in member with a token registers that token once`() = runTest {
        val r = rig()
        r.coordinator.registerCurrentDevice()
        assertEquals(listOf("fcm-token-1"), r.devices.tokens.toList())
    }

    @Test
    fun `TC-PUSH-013 the same coordinator serves login, signup and boot through the existing ports`() = runTest {
        val r = rig()
        val signup: DeviceRegistrar = r.coordinator
        val login: PushRegistrar = r.coordinator
        signup.registerCurrentDevice()
        login.registerCurrentDevice()
        assertEquals(1, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-013 a fresh signup session registers one time for the new account`() = runTest {
        val r = rig(StoredSession.None)
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.devices.tokens.size)
        r.store.current = member(USER_B)
        (r.coordinator as DeviceRegistrar).registerCurrentDevice()
        assertEquals(1, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-014 starting the app already signed in registers once`() = runTest {
        val r = rig()
        (r.coordinator as PushRegistrar).registerCurrentDevice()
        assertEquals(1, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-015 a refreshed FCM token registers the new value`() = runTest {
        val r = rig()
        r.coordinator.registerCurrentDevice()
        r.coordinator.onNewToken("fcm-token-2")
        assertEquals(listOf("fcm-token-1", "fcm-token-2"), r.devices.tokens.toList())
    }

    @Test
    fun `TC-PUSH-015 the newest token wins when onNewToken fires twice`() = runTest {
        val r = rig()
        r.coordinator.onNewToken("fcm-token-2")
        r.coordinator.onNewToken("fcm-token-3")
        r.coordinator.registerCurrentDevice()
        assertEquals(listOf("fcm-token-2", "fcm-token-3"), r.devices.tokens.toList())
    }

    @Test
    fun `TC-PUSH-016 a token that arrives before login is not sent, and is registered after login`() = runTest {
        val r = rig(StoredSession.None, token = null)
        r.coordinator.onNewToken("fcm-token-1")
        assertEquals(0, r.devices.tokens.size)
        r.store.current = member()
        r.coordinator.registerCurrentDevice()
        assertEquals(listOf("fcm-token-1"), r.devices.tokens.toList())
        assertEquals(0, r.tokens.calls)
    }

    @Test
    fun `TC-PUSH-017 a guest never registers`() = runTest {
        val r = rig(StoredSession.Guest)
        r.coordinator.onNewToken("fcm-token-1")
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.devices.tokens.size)
        assertEquals(0, r.refresher.calls.size)
    }

    @Test
    fun `TC-PUSH-013 a logged-out device and a throwing session store never register and never throw`() = runTest {
        val loggedOut = rig(StoredSession.None)
        loggedOut.coordinator.registerCurrentDevice()
        assertEquals(0, loggedOut.devices.tokens.size)
        val broken = rig()
        broken.store.failNextReads(1)
        broken.coordinator.registerCurrentDevice()
        assertEquals(0, broken.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-018 without any token nothing is sent, and the token that arrives later is registered`() = runTest {
        val r = rig(token = null)
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.devices.tokens.size)
        r.coordinator.onNewToken("fcm-token-1")
        assertEquals(listOf("fcm-token-1"), r.devices.tokens.toList())
    }

    @Test
    fun `TC-PUSH-019 with no handed-over token the current SDK token is looked up and registered`() = runTest {
        val r = rig(token = "sdk-token")
        r.coordinator.registerCurrentDevice()
        assertEquals(1, r.tokens.calls)
        assertEquals(listOf("sdk-token"), r.devices.tokens.toList())
    }

    @Test
    fun `TC-PUSH-031 an empty or blank token never produces a request`() = runTest {
        val r = rig(token = "")
        r.coordinator.registerCurrentDevice()
        r.coordinator.onNewToken("")
        r.coordinator.onNewToken("   ")
        assertEquals(0, r.devices.tokens.size)
    }

    // ---- dedupe and serialization ---------------------------------------------------------------

    @Test
    fun `TC-PUSH-020 repeated triggers for the same user and token send one request`() = runTest {
        val r = rig()
        repeat(3) { r.coordinator.registerCurrentDevice() }
        r.coordinator.onNewToken("fcm-token-1")
        assertEquals(1, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-021 session change, foreground and token refresh at once are serialized into one request`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.devices.gates += gate
        val jobs = listOf(
            launch { r.coordinator.registerCurrentDevice() },
            launch { r.coordinator.onNewToken("fcm-token-1") },
            launch { r.coordinator.registerCurrentDevice() },
        )
        runCurrent()
        assertEquals(1, r.devices.tokens.size)
        gate.complete(Unit)
        advanceUntilIdle()
        jobs.forEach { assertTrue(it.isCompleted) }
        assertEquals(1, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-032 another account on the same token registers again`() = runTest {
        val r = rig(member(USER_A))
        r.coordinator.registerCurrentDevice()
        r.store.current = member(USER_B)
        r.coordinator.registerCurrentDevice()
        assertEquals(listOf("fcm-token-1", "fcm-token-1"), r.devices.tokens.toList())
    }

    @Test
    fun `TC-PUSH-032 after reset the same account and token register again (logout then login)`() = runTest {
        val r = rig()
        r.coordinator.registerCurrentDevice()
        r.coordinator.reset()
        r.coordinator.registerCurrentDevice()
        assertEquals(2, r.devices.tokens.size)
    }

    // ---- session_id --------------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-022 a token with session_id registers without any refresh`() = runTest {
        val r = rig(member(accessToken = JwtTokens.withSessionId))
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.refresher.calls.size)
        assertEquals(1, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-023 a token without session_id is refreshed first and then registered with the new token`() = runTest {
        val r = rig(member(accessToken = JwtTokens.withoutSessionId))
        r.coordinator.registerCurrentDevice()
        assertEquals(1, r.refresher.calls.size)
        assertEquals(JwtTokens.withSessionId, r.store.storedUser?.accessToken)
        assertEquals(listOf("refresh", "register:fcm-token-1"), r.log.entries.toList())
    }

    @Test
    fun `TC-PUSH-024 a refreshed token that still has no session_id sends no request and keeps the login`() = runTest {
        val r = rig(member(accessToken = JwtTokens.withoutSessionId))
        r.refresher.outcomes += RefreshOutcome.Refreshed(memberSession(accessToken = JwtTokens.withoutSessionId))
        r.coordinator.registerCurrentDevice()
        assertEquals(1, r.refresher.calls.size)
        assertEquals(0, r.devices.tokens.size)
        assertEquals(0, r.store.clearCount.get())
        assertTrue(r.store.current is StoredSession.User)
    }

    @Test
    fun `TC-PUSH-025 a refresh that needs re-authentication sends no request (the refresher already cleared the session)`() = runTest {
        val r = rig(member(accessToken = JwtTokens.withoutSessionId))
        r.refresher.outcomes += RefreshOutcome.ReauthenticationRequired
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.devices.tokens.size)
        assertEquals(1, r.refresher.calls.size)
    }

    @Test
    fun `TC-PUSH-025 a failed or skipped refresh sends no request and does not throw`() = runTest {
        val r = rig(member(accessToken = JwtTokens.withoutSessionId))
        r.refresher.outcomes += RefreshOutcome.Failed(kr.chalkak.core.network.ApiError.Network(kr.chalkak.core.network.NetworkKind.OFFLINE))
        r.refresher.outcomes += RefreshOutcome.Skipped
        r.coordinator.registerCurrentDevice()
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.devices.tokens.size)
        assertEquals(2, r.refresher.calls.size)
    }

    // ---- failures ---------------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-029 a rejected registration keeps the login, raises nothing, and the next trigger tries again`() = runTest {
        val r = rig()
        r.devices.results += httpFail(400, ErrorCode.BUSINESS_ERROR)
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.store.clearCount.get())
        assertEquals(1, r.devices.tokens.size)
        r.coordinator.registerCurrentDevice()
        assertEquals(2, r.devices.tokens.size)
        r.coordinator.registerCurrentDevice()
        assertEquals(2, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-028 a REAUTHENTICATION_REQUIRED answer is left to the network layer (no extra refresh, clear or resend)`() = runTest {
        val r = rig()
        r.devices.results += httpFail(401, ErrorCode.REAUTHENTICATION_REQUIRED)
        r.coordinator.registerCurrentDevice()
        assertEquals(0, r.refresher.calls.size)
        assertEquals(0, r.store.clearCount.get())
        assertEquals(1, r.devices.tokens.size)
    }

    @Test
    fun `TC-PUSH-030 a network failure is not remembered as registered, the next trigger retries`() = runTest {
        val r = rig()
        r.devices.results += offlineFail()
        r.coordinator.registerCurrentDevice()
        r.coordinator.onNewToken("fcm-token-1")
        assertEquals(2, r.devices.tokens.size)
        r.coordinator.registerCurrentDevice()
        assertEquals(2, r.devices.tokens.size)
    }

    // ---- logout ------------------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-035 the device API has a registration call only, so logout and withdrawal cannot unregister`() {
        assertEquals(listOf("register"), PushDeviceRepository::class.java.declaredMethods.map { it.name })
    }
}
