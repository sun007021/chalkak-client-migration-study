package kr.chalkak.core.data.post

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/** Server-confirmed or optimistic like state of one post. */
data class LikeSnapshot(val isLiked: Boolean, val likeCount: Int)

/** [pending] = a request for this post is in flight. */
data class LikePostState(val snapshot: LikeSnapshot, val pending: Boolean)

enum class LikeFailure(val copyKey: String) {
    /** 5xx, network, invalid response, 404 (after rollback) - `like.error.generic` (D-04). */
    GENERIC("like.error.generic"),

    /** `PUT` answered 403 (D-08) - `like.error.banned`. */
    BANNED("like.error.banned"),

    /** Guest tapped the heart (D-05) - `guest.like`; no request was sent. */
    LOGIN_REQUIRED("guest.like"),
}

sealed interface LikeEvent {
    /** Show a toast with [LikeFailure.copyKey]. The state was already rolled back. */
    data class Failed(val postId: String, val failure: LikeFailure) : LikeEvent

    /** 404: the post is gone; callers drop it from lists (it is also marked in [PostChanges]). */
    data class PostGone(val postId: String) : LikeEvent
}

/**
 * Shared like toggle used by display, home ranking and feed (D-04). Free of any screen type.
 *
 * Rules:
 *  - [toggle] flips `isLiked` and `likeCount +-1` (never below 0) immediately and returns without waiting;
 *  - per post at most ONE request is in flight; further taps only change the remembered intent. When the response
 *    arrives and the final intent differs from the server state, ONE more request is sent (PUT/DELETE);
 *  - success overwrites with the server's `likeCount`/`isLiked`;
 *  - failure rolls back to the last server-known snapshot and emits [LikeEvent.Failed] (403 on PUT -> BANNED, no
 *    resend); 404 additionally emits [LikeEvent.PostGone] and marks [PostChanges]; if the rolled-back state already
 *    equals the latest intent nothing more is sent;
 *  - a failure of a stale request (the user tapped again meanwhile and the intent now differs from the rolled-back
 *    state) must not undo the newer action: the newest intent is sent instead;
 *  - different posts are independent and run in parallel;
 *  - 401 (any errorCode) rolls back silently, no resend, no toast (D-17 handles login);
 *  - any unexpected throwable in the send loop rolls back, frees the slot and emits a GENERIC failure;
 *  - guest ([isLoggedIn] false): no state change, no request, [LikeFailure.LOGIN_REQUIRED];
 *  - [reset] (account change) drops all state and ignores responses of requests started before it;
 *
 * Threading: all state is guarded by one lock, so [toggle]/[merge]/[reset] may be called from any thread; requests run
 * on [scope] (any dispatcher). Events are emitted outside the lock and are not replayed to late collectors.
 */
