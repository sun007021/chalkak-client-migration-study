package kr.chalkak.feature.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.NonceGenerator
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.auth.UserDataResetter
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.Session
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Scope for the holders under test: runs on the test scheduler (so `runCurrent`/`advanceUntilIdle`/`advanceTimeBy` drive it)
 * but, unlike `backgroundScope`, counts as foreground work. Detached job: cancel it via [CoroutineScope.cancel] if a test needs to.
 */
fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] into a list for the rest of the test (eager, so no emission is missed). */
@OptIn(ExperimentalCoroutinesApi::class)
fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

fun http(status: Int, code: ErrorCode, message: String? = null) = ApiResult.Failure(ApiError.Http(status, code, message))

fun testSession(clock: FakeClock = FakeClock()) = Session(
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "acc", clock.now().plusSeconds(900), "ref", clock.now().plusSeconds(2_592_000),
)

class ScriptedSocialLoginClient(vararg results: KakaoLoginResult) : SocialLoginClient {
    private val script = ArrayDeque(results.toList())
    val hashedNonces = CopyOnWriteArrayList<String>()
    var gate: CompletableDeferred<Unit>? = null
    private var counter = 0

    override suspend fun requestIdToken(hashedNonce: String): KakaoLoginResult {
        hashedNonces += hashedNonce
        gate?.await()
        return script.removeFirstOrNull() ?: KakaoLoginResult.IdToken("id-token-${++counter}")
    }
}

class CountingNonceGenerator : NonceGenerator {
    private var n = 0
    override fun newRawNonce(): String = "raw-nonce-${++n}"
}

class FakeAuthRepository : AuthRepository {
    val loginCalls = CopyOnWriteArrayList<Pair<String, String>>()
    var logoutCalls = 0
    var withdrawCalls = 0
    var loginResults = ArrayDeque<ApiResult<SocialLoginOutcome>>()
    var withdrawResults = ArrayDeque<ApiResult<Unit>>()
    var loginFailure: Exception? = null
    var loginGate: CompletableDeferred<Unit>? = null
    var withdrawGate: CompletableDeferred<Unit>? = null
    var logoutGate: CompletableDeferred<Unit>? = null

    override suspend fun socialLogin(idToken: String, rawNonce: String): ApiResult<SocialLoginOutcome> {
        loginCalls += idToken to rawNonce
        loginGate?.await()
        loginFailure?.let { throw it }
        return loginResults.removeFirstOrNull() ?: ApiResult.Success(SocialLoginOutcome.LoggedIn(testSession()))
    }

    override suspend fun logout() {
        logoutCalls++
        logoutGate?.await()
    }

    override suspend fun withdraw(): ApiResult<Unit> {
        withdrawCalls++
        withdrawGate?.await()
        return withdrawResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }
}

class RecordingPush : PushRegistrar {
    var calls = 0
    override suspend fun registerCurrentDevice() { calls++ }
}

class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
}

class ScriptedUpdateChecker(vararg results: UpdateCheckResult) : UpdateChecker {
    private val script = ArrayDeque(results.toList())
    var calls = 0
    var failure: Exception? = null
    private var last = UpdateCheckResult.UpToDate

    override suspend fun check(): UpdateCheckResult {
        calls++
        failure?.let { throw it }
        script.removeFirstOrNull()?.let { last = it }
        return last
    }
}

class FakeLauncher(var result: UpdateFlowResult = UpdateFlowResult.Cancelled) : UpdateLauncher {
    var calls = 0
    var gate: CompletableDeferred<Unit>? = null
    override suspend fun launch(): UpdateFlowResult { calls++; gate?.await(); return result }
}

class FakePreloader(var result: PreloadResult = PreloadResult.Ready) : HomePreloader {
    val modes = CopyOnWriteArrayList<HomeMode>()
    var gate: CompletableDeferred<Unit>? = null
    override suspend fun preload(mode: HomeMode): PreloadResult { modes += mode; gate?.await(); return result }
}

fun noopResetter() = UserDataResetter { }

class FakeKakaoSdk(
    var talkAvailable: Boolean = true,
    var talkAvailabilityFails: Boolean = false,
    var talk: KakaoSdkResult = KakaoSdkResult.Success("talk-token"),
    var account: KakaoSdkResult = KakaoSdkResult.Success("account-token"),
) : KakaoSdk {
    val calls = CopyOnWriteArrayList<String>()
    override suspend fun isTalkLoginAvailable(): Boolean {
        if (talkAvailabilityFails) throw IllegalStateException("availability check failed")
        return talkAvailable
    }
    override suspend fun loginWithTalk(hashedNonce: String): KakaoSdkResult { calls += "talk:$hashedNonce"; return talk }
    override suspend fun loginWithAccount(hashedNonce: String): KakaoSdkResult { calls += "account:$hashedNonce"; return account }
}
