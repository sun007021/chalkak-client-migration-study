package kr.chalkak.feature.auth

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.Clock
import kr.chalkak.core.data.auth.UserDataResetter
import kr.chalkak.core.network.AuthEvent
import kr.chalkak.core.network.AuthEventSink
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession

enum class LoginReason { NoSession, Reauthentication }

sealed interface BootState {
    data object Splash : BootState
    /** Non-dismissible update dialog; nothing behind it is reachable. */
    data object UpdateRequired : BootState
    data class Login(val reason: LoginReason) : BootState
    data class Home(val mode: HomeMode, val preloadFailed: Boolean = false) : BootState
}

/** Bridges [AuthEventSink] (network layer) to a flow the UI layer consumes. Replays nothing; hot. */
class AuthEventRelay : AuthEventSink {
    private val _events = MutableSharedFlow<AuthEvent>(extraBufferCapacity = 16)
    val events: SharedFlow<AuthEvent> = _events
    override fun onEvent(event: AuthEvent) { _events.tryEmit(event) }
}

/**
 * Splash -> update gate -> auth gate (REQ-BOOT-001). Order: update check first (Required stops everything: no push registration,
 * no preload); then session read; Home waits for preload at most [splashMaxMs] (virtual time friendly); Login does not wait.
 */
class BootGate(
    private val scope: CoroutineScope,
    private val clock: Clock,
    private val sessionStore: SessionStore,
    private val updateChecker: UpdateChecker,
    private val updateLauncher: UpdateLauncher,
    private val preloader: HomePreloader,
    private val push: PushRegistrar,
    private val resetter: UserDataResetter,
    private val authEvents: Flow<AuthEvent>,
    private val splashMaxMs: Long = AppConstants.SPLASH_PRELOAD_MAX_MS,
) {
    private val _state = MutableStateFlow<BootState>(BootState.Splash)
    val state: StateFlow<BootState> = _state.asStateFlow()

    private val _pushNavigationAllowed = MutableStateFlow(false)

    /** True only while Home is open: push-tap navigation is held back otherwise (TC-BOOT-035). */
    val pushNavigationAllowed: StateFlow<Boolean> = _pushNavigationAllowed.asStateFlow()

    // All state below is touched only on [scope]'s dispatcher (main in production).
    private var updateRequired = false
    private var updateJob: Job? = null

    fun start() {
        // UNDISPATCHED: subscribe before start() returns so an event emitted right after start() is not missed.
        scope.launch(start = CoroutineStart.UNDISPATCHED) { authEvents.collect { if (it == AuthEvent.GoToLogin) onReauthenticationRequired() } }
        scope.launch(start = CoroutineStart.UNDISPATCHED) {
            if (checkUpdate() == UpdateCheckResult.UpdateRequired) closeForUpdate() else routeBySession()
        }
    }

    /** Online again / app foregrounded: re-run the update check. Required is sticky even if the re-check is Unavailable. */
    fun recheckUpdate() {
        scope.launch(start = CoroutineStart.UNDISPATCHED) { if (checkUpdate() == UpdateCheckResult.UpdateRequired) closeForUpdate() }
    }

    /** Dialog button. Concurrent clicks launch once; Cancelled/Failed keep the gate closed. */
    fun onUpdateClicked() {
        if (updateJob?.isActive == true) return
        updateJob = scope.launch(start = CoroutineStart.UNDISPATCHED) { guarded(Unit) { updateLauncher.launch() } }
    }

    private suspend fun checkUpdate(): UpdateCheckResult = guarded(UpdateCheckResult.Unavailable) { updateChecker.check() }

    private fun closeForUpdate() {
        updateRequired = true
        publish(BootState.UpdateRequired)
    }

    private suspend fun onReauthenticationRequired() {
        resetter.resetAll()
        if (!updateRequired) publish(BootState.Login(LoginReason.Reauthentication))
    }

    private suspend fun routeBySession() {
        val stored = readSession()
        val mode = when (stored) {
            StoredSession.None -> null
            StoredSession.Guest -> HomeMode.Guest
            is StoredSession.User ->
                if (stored.session.refreshExpiresAt.isAfter(clock.now())) HomeMode.Member else expire()
        }
        if (mode == null || updateRequired) {
            publishFromSplash(BootState.Login(LoginReason.NoSession))
            return
        }
        if (mode == HomeMode.Member) scope.launch(start = CoroutineStart.UNDISPATCHED) { guarded(Unit) { push.registerCurrentDevice() } }
        val preload = withTimeoutOrNull(splashMaxMs) { guarded(PreloadResult.Failed) { preloader.preload(mode) } }
        publishFromSplash(BootState.Home(mode, preloadFailed = preload == PreloadResult.Failed))
    }

    /** The routing result only applies while still on Splash: a re-authentication or update gate that won the race stays. */
    private fun publishFromSplash(next: BootState) {
        if (_state.value == BootState.Splash) publish(next)
    }

    private suspend fun expire(): HomeMode? {
        guarded(Unit) { sessionStore.clear() }
        return null
    }

    /** A throwing store means "no session": the broken entry is cleared (REQ-BOOT-007). */
    private suspend fun readSession(): StoredSession = try {
        sessionStore.read()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        guarded(Unit) { sessionStore.clear() }
        StoredSession.None
    }

    private fun publish(next: BootState) {
        _state.value = next
        _pushNavigationAllowed.value = next is BootState.Home
    }

    private suspend fun <T> guarded(fallback: T, block: suspend () -> T): T = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        fallback
    }
}
