package kr.chalkak.feature.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.auth.NonceHasher
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.auth.testing.InMemorySessionStore
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LoginStateHolderTest {
    private class Rig(
        val holder: LoginStateHolder,
        val sdk: ScriptedSocialLoginClient,
        val repo: FakeAuthRepository,
        val guest: InMemorySessionStore,
        val push: RecordingPush,
        val analytics: RecordingAnalytics,
        val effects: List<LoginEffect>,
    ) {
        val error get() = holder.state.value.error
    }

    private fun TestScope.rig(vararg kakao: KakaoLoginResult): Rig {
        val sdk = ScriptedSocialLoginClient(*kakao)
        val repo = FakeAuthRepository()
        val guest = InMemorySessionStore()
        val push = RecordingPush()
        val analytics = RecordingAnalytics()
        val holder = LoginStateHolder(holderScope(), sdk, CountingNonceGenerator(), repo, guest, push, analytics)
        return Rig(holder, sdk, repo, guest, push, analytics, collectAll(holder.effects))
    }

    private fun Rig.failWith(error: ApiError) { repo.loginResults.add(ApiResult.Failure(error)) }

    // ---- happy paths -----------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-004 SDK receives the hashed nonce and the server receives the raw nonce`() = runTest {
        val r = rig()
        r.holder.onKakaoClicked(); advanceUntilIdle()
        val raw = r.repo.loginCalls.single().second
        assertEquals("raw-nonce-1", raw)
        assertEquals(NonceHasher.sha256Hex(raw), r.sdk.hashedNonces.single())
        assertNotEquals(raw, r.sdk.hashedNonces.single())
        assertEquals("id-token-1", r.repo.loginCalls.single().first)
    }

    @Test
    fun `TC-AUTH-008 and TC-BOOT-037 LOGIN_SUCCESS goes home as member and triggers push registration once`() = runTest {
        val r = rig()
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(listOf<LoginEffect>(LoginEffect.GoHome(HomeMode.Member)), r.effects)
        assertEquals(1, r.push.calls)
        assertNull(r.error)
        assertTrue(r.holder.state.value.buttonsEnabled)
    }

    @Test
    fun `TC-AUTH-057 banned member login shows no notice`() = runTest {
        val r = rig()
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertNull(r.error)
        assertEquals(1, r.effects.size)
    }

    @Test
    fun `TC-AUTH-010 SIGN_UP_REQUIRED routes to terms keeping idToken and rawNonce in memory with no push`() = runTest {
        val r = rig()
        r.repo.loginResults.add(ApiResult.Success(SocialLoginOutcome.SignUpRequired))
        r.holder.onKakaoClicked(); advanceUntilIdle()
        val effect = assertIs<LoginEffect.GoTerms>(r.effects.single())
        assertEquals("id-token-1", effect.pending.idToken)
        assertEquals("raw-nonce-1", effect.pending.rawNonce)
        assertEquals(0, r.push.calls)
        assertFalse("id-token-1" in effect.pending.toString() || "raw-nonce-1" in effect.pending.toString())
        assertNull(r.error)
    }

    @Test
    fun `TC-AUTH-010 analytics events never carry tokens or nonces`() = runTest {
        val r = rig()
        r.holder.onScreenShown(); r.holder.onKakaoClicked(); advanceUntilIdle()
        val all = r.analytics.screens.joinToString()
        assertFalse("id-token" in all || "nonce" in all, all)
    }

    // ---- SDK outcomes ----------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-006 a session storage failure while saving the login shows the generic error and re-enables the buttons`() = runTest {
        val r = rig()
        r.repo.loginFailure = IllegalStateException("keystore unavailable")
        r.holder.onKakaoClicked(); runCurrent()
        assertEquals(Copy["auth.login.error.generic"], Copy[r.error!!.copyKey!!])
        assertTrue(r.holder.state.value.buttonsEnabled)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-AUTH-013 user cancel shows no error and re-enables the buttons`() = runTest {
        val r = rig(KakaoLoginResult.Cancelled)
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertNull(r.error)
        assertTrue(r.holder.state.value.buttonsEnabled)
        assertTrue(r.repo.loginCalls.isEmpty())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-AUTH-018 missing idToken shows config copy and calls no server`() = runTest {
        val r = rig(KakaoLoginResult.MissingIdToken)
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(Copy["auth.login.error.config"], Copy[r.error!!.copyKey!!])
        assertTrue(r.repo.loginCalls.isEmpty())
        assertTrue(r.holder.state.value.buttonsEnabled)
    }

    @Test
    fun `TC-AUTH-018 SDK configuration error shows config copy`() = runTest {
        val r = rig(KakaoLoginResult.ConfigError)
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(CopyKeys.LOGIN_ERROR_CONFIG, r.error!!.copyKey)
        assertTrue(r.repo.loginCalls.isEmpty())
    }

    @Test
    fun `TC-AUTH-019 SDK general failure shows kakao failed copy and calls no server`() = runTest {
        val r = rig(KakaoLoginResult.Failed)
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(Copy["auth.login.error.kakao-failed"], Copy[r.error!!.copyKey!!])
        assertTrue(r.repo.loginCalls.isEmpty())
    }

    // ---- server errors ---------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-020 401 shows kakao account copy and the next try uses a new nonce and a new idToken`() = runTest {
        val r = rig()
        r.failWith(ApiError.Http(401, ErrorCode.UNAUTHORIZED, "유효하지 않은 인증 정보입니다."))
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(Copy["auth.login.error.kakao-account"], Copy[r.error!!.copyKey!!])
        r.holder.onErrorShown()
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(2, r.repo.loginCalls.size)
        assertNotEquals(r.repo.loginCalls[0].first, r.repo.loginCalls[1].first)
        assertNotEquals(r.repo.loginCalls[0].second, r.repo.loginCalls[1].second)
        assertNotEquals(r.sdk.hashedNonces[0], r.sdk.hashedNonces[1])
    }

    @Test
    fun `TC-AUTH-021 and TC-AUTH-022 403 shows the server message verbatim`() = runTest {
        for (message in listOf("차단된 소셜 계정입니다.", "탈퇴한 차단 소셜 계정입니다.")) {
            val r = rig()
            r.failWith(ApiError.Http(403, ErrorCode.FORBIDDEN, message))
            r.holder.onKakaoClicked(); advanceUntilIdle()
            assertEquals(message, r.error!!.serverMessage)
            assertNull(r.error!!.copyKey)
            assertEquals(1, r.repo.loginCalls.size)
            assertTrue(r.holder.state.value.buttonsEnabled)
        }
    }

    @Test
    fun `TC-AUTH-023 400 BUSINESS_ERROR and TC-AUTH-024 500 and TC-AUTH-026 502 show the generic copy`() = runTest {
        for (status in listOf(400 to ErrorCode.BUSINESS_ERROR, 500 to ErrorCode.INTERNAL_ERROR, 502 to ErrorCode.BUSINESS_ERROR)) {
            val r = rig()
            r.failWith(ApiError.Http(status.first, status.second))
            r.holder.onKakaoClicked(); advanceUntilIdle()
            assertEquals(Copy["auth.login.error.generic"], Copy[r.error!!.copyKey!!], "status ${status.first}")
            assertEquals(1, r.repo.loginCalls.size)
        }
    }

    @Test
    fun `TC-AUTH-025 network errors show the network copy`() = runTest {
        for (kind in NetworkKind.entries) {
            val r = rig()
            r.failWith(ApiError.Network(kind))
            r.holder.onKakaoClicked(); advanceUntilIdle()
            assertEquals(Copy["auth.login.error.network"], Copy[r.error!!.copyKey!!], "kind $kind")
        }
    }

    @Test
    fun `TC-AUTH-011 and TC-AUTH-012 invalid responses show the invalid response copy`() = runTest {
        val r = rig()
        r.failWith(ApiError.InvalidResponse("unknown status"))
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(Copy["auth.login.error.invalid-response"], Copy[r.error!!.copyKey!!])
        assertEquals(0, r.push.calls)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-AUTH-029 the same error twice gets a different message id`() = runTest {
        val r = rig()
        r.failWith(ApiError.Network(NetworkKind.OFFLINE))
        r.failWith(ApiError.Network(NetworkKind.OFFLINE))
        r.holder.onKakaoClicked(); advanceUntilIdle()
        val first = r.error!!
        r.holder.onErrorShown()
        assertNull(r.error)
        r.holder.onKakaoClicked(); advanceUntilIdle()
        val second = r.error!!
        assertEquals(first.copyKey, second.copyKey)
        assertNotEquals(first.id, second.id)
    }

    @Test
    fun `TC-AUTH-029 an error shown twice without dismissal in between still changes id`() = runTest {
        val r = rig()
        r.failWith(ApiError.Network(NetworkKind.OFFLINE))
        r.failWith(ApiError.Network(NetworkKind.OFFLINE))
        r.holder.onKakaoClicked(); advanceUntilIdle()
        val first = r.error!!
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertNotEquals(first.id, r.error!!.id)
    }

    // ---- busy state, re-entrancy, lifecycle ------------------------------------------------------

    @Test
    fun `TC-AUTH-027 triple tap runs the SDK once and the server once and disables the buttons meanwhile`() = runTest {
        val r = rig()
        r.repo.loginGate = CompletableDeferred()
        r.holder.onKakaoClicked(); r.holder.onKakaoClicked(); r.holder.onKakaoClicked(); runCurrent()
        assertFalse(r.holder.state.value.buttonsEnabled)
        assertTrue(r.holder.state.value.busy)
        assertEquals(1, r.sdk.hashedNonces.size)
        r.repo.loginGate!!.complete(Unit); advanceUntilIdle()
        assertEquals(1, r.repo.loginCalls.size)
        assertTrue(r.holder.state.value.buttonsEnabled)
    }

    @Test
    fun `TC-AUTH-010 buttons stay disabled while the Kakao SDK is running and guest taps are ignored`() = runTest {
        val r = rig()
        r.sdk.gate = CompletableDeferred()
        r.holder.onKakaoClicked(); runCurrent()
        assertFalse(r.holder.state.value.buttonsEnabled)
        r.holder.onGuestClicked(); runCurrent()
        assertEquals(0, r.guest.writes.size + r.effects.size)
        assertEquals(StoredSessionNone, r.guest.current)
        r.sdk.gate!!.complete(Unit); advanceUntilIdle()
    }

    @Test
    fun `TC-AUTH-028 after a finished login the holder accepts a new submission`() = runTest {
        val r = rig()
        r.holder.onKakaoClicked(); advanceUntilIdle()
        r.holder.onKakaoClicked(); advanceUntilIdle()
        assertEquals(2, r.repo.loginCalls.size)
    }

    @Test
    fun `TC-AUTH-030 a late response after a long wait is still processed`() = runTest {
        val r = rig()
        r.repo.loginGate = CompletableDeferred()
        r.holder.onKakaoClicked(); runCurrent()
        advanceTimeBy(60_000)
        r.repo.loginGate!!.complete(Unit); advanceUntilIdle()
        assertEquals(listOf<LoginEffect>(LoginEffect.GoHome(HomeMode.Member)), r.effects)
    }

    @Test
    fun `TC-AUTH-031 leaving the screen mid request yields no effect no error and no push`() = runTest {
        val r = rig()
        r.repo.loginGate = CompletableDeferred()
        r.holder.onKakaoClicked(); runCurrent()
        r.holder.onScreenGone(); runCurrent()
        r.repo.loginGate!!.complete(Unit); advanceUntilIdle()
        assertTrue(r.effects.isEmpty())
        assertNull(r.error)
        assertEquals(0, r.push.calls)
    }

    // ---- guest -----------------------------------------------------------------------------------

    @Test
    fun `TC-AUTH-032 guest tap stores the flag calls no server and goes home as guest`() = runTest {
        val r = rig()
        r.holder.onGuestClicked(); advanceUntilIdle()
        assertEquals(kr.chalkak.core.network.StoredSession.Guest, r.guest.current)
        assertTrue(r.repo.loginCalls.isEmpty())
        assertEquals(0, r.repo.logoutCalls + r.repo.withdrawCalls)
        assertEquals(listOf<LoginEffect>(LoginEffect.GoHome(HomeMode.Guest)), r.effects)
        assertEquals(0, r.push.calls)
    }

    @Test
    fun `TC-AUTH-032 guest flag storage failure stays on login with the guest error copy`() = runTest {
        val r = rig()
        r.guest.guestFailure = IllegalStateException("disk")
        r.holder.onGuestClicked(); advanceUntilIdle()
        assertTrue(r.effects.isEmpty())
        assertEquals(Copy["auth.login.error.guest"], Copy[r.error!!.copyKey!!])
        assertTrue(r.holder.state.value.buttonsEnabled)
    }

    // ---- analytics -------------------------------------------------------------------------------

    @Test
    fun `TC-BOOT-021 showing the login screen sends screen_view login`() = runTest {
        val r = rig()
        r.holder.onScreenShown()
        assertEquals(listOf("login"), r.analytics.screens.toList())
    }

    private val StoredSessionNone get() = kr.chalkak.core.network.StoredSession.None
}
