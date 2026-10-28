package kr.chalkak.feature.settings

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.settings.FeedbackRepository
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.guardedApiCall
import kr.chalkak.feature.onboarding.FlowError

/**
 * Feedback screen state. [count] is the Unicode code point count of the trimmed [input] (REQ-FDBK-003); the counter
 * text is "$count/1000". [error] carries a copy key (never the server message, REQ-FDBK-010).
 */
data class FeedbackUiState(
    val input: String = "",
    val count: Int = 0,
    val sending: Boolean = false,
    val error: FlowError? = null,
) {
    /** Active from 1 trimmed code point on, also above 1000 (validated on send, REQ-FDBK-005); off while sending. */
    val sendEnabled: Boolean get() = count >= 1 && !sending
}

sealed interface FeedbackEffect {
    /** 201: toast [toastCopyKey] (`fdbk.success`) and close the screen back to settings. */
    data class Done(val toastCopyKey: String) : FeedbackEffect

    /** 401 after refresh / REAUTHENTICATION_REQUIRED: login screen. */
    data object GoLogin : FeedbackEffect
}

class FeedbackStateHolder(
    private val scope: CoroutineScope,
    private val repository: FeedbackRepository,
    private val analytics: AnalyticsTracker,
) {
    private val _state = MutableStateFlow(FeedbackUiState())
    val state: StateFlow<FeedbackUiState> = _state.asStateFlow()

    private val _effects = Channel<FeedbackEffect>(Channel.BUFFERED)
    val effects: Flow<FeedbackEffect> = _effects.receiveAsFlow()

    // Touched only on [scope]'s dispatcher (main in production).
    private var job: Job? = null
    private var errorCounter = 0L

    /** `screen_view(feedback)` (REQ-FDBK-014). */
    fun onScreenShown() = analytics.screenView("feedback")

    /** Stores the raw text (no input cap) and recomputes [FeedbackUiState.count]. Clears a shown error. */
    fun onInputChanged(text: String) =
        _state.update { it.copy(input = text, count = codePointsOf(text.trim()), error = null) }

    /**
     * Trims, validates 1..1000 code points (0 or >1000 -> no request; >1000 shows `fdbk.error.invalid`), then sends the
     * trimmed text once. Ignored while sending (REQ-FDBK-006). Failures keep the input.
     */
    fun onSendClicked() {
        val current = _state.value
        if (current.sending) return
        // D-01: the platform default trim (Unicode whitespace, NBSP and U+3000 included).
        val content = current.input.trim()
        val length = codePointsOf(content)
        when {
            length == 0 -> return
            length > AppConstants.FEEDBACK_MAX -> return fail(SettingsCopyKeys.FEEDBACK_ERROR_INVALID)
        }
        _state.update { it.copy(sending = true, error = null) }
        job = scope.launch { send(content) }
    }

    fun onErrorShown() = _state.update { it.copy(error = null) }

    /** Screen left: cancels the request, no error, no effect (TC-FDBK-029). */
    fun onScreenGone() {
        job?.cancel()
        _state.update { it.copy(sending = false) }
    }

    /** Logout / account switch while sending: the response must cause no toast and no navigation (TC-FDBK-030). */
    fun onAccountChanged() {
        job?.cancel()
        _state.value = FeedbackUiState()
    }

    private suspend fun send(content: String) {
        when (val result = guardedApiCall("feedback send") { repository.send(content) }) {
            is ApiResult.Success -> {
                _state.value = FeedbackUiState()
                _effects.send(FeedbackEffect.Done(SettingsCopyKeys.FEEDBACK_SUCCESS))
            }
            is ApiResult.Failure -> onFailure(result.error)
        }
    }

    private suspend fun onFailure(error: ApiError) {
        val http = error as? ApiError.Http
        when {
            http?.status == 401 -> {
                _state.update { it.copy(sending = false) }
                _effects.send(FeedbackEffect.GoLogin)
            }
            http?.status == 400 -> fail(SettingsCopyKeys.FEEDBACK_ERROR_INVALID)
            error is ApiError.Network -> fail(SettingsCopyKeys.ERROR_NETWORK)
            else -> fail(SettingsCopyKeys.FEEDBACK_ERROR_GENERIC)
        }
    }

    private fun fail(copyKey: String) =
        _state.update { it.copy(sending = false, error = FlowError(++errorCounter, copyKey)) }

    private fun codePointsOf(text: String) = text.codePointCount(0, text.length)
}
