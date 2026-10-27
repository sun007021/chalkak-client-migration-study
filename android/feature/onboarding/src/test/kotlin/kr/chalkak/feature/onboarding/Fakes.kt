package kr.chalkak.feature.onboarding

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.onboarding.testing.signupSession
import kr.chalkak.core.network.ApiResult
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Scope for the holders under test: runs on the test scheduler (so `runCurrent`/`advanceUntilIdle`/`advanceTimeBy` drive it)
 * but, unlike `backgroundScope`, counts as foreground work.
 */
fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] into a list for the rest of the test (eager, so no emission is missed). */
@OptIn(ExperimentalCoroutinesApi::class)
fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
}

class RecordingDeviceRegistrar : DeviceRegistrar {
    var calls = 0
    override suspend fun registerCurrentDevice() { calls++ }
}

class FakeExternalBrowser(var canOpen: Boolean = true, var failure: Exception? = null) : ExternalBrowser {
    val opened = CopyOnWriteArrayList<String>()
    override fun open(url: String): Boolean {
        failure?.let { throw it }
        opened += url
        return canOpen
    }
}

/** Only `socialLogin` matters for signup (already-registered fallback); everything else is unused. */
class FakeAuthRepository : AuthRepository {
    val loginCalls = CopyOnWriteArrayList<Pair<String, String>>()
    val loginResults = ArrayDeque<ApiResult<SocialLoginOutcome>>()
    var loginGate: CompletableDeferred<Unit>? = null

    override suspend fun socialLogin(idToken: String, rawNonce: String): ApiResult<SocialLoginOutcome> {
        loginCalls += idToken to rawNonce
        loginGate?.await()
        return loginResults.removeFirstOrNull() ?: ApiResult.Success(SocialLoginOutcome.LoggedIn(signupSession()))
    }

    override suspend fun logout(): Unit = error("unused")
    override suspend fun withdraw(): ApiResult<Unit> = error("unused")
}

/** Returns deterministic bytes of a chosen size so size-limit tests need no real rendering. */
class FakeEncoder(var size: Int = 100) : SignatureImageEncoder {
    var calls = 0
    var lastStrokes: List<SignatureStroke> = emptyList()
    override fun encode(strokes: List<SignatureStroke>, canvas: CanvasSize): ByteArray {
        calls++
        lastStrokes = strokes
        return ByteArray(size) { 7 }
    }
}

val CANVAS = CanvasSize(width = 400f, height = 200f)

fun stroke(vararg points: Pair<Float, Float>) = SignatureStroke(points.map { SignaturePoint(it.first, it.second) })

fun dot(x: Float = 10f, y: Float = 10f) = stroke(x to y)

fun line(y: Float = 50f) = stroke(10f to y, 100f to y)
