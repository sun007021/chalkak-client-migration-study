package kr.chalkak.feature.notification

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kr.chalkak.core.data.notification.AccessTokenClaims
import kr.chalkak.core.data.notification.PushDeviceRepository
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.RefreshOutcome
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.SessionStore
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.guardedApiCall
import kr.chalkak.feature.auth.PushRegistrar
import kr.chalkak.feature.onboarding.DeviceRegistrar

/**
 * One place that registers this device for push (REQ-PUSH-007..016). It IS the [PushRegistrar] BootGate/LoginStateHolder call and
 * the [DeviceRegistrar] SignupStateHolder calls (same `registerCurrentDevice()`), so login, signup, app start and foreground all
 * share one dedupe and one serialization. Never throws except for coroutine cancellation; never shows an error.
 *
 * Per attempt (all under one mutex, REQ-PUSH-009):
 *  1. session must be a signed-in member (guest / none / throwing store -> nothing; a suspended member still registers);
 *  2. token = last token handed over by [onNewToken], else [FcmTokenSource.currentToken]; null or blank -> nothing;
 *  3. the same (userId, token) already registered successfully in this process -> nothing;
 *  4. access token without `session_id` -> [SessionRefresher.refresh] once; only a Refreshed session whose token now has
 *     `session_id` goes on, everything else -> nothing (login is kept; the refresher handled REAUTH);
 *  5. [PushDeviceRepository.register]; success is remembered, any failure is forgotten (next trigger retries).
 */
class PushRegistrationCoordinator(
    private val sessionStore: SessionStore,
    private val tokens: FcmTokenSource,
    private val devices: PushDeviceRepository,
    private val refresher: SessionRefresher,
) : PushRegistrar, DeviceRegistrar {
    private val lock = Mutex()
    private var handedOverToken: String? = null
    private var registered: Pair<String, String>? = null

    override suspend fun registerCurrentDevice() {
        lock.withLock { attempt() }
    }

    /** FCM `onNewToken`: remember [token] (even while logged out) and try to register with it. */
    suspend fun onNewToken(token: String) {
        lock.withLock {
            if (token.isNotBlank()) handedOverToken = token
            attempt()
        }
    }

    /** Logout / account switch: forget which (userId, token) pairs were registered. The last FCM token itself is kept. */
    suspend fun reset() {
        lock.withLock { registered = null }
    }

    private suspend fun attempt() {
        val session = memberSession() ?: return
        val token = currentToken() ?: return
        val key = session.userId to token
        if (registered == key) return
        val ready = sessionWithSessionId(session) ?: return
        if (send(token)) registered = ready.userId to token
    }

    private suspend fun memberSession(): Session? = try {
        (sessionStore.read() as? StoredSession.User)?.session
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }

    private suspend fun currentToken(): String? {
        val token = handedOverToken ?: guardedToken()
        return token?.takeIf { it.isNotBlank() }
    }

    private suspend fun guardedToken(): String? = try {
        tokens.currentToken()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }

    /** The session to register with: refreshed first when its access token lacks `session_id` (REQ-PUSH-010). Null = do not register. */
    private suspend fun sessionWithSessionId(session: Session): Session? {
        if (AccessTokenClaims.hasSessionId(session.accessToken)) return session
        val outcome = try {
            refresher.refresh(session)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            return null
        }
        val refreshed = (outcome as? RefreshOutcome.Refreshed)?.session ?: return null
        return refreshed.takeIf { AccessTokenClaims.hasSessionId(it.accessToken) }
    }

    private suspend fun send(token: String): Boolean =
        guardedApiCall("push device registration") { devices.register(token) } is ApiResult.Success
}
