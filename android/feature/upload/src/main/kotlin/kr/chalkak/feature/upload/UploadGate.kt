package kr.chalkak.feature.upload

import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.data.home.TodayPost
import kr.chalkak.core.data.post.CurrentUser
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.JobTracker
import kr.chalkak.core.network.guardedApiCall

data class UploadGateUiState(val checking: Boolean = false)

sealed interface UploadGateEffect {
    /** [id] is unique per occurrence so the same text twice still shows twice (D-20). */
    data class Toast(val id: Long, val copyKey: String) : UploadGateEffect

    /** Gate passed: open the upload screen pinned to [topicDate] (REQ-UPL-008). */
    data class Open(val topicDate: LocalDate) : UploadGateEffect

    /** 401 that survived the token refresh (REQ-UPL-005): login screen. */
    data object LoginRequired : UploadGateEffect
}

/**
 * The "+" button gate (REQ-UPL-001..007, 011). Guest (`user.userId() == null`) -> toast, no request. Otherwise ONE `home.today()`;
 * presses while a check is running do nothing; [onScreenGone] cancels the check and nothing is emitted afterwards.
 * Mapping: isPosted -> already-posted toast; 404 -> no-open-topic; 403 -> banned (no further request); 401 -> [UploadGateEffect.LoginRequired];
 * anything else (network, 5xx, InvalidResponse incl. REQ-UPL-007) -> check-failed. A pass -> [UploadGateEffect.Open] with the response `topicDate`.
 */
class UploadGateStateHolder(
    private val scope: CoroutineScope,
    private val home: HomeRepository,
    private val user: CurrentUser,
) {
    private val _state = MutableStateFlow(UploadGateUiState())
    private val _effects = Channel<UploadGateEffect>(Channel.UNLIMITED)
    private val jobs = JobTracker(scope) { emitToast(UploadCopyKeys.GATE_CHECK_FAILED) }
    private var check: Job? = null
    private var toastCounter = 0L

    val state: StateFlow<UploadGateUiState> get() = _state.asStateFlow()
    val effects: Flow<UploadGateEffect> get() = _effects.receiveAsFlow()

    fun onUploadButtonClicked() {
        if (_state.value.checking) return
        if (user.userId() == null) {
            emitToast(UploadCopyKeys.GATE_LOGIN_REQUIRED)
            return
        }
        _state.value = UploadGateUiState(checking = true)
        check = jobs.launch {
            try {
                emit(mapUploadGateResult(guardedApiCall("today") { home.today() }, ++toastCounter))
            } finally {
                _state.value = UploadGateUiState(checking = false)
            }
        }
    }

    fun onScreenGone() {
        check?.cancel()
        check = null
        _state.value = UploadGateUiState(checking = false)
    }

    private fun emitToast(copyKey: String) = emit(UploadGateEffect.Toast(++toastCounter, copyKey))

    private fun emit(effect: UploadGateEffect) {
        _effects.trySend(effect)
    }
}

/**
 * One `GET /posts/today` answer as the gate's effect (REQ-UPL-003..007): isPosted -> already-posted toast; 404 -> no-open-topic;
 * 403 -> banned; 401 -> [UploadGateEffect.LoginRequired]; anything else -> check-failed; a pass -> [UploadGateEffect.Open].
 * D-02: only status / API decide, never the server message. [toastId] makes the same toast twice show twice (D-20).
 * Shared by [UploadGateStateHolder] and hosts that run the gate themselves.
 */
fun mapUploadGateResult(result: ApiResult<TodayPost>, toastId: Long = 0): UploadGateEffect = when (result) {
    is ApiResult.Success ->
        if (result.value.isPosted) UploadGateEffect.Toast(toastId, UploadCopyKeys.GATE_ALREADY_POSTED) else UploadGateEffect.Open(result.value.topicDate)
    is ApiResult.Failure -> when ((result.error as? ApiError.Http)?.status) {
        HTTP_NOT_FOUND -> UploadGateEffect.Toast(toastId, UploadCopyKeys.GATE_NO_OPEN_TOPIC)
        HTTP_FORBIDDEN -> UploadGateEffect.Toast(toastId, UploadCopyKeys.GATE_BANNED)
        HTTP_UNAUTHORIZED -> UploadGateEffect.LoginRequired
        else -> UploadGateEffect.Toast(toastId, UploadCopyKeys.GATE_CHECK_FAILED)
    }
}

private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_FORBIDDEN = 403
private const val HTTP_NOT_FOUND = 404
