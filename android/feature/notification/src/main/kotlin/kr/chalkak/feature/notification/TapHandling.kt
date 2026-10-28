package kr.chalkak.feature.notification

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.data.auth.UserDataResetter
import kr.chalkak.core.data.notification.NotificationRepository

sealed interface TapOutcome {
    /**
     * Go to [destination]. [readConfirmed] true = the read PATCH succeeded (or none was needed); false = it failed with a network
     * error and [toastCopyKey] is `noti.read.error.network` (REQ-NOTI-017).
     */
    data class Navigate(
        val destination: NotificationDestination,
        val readConfirmed: Boolean,
        val toastCopyKey: String? = null,
    ) : TapOutcome

    /** 404 or any other non-network, non-401 read failure: toast `noti.gone`, no navigation (REQ-NOTI-018/019). */
    data class Rejected(val toastCopyKey: String) : TapOutcome

    /** 401 that survived the refresh (UNAUTHORIZED) or REAUTHENTICATION_REQUIRED: login screen, nothing pending (TC-PUSH-057). */
    data object RequireLogin : TapOutcome

    /** Nothing to do (plan without destination). */
    data object Dropped : TapOutcome
}

/**
 * Runs a [TapPlan]: read first when the plan asks for it, then decides by the result (shared by inbox rows and push taps, D-11).
 * Calls [unread] once after a successful read and once after a Rejected read. Coroutine cancellation propagates (no outcome).
 */
class NotificationTapHandler(
    private val repo: NotificationRepository,
    private val unread: UnreadStatusRefresher,
) {
    suspend fun handle(plan: TapPlan): TapOutcome {
        val destination = plan.destination ?: return TapOutcome.Dropped
        val id = plan.readNotificationId ?: return TapOutcome.Navigate(destination, readConfirmed = true)
        return when (val result = guardedApiCall("notification read") { repo.markRead(id) }) {
            is ApiResult.Success -> {
                unread.refresh()
                TapOutcome.Navigate(destination, readConfirmed = true)
            }
            is ApiResult.Failure -> failedRead(destination, result)
        }
    }

    private fun failedRead(destination: NotificationDestination, failure: ApiResult.Failure): TapOutcome = when {
        failure.error.requiresLogin() -> TapOutcome.RequireLogin
        failure.error.isConnectionFailure() ->
            TapOutcome.Navigate(destination, readConfirmed = false, toastCopyKey = NotiCopyKeys.READ_ERROR_NETWORK)
        else -> {
            unread.refresh()
            TapOutcome.Rejected(NotiCopyKeys.GONE)
        }
    }
}

sealed interface TapSession {
    /** Boot has not decided yet (cold start). Taps are held. */
    data object Unknown : TapSession
    data object LoggedOut : TapSession
    data object Guest : TapSession
    data class Member(val userId: String) : TapSession
}

sealed interface PushNavigationEvent {
    data class Go(val command: NavCommand, val toastCopyKey: String? = null) : PushNavigationEvent
    data class Toast(val copyKey: String) : PushNavigationEvent
    data object RequireLogin : PushNavigationEvent
}

/**
 * Push-tap buffer (REQ-PUSH-030..032, D-11, TC-PUSH-058..066, TC-BOOT-035). One pending tap at most; a newer tap replaces it.
 *  - [session] LoggedOut/Guest: the tap (and any pending one) is discarded, nothing stored;
 *  - otherwise the tap is stored in [store] and consumed exactly once, as soon as session is Member AND [mainReady]
 *    (BootGate.pushNavigationAllowed) AND NOT [blockingScreen] (login/terms/sign/upload/feedback open);
 *  - a pending tap whose member differs from the current member is discarded; a tap stored with unknown member (cold start)
 *    belongs to whoever becomes Member first;
 *  - the store is cleared BEFORE the tap is handled; same `eventId` twice = two taps, both handled (TC-PUSH-052);
 *  - [top] tells which screen is on top when the command is built ([NavModes.resolve]).
 */
class PushTapQueue(
    private val scope: CoroutineScope,
    private val store: PendingTapStore,
    private val handler: NotificationTapHandler,
    private val session: StateFlow<TapSession>,
    private val mainReady: StateFlow<Boolean>,
    private val blockingScreen: StateFlow<Boolean>,
    private val top: () -> TopScreen,
) {
    private val channel = Channel<PushNavigationEvent>(Channel.UNLIMITED)
    private val lock = Mutex()
    private var pending: PendingTap? = null

    val events: Flow<PushNavigationEvent> = channel.receiveAsFlow()

    /** Starts observing the gates. Call once. */
    fun start() {
        scope.launch {
            combine(session, mainReady, blockingScreen) { _, _, _ -> }.collect { lock.withLock { evaluate() } }
        }
    }

    /** Loads a pending tap saved before process death (call before [start]). */
    suspend fun restore() {
        lock.withLock { pending = bestEffort { store.load() } }
    }

    fun onTap(payload: PushPayload) {
        scope.launch { lock.withLock { accept(payload) } }
    }

    private suspend fun accept(payload: PushPayload) {
        val current = session.value
        if (current is TapSession.LoggedOut || current is TapSession.Guest) return discard()
        val tap = PendingTap(payload, (current as? TapSession.Member)?.userId)
        pending = tap
        bestEffort { store.save(tap) }
        evaluate()
    }

    private suspend fun evaluate() {
        val tap = pending ?: return
        when (val current = session.value) {
            TapSession.Unknown -> Unit
            TapSession.LoggedOut, TapSession.Guest -> discard()
            is TapSession.Member -> when {
                tap.userId != null && tap.userId != current.userId -> discard()
                mainReady.value && !blockingScreen.value -> consume(tap, current)
            }
        }
    }

    private suspend fun discard() {
        if (pending == null) return
        pending = null
        bestEffort { store.clear() }
    }

    private suspend fun consume(tap: PendingTap, member: TapSession.Member) {
        pending = null
        bestEffort { store.clear() }
        val outcome = handler.handle(NotificationTapPlanner.forPush(tap.payload))
        if (session.value != member) return
        toEvent(outcome)?.let { channel.trySend(it) }
    }

    /** The store only protects against process death: a failing store must not stop the in-memory flow or kill the collector. */
    private suspend fun <T> bestEffort(block: suspend () -> T): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }

    private fun toEvent(outcome: TapOutcome): PushNavigationEvent? = when (outcome) {
        is TapOutcome.Navigate ->
            PushNavigationEvent.Go(NavCommand(outcome.destination, NavModes.resolve(outcome.destination, top())), outcome.toastCopyKey)
        is TapOutcome.Rejected -> PushNavigationEvent.Toast(outcome.toastCopyKey)
        TapOutcome.RequireLogin -> PushNavigationEvent.RequireLogin
        TapOutcome.Dropped -> null
    }
}

/** Clears everything bound to the previous account (D-16, AUTH-041 participant). */
class NotificationDataResetter(
    private val registration: PushRegistrationCoordinator,
    private val store: PendingTapStore,
    private val inbox: NotificationInboxStateHolder,
) : UserDataResetter {
    /** Clears the push dedupe cache, the pending tap and the inbox/unread state; calls no push-device API (TC-PUSH-035). */
    override suspend fun resetAll() {
        registration.reset()
        store.clear()
        inbox.onSessionEnded()
    }
}
