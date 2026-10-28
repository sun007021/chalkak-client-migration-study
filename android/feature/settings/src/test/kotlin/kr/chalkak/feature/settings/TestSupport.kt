package kr.chalkak.feature.settings

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
import kr.chalkak.core.data.auth.GuestFlagStore
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.onboarding.ExternalBrowser
import java.util.concurrent.CopyOnWriteArrayList

/** Scope for the holders under test: runs on the test scheduler but counts as foreground work. */
fun TestScope.holderScope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

/** Collects [flow] into a list for the rest of the test (eager, so no emission is missed). */
@OptIn(ExperimentalCoroutinesApi::class)
fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
    val out = CopyOnWriteArrayList<T>()
    backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
    return out
}

fun httpFailure(status: Int, code: ErrorCode, message: String? = null) = ApiResult.Failure(ApiError.Http(status, code, message))

fun networkFailure(kind: NetworkKind = NetworkKind.OFFLINE) = ApiResult.Failure(ApiError.Network(kind))

fun invalidResponse() = ApiResult.Failure(ApiError.InvalidResponse("fixture"))

class RecordingAnalytics : AnalyticsTracker {
    val screens = CopyOnWriteArrayList<String>()
    val tabs = CopyOnWriteArrayList<String>()
    override fun screenView(screen: String) { screens += screen }
    override fun bottomNavigationSelected(destination: String) { tabs += destination }
}

class FakeDeviceNotificationSettings(var permission: NotificationPermission = NotificationPermission.Granted) : DeviceNotificationSettings {
    var permissionChecks = 0
    var requests = 0
    var requestGate: CompletableDeferred<Unit>? = null
    var requestAnswer = NotificationPermission.Granted
    var requestFailure: Exception? = null
    override suspend fun requestPermission(): NotificationPermission {
        requests++
        requestGate?.await()
        requestFailure?.let { throw it }
        permission = requestAnswer
        return requestAnswer
    }
    var settingsOpened = 0
    override fun permission(): NotificationPermission { permissionChecks++; return permission }
    override fun openSystemSettings() { settingsOpened++ }
}

/** Only logout and withdraw matter for settings. */
class FakeAuthRepository : AuthRepository {
    var logoutCalls = 0
    var withdrawCalls = 0
    val withdrawResults = ArrayDeque<ApiResult<Unit>>()

    override suspend fun socialLogin(idToken: String, rawNonce: String): ApiResult<SocialLoginOutcome> = error("unused")

    override suspend fun logout() { logoutCalls++ }

    override suspend fun withdraw(): ApiResult<Unit> {
        withdrawCalls++
        return withdrawResults.removeFirstOrNull() ?: ApiResult.Success(Unit)
    }
}

class RecordingGuestFlags : GuestFlagStore {
    var clearCalls = 0
    override suspend fun markGuest() {}
    override suspend fun clearGuest() { clearCalls++ }
}

class FakeBrowser : ExternalBrowser {
    val opened = CopyOnWriteArrayList<String>()
    override fun open(url: String): Boolean { opened += url; return true }
}

fun gate() = CompletableDeferred<Unit>()
