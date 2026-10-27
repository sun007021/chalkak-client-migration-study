package kr.chalkak.feature.auth

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class KakaoSocialLoginClientTest {
    private suspend fun run(sdk: FakeKakaoSdk) = KakaoSocialLoginClient(sdk).requestIdToken("hash")

    @Test
    fun `TC-AUTH-014 Talk login is used first when available`() = runTest {
        val sdk = FakeKakaoSdk()
        assertEquals(KakaoLoginResult.IdToken("talk-token"), run(sdk))
        assertEquals(listOf("talk:hash"), sdk.calls)
    }

    @Test
    fun `TC-AUTH-015 Talk failure other than cancel falls back to account login`() = runTest {
        val sdk = FakeKakaoSdk(talk = KakaoSdkResult.Error)
        assertEquals(KakaoLoginResult.IdToken("account-token"), run(sdk))
        assertEquals(listOf("talk:hash", "account:hash"), sdk.calls)
    }

    @Test
    fun `TC-AUTH-016 user cancel on Talk does not fall back`() = runTest {
        val sdk = FakeKakaoSdk(talk = KakaoSdkResult.Cancelled)
        assertEquals(KakaoLoginResult.Cancelled, run(sdk))
        assertEquals(listOf("talk:hash"), sdk.calls)
    }

    @Test
    fun `TC-AUTH-017 Talk not installed or availability check failing uses account login`() = runTest {
        val notInstalled = FakeKakaoSdk(talkAvailable = false)
        assertEquals(KakaoLoginResult.IdToken("account-token"), run(notInstalled))
        assertEquals(listOf("account:hash"), notInstalled.calls)
        val failing = FakeKakaoSdk(talkAvailabilityFails = true)
        assertEquals(KakaoLoginResult.IdToken("account-token"), run(failing))
        assertEquals(listOf("account:hash"), failing.calls)
    }

    @Test
    fun `TC-AUTH-013 account login cancel is Cancelled`() = runTest {
        assertEquals(KakaoLoginResult.Cancelled, run(FakeKakaoSdk(talkAvailable = false, account = KakaoSdkResult.Cancelled)))
    }

    @Test
    fun `TC-AUTH-018 SDK success without idToken is MissingIdToken`() = runTest {
        assertEquals(KakaoLoginResult.MissingIdToken, run(FakeKakaoSdk(talk = KakaoSdkResult.Success(null))))
    }

    @Test
    fun `TC-AUTH-018 SDK configuration error maps to ConfigError`() = runTest {
        assertEquals(KakaoLoginResult.ConfigError, run(FakeKakaoSdk(talkAvailable = false, account = KakaoSdkResult.ConfigError)))
    }

    @Test
    fun `TC-AUTH-019 account login general failure is Failed`() = runTest {
        assertEquals(KakaoLoginResult.Failed, run(FakeKakaoSdk(talkAvailable = false, account = KakaoSdkResult.Error)))
    }
}

class UpdateCheckerTest {
    @Test
    fun `TC-BOOT-030 priority 1 or more is required and 0 passes`() = runTest {
        assertEquals(UpdateCheckResult.UpdateRequired, PlayUpdateChecker { 1 }.check())
        assertEquals(UpdateCheckResult.UpdateRequired, PlayUpdateChecker { 5 }.check())
        assertEquals(UpdateCheckResult.UpToDate, PlayUpdateChecker { 0 }.check())
    }

    @Test
    fun `TC-BOOT-023 unreadable Play info or exception is Unavailable`() = runTest {
        assertEquals(UpdateCheckResult.Unavailable, PlayUpdateChecker { null }.check())
        assertEquals(UpdateCheckResult.Unavailable, PlayUpdateChecker { throw java.io.IOException("offline") }.check())
    }

    @Test
    fun `TC-BOOT-032 disabled config passes without calling the delegate`() = runTest {
        val delegate = ScriptedUpdateChecker(UpdateCheckResult.UpdateRequired)
        assertEquals(UpdateCheckResult.UpToDate, ConfiguredUpdateChecker(enabled = false, delegate = delegate).check())
        assertEquals(0, delegate.calls)
    }

    @Test
    fun `TC-BOOT-032 enabled config delegates`() = runTest {
        val delegate = ScriptedUpdateChecker(UpdateCheckResult.UpdateRequired)
        assertIs<UpdateCheckResult>(ConfiguredUpdateChecker(enabled = true, delegate = delegate).check())
        assertEquals(1, delegate.calls)
    }
}
