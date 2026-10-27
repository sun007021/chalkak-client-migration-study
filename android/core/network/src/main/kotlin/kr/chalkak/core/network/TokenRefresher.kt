package kr.chalkak.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kr.chalkak.core.common.Clock

sealed interface RefreshOutcome {
    /** Fresh session is stored (by this call, or by an earlier refresh that this call reused). */
    data class Refreshed(val session: Session) : RefreshOutcome
    /** Session cleared and [AuthEvent.GoToLogin] emitted. */
    data object ReauthenticationRequired : RefreshOutcome
    /** Only this request fails; session untouched. */
    data class Failed(val error: ApiError) : RefreshOutcome
    /** Store changed to another user / guest / nothing: no refresh sent, nothing cleared, nothing saved. */
    data object Skipped : RefreshOutcome
}

/**
 * Single-flight token refresh (D-17).
 * The refresh runs in [scope] (not in the first caller's coroutine), so cancelling one waiter never aborts it.
 *
 * Inside the single-flight section, immediately before sending, the store is re-read:
 *  - refresh token differs from [sent]'s -> return the stored session, no network (TC-NET-016, race lesson (a));
 *  - different user / Guest / None -> [RefreshOutcome.Skipped];
 *  - read throws -> treated as None and the entry is cleared (lesson (b)).
 * After the response, the result is saved only if the store still holds the same [sent] session (TC-NET-027).
 *
 * Callers queue on one mutex, so a caller that arrives while a refresh is running finds the rotated token
 * in the store afterwards and reuses it without a network call.
 */
class TokenRefresher(
    private val sessionStore: SessionStore,
    private val api: RefreshApi,
    private val clock: Clock,
    private val scope: CoroutineScope,
    private val events: AuthEventSink,
) {
    private val singleFlight = Mutex()

    /** What the store holds relative to the session a request was sent with. */
    private sealed interface StoreView {
        data object Same : StoreView
        data class Newer(val session: Session) : StoreView
        data object Other : StoreView
    }

    suspend fun refresh(sent: Session): RefreshOutcome = inScope { doRefresh(sent) }

    /**
     * A request got `401 REAUTHENTICATION_REQUIRED` (TC-NET-018/019/020): no refresh call.
     * If the store already holds a different refresh token for the same user -> Refreshed(stored) (late response).
     * Otherwise clear the session, emit GoToLogin -> ReauthenticationRequired.
     */
    suspend fun onReauthenticationRequired(sent: Session): RefreshOutcome = inScope { reauthenticate(sent) }

    private suspend fun inScope(block: suspend () -> RefreshOutcome): RefreshOutcome =
        scope.async { singleFlight.withLock { guarded(block) } }.await()

    private suspend fun guarded(block: suspend () -> RefreshOutcome): RefreshOutcome = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        RefreshOutcome.Failed(ApiError.InvalidResponse("session store failure: ${e::class.simpleName}"))
    }

    private suspend fun doRefresh(sent: Session): RefreshOutcome {
        val view = view(sent)
        if (view is StoreView.Newer) return RefreshOutcome.Refreshed(view.session)
        if (view is StoreView.Other) return RefreshOutcome.Skipped
        return when (val result = api.refresh(sent.refreshToken)) {
            is RefreshResult.Success -> when (val after = view(sent)) {
                StoreView.Same -> {
                    val session = result.tokens.toSession(sent.userId, clock)
                    sessionStore.write(session)
                    RefreshOutcome.Refreshed(session)
                }
                is StoreView.Newer -> RefreshOutcome.Refreshed(after.session)
                StoreView.Other -> RefreshOutcome.Skipped
            }
            RefreshResult.ReauthenticationRequired -> reauthenticate(sent)
            is RefreshResult.Failed -> RefreshOutcome.Failed(result.error)
        }
    }

    private suspend fun reauthenticate(sent: Session): RefreshOutcome = when (val view = view(sent)) {
        StoreView.Same -> {
            sessionStore.clear()
            events.onEvent(AuthEvent.GoToLogin)
            RefreshOutcome.ReauthenticationRequired
        }
        is StoreView.Newer -> RefreshOutcome.Refreshed(view.session)
        StoreView.Other -> RefreshOutcome.Skipped
    }

    private suspend fun view(sent: Session): StoreView {
        val stored = try {
            sessionStore.read()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            clearQuietly()
            StoredSession.None
        }
        val session = (stored as? StoredSession.User)?.session
        return when {
            session == null || session.userId != sent.userId -> StoreView.Other
            session.refreshToken == sent.refreshToken -> StoreView.Same
            else -> StoreView.Newer(session)
        }
    }

    private suspend fun clearQuietly() {
        try {
            sessionStore.clear()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Storage is unusable; nothing more can be done here.
        }
    }
}