class LikeController(
    private val scope: CoroutineScope,
    private val repository: PostRepository,
    private val isLoggedIn: () -> Boolean,
    private val changes: PostChanges,
) {
    /** Server-known [base] plus the user's [intent]; the displayed value is always derived from both. */
    private class Entry(var base: LikeSnapshot, var intent: Boolean, var inFlight: Boolean = false, var changeRevision: Long = 0L) {
        fun displayed(): LikeSnapshot = project(base, intent)
        fun state() = LikePostState(displayed(), inFlight)
    }

    private val lock = Any()
    private val entries = HashMap<String, Entry>()
    private var revision = 0L
    private var generation = 0L

    private val _states = MutableStateFlow<Map<String, LikePostState>>(emptyMap())
    private val _events = MutableSharedFlow<LikeEvent>(extraBufferCapacity = EVENT_BUFFER)

    /** postId -> displayed state, for every post seen through [merge]. */
    val states: StateFlow<Map<String, LikePostState>> = _states.asStateFlow()

    val events: Flow<LikeEvent> = _events.asSharedFlow()

    /** Monotonic counter bumped by every local like change; take it BEFORE sending a list/detail request. */
    fun revision(): Long = synchronized(lock) { revision }

    /**
     * Folds a (possibly late) list/detail [server] value into the controller and returns the value to display:
     * the local value when this post changed locally after [requestedAtRevision] (or has a request in flight),
     * otherwise [server] (which also becomes the new base). Unknown posts are registered.
     */
    fun merge(postId: String, server: LikeSnapshot, requestedAtRevision: Long): LikeSnapshot = synchronized(lock) {
        val entry = entries[postId]
        when {
            entry == null -> entries[postId] = Entry(server, server.isLiked)
            entry.inFlight || entry.changeRevision > requestedAtRevision -> return entry.displayed()
            else -> {
                entry.base = server
                entry.intent = server.isLiked
            }
        }
        publish()
        server
    }

    /** Currently displayed state of [postId], null if never merged. */
    fun state(postId: String): LikePostState? = synchronized(lock) { entries[postId]?.state() }

    /** Ignored for unknown posts. */
    fun toggle(postId: String) {
        if (!isLoggedIn()) {
            if (synchronized(lock) { postId in entries }) emit(LikeEvent.Failed(postId, LikeFailure.LOGIN_REQUIRED))
            return
        }
        val startedAt = synchronized(lock) {
            val entry = entries[postId] ?: return
            entry.intent = !entry.intent
            entry.changeRevision = ++revision
            val startsRequest = !entry.inFlight
            entry.inFlight = true
            publish()
            if (startsRequest) generation else null
        }
        if (startedAt != null) scope.launch { sendUntilSettled(postId, startedAt) }
    }

    /** Account switch / logout: forget everything, ignore responses of requests started before. */
    fun reset() {
        synchronized(lock) {
            generation++
            entries.clear()
            publish()
        }
    }

    private suspend fun sendUntilSettled(postId: String, startedGeneration: Long) {
        try {
            while (true) {
                val target = nextTarget(postId, startedGeneration) ?: return
                val result = call(target.liked, postId)
                val outcome = settle(postId, startedGeneration, target, result) ?: return
                outcome.events.forEach(::emit)
                if (outcome.gone) changes.markRemoved(postId)
                if (!outcome.resend) return
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            abort(postId, startedGeneration)
        }
    }

    /** Anything unexpected in the send loop: roll back, free the request slot (never stuck in flight), tell the user. */
    private fun abort(postId: String, startedGeneration: Long) {
        synchronized(lock) {
            if (generation != startedGeneration) return
            val entry = entries[postId] ?: return
            entry.intent = entry.base.isLiked
            entry.changeRevision = ++revision
            entry.inFlight = false
            publish()
        }
        emit(LikeEvent.Failed(postId, LikeFailure.GENERIC))
    }

    private class Target(val liked: Boolean, val startedAtRevision: Long)

    private class Outcome(val events: List<LikeEvent>, val resend: Boolean, val gone: Boolean = false)

    /** The intent to send, or null when nothing differs from the server (the request slot is released). */
    private fun nextTarget(postId: String, startedGeneration: Long): Target? = synchronized(lock) {
        if (generation != startedGeneration) return null
        val entry = entries[postId] ?: return null
        if (entry.intent == entry.base.isLiked) {
            entry.inFlight = false
            publish()
            return null
        }
        Target(entry.intent, revision)
    }

    private suspend fun call(put: Boolean, postId: String): ApiResult<LikeResult> =
        try {
            if (put) repository.like(postId) else repository.unlike(postId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            ApiResult.Failure(ApiError.InvalidResponse("like request failed: ${e::class.simpleName}"))
        }

    /** Applies the answer; null = the account changed meanwhile and the answer is dropped. */
    private fun settle(postId: String, startedGeneration: Long, target: Target, result: ApiResult<LikeResult>): Outcome? =
        synchronized(lock) {
            if (generation != startedGeneration) return null
            val entry = entries[postId] ?: return null
            val tappedMeanwhile = entry.changeRevision > target.startedAtRevision
            entry.changeRevision = ++revision
            val outcome = when (result) {
                is ApiResult.Success -> applySuccess(entry, result.value)
                is ApiResult.Failure -> applyFailure(postId, entry, target, tappedMeanwhile, result.error)
            }
            entry.inFlight = outcome.resend
            publish()
            outcome
        }

    private fun applySuccess(entry: Entry, answer: LikeResult): Outcome {
        entry.base = LikeSnapshot(answer.isLiked, answer.likeCount)
        return Outcome(emptyList(), resend = entry.intent != entry.base.isLiked)
    }

    /** Rolls back to the server value, unless the user tapped again meanwhile (LIKE-022): then the newest intent wins. */
    private fun applyFailure(postId: String, entry: Entry, target: Target, tappedMeanwhile: Boolean, error: ApiError): Outcome {
        val status = (error as? ApiError.Http)?.status
        return when {
            status == 404 -> {
                entry.intent = entry.base.isLiked
                Outcome(listOf(LikeEvent.Failed(postId, LikeFailure.GENERIC), LikeEvent.PostGone(postId)), resend = false, gone = true)
            }
            status == 401 -> {
                // D-17 owns the login flow; the user already sees it, so no toast (spec: 401 -> "—").
                entry.intent = entry.base.isLiked
                Outcome(emptyList(), resend = false)
            }
            status == 403 && target.liked -> {
                entry.intent = entry.base.isLiked
                Outcome(listOf(LikeEvent.Failed(postId, LikeFailure.BANNED)), resend = false)
            }
            else -> {
                if (!tappedMeanwhile) entry.intent = entry.base.isLiked
                Outcome(listOf(LikeEvent.Failed(postId, LikeFailure.GENERIC)), resend = entry.intent != entry.base.isLiked)
            }
        }
    }

    private fun publish() {
        _states.value = entries.mapValues { it.value.state() }
    }

    private fun emit(event: LikeEvent) {
        _events.tryEmit(event)
    }

    private companion object {
        const val EVENT_BUFFER = 64

        fun project(base: LikeSnapshot, intent: Boolean): LikeSnapshot = when {
            intent == base.isLiked -> base
            intent -> LikeSnapshot(true, base.likeCount + 1)
            else -> LikeSnapshot(false, maxOf(0, base.likeCount - 1))
        }
    }
}
