package kr.chalkak.feature.onboarding

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
import kr.chalkak.core.data.onboarding.SignatureRepository
import kr.chalkak.core.data.onboarding.SignatureUploader
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode

data class SignatureChangeUiState(
    val busy: Boolean = false,
    val error: FlowError? = null,
)

sealed interface SignatureChangeEffect {
    /** Change accepted: back to settings (drawing/preview removed from the back stack) with toast [toastCopyKey] (`sign.change.done`). The card must re-read via GET. */
    data class Done(val toastCopyKey: String) : SignatureChangeEffect
    /** 401 that survived the token refresh: login screen with `sign.error.expired`. */
    data class BackToLogin(val copyKey: String) : SignatureChangeEffect
    /** `400 BUSINESS_ERROR` on confirm: drawing screen again. */
    data object BackToDrawing : SignatureChangeEffect
}

/**
 * Change-mode preview "사인 변경하기" (REQ-SIGN-019..029): uploads -> PUT -> confirm, fresh uploads on every start,
 * never reusing an old uploadId, and no further request after a 403.
 */
class SignatureChangeStateHolder(
    private val scope: CoroutineScope,
    private val signatures: SignatureRepository,
    private val uploader: SignatureUploader,
) {
    private enum class Step { Uploads, Put, Confirm }

    private val _state = MutableStateFlow(SignatureChangeUiState())
    val state: StateFlow<SignatureChangeUiState> = _state.asStateFlow()

    private val _effects = Channel<SignatureChangeEffect>(Channel.BUFFERED)
    val effects: Flow<SignatureChangeEffect> = _effects.receiveAsFlow()

    // Touched only on [scope]'s dispatcher (main in production).
    private var job: Job? = null
    private var errorCounter = 0L

    fun onErrorShown() = _state.update { it.copy(error = null) }

    /** Ignored while busy (TC-SIGN-036). */
    fun onConfirmClicked(png: ByteArray) {
        if (!_state.compareAndSet(_state.value.takeIf { !it.busy } ?: return, SignatureChangeUiState(busy = true))) return
        job = scope.launch { change(png) }
    }

    /** Screen left: cancels in-flight work, no error shown (TC-SIGN-037). */
    fun onScreenGone() {
        job?.cancel()
        _state.update { it.copy(busy = false) }
    }

    private suspend fun change(png: ByteArray) {
        val upload = when (val result = guardedApiCall("signature change step") { signatures.requestUpload() }) {
            is ApiResult.Success -> result.value
            is ApiResult.Failure -> return failWith(result.error, Step.Uploads)
        }
        when (val result = guardedApiCall("signature change step") { uploader.put(upload.uploadUrl, png) }) {
            is ApiResult.Success -> Unit
            is ApiResult.Failure -> return failWith(result.error, Step.Put)
        }
        when (val result = guardedApiCall("signature change step") { signatures.confirm(upload.uploadId) }) {
            is ApiResult.Success -> finish(SignatureChangeEffect.Done(OnbCopyKeys.SIGN_CHANGE_DONE))
            is ApiResult.Failure -> failWith(result.error, Step.Confirm)
        }
    }

    private suspend fun failWith(error: ApiError, step: Step) {
        val http = error as? ApiError.Http
        when {
            error is ApiError.Network -> fail(OnbCopyKeys.SIGN_ERROR_NETWORK)
            http == null || step == Step.Put -> fail(OnbCopyKeys.SIGN_CHANGE_ERROR_GENERIC)
            http.status == 401 -> finish(SignatureChangeEffect.BackToLogin(OnbCopyKeys.SIGN_ERROR_EXPIRED))
            http.status == 403 -> fail(OnbCopyKeys.BANNED_SIGNATURE)
            step == Step.Confirm -> failConfirm(http)
            else -> fail(OnbCopyKeys.SIGN_CHANGE_ERROR_GENERIC)
        }
    }

    private suspend fun failConfirm(http: ApiError.Http) {
        when {
            http.status == 400 && http.errorCode == ErrorCode.SIGNATURE_REUPLOAD_REQUIRED -> fail(OnbCopyKeys.SIGNUP_ERROR_REUPLOAD)
            http.status == 400 && http.errorCode == ErrorCode.BUSINESS_ERROR ->
                fail(OnbCopyKeys.SIGN_ERROR_INVALID, SignatureChangeEffect.BackToDrawing)
            http.status == 404 -> fail(OnbCopyKeys.SIGN_CHANGE_ERROR_NOT_FOUND)
            else -> fail(OnbCopyKeys.SIGN_CHANGE_ERROR_GENERIC)
        }
    }

    private suspend fun finish(effect: SignatureChangeEffect) {
        _state.value = SignatureChangeUiState()
        _effects.send(effect)
    }

    private suspend fun fail(copyKey: String, effect: SignatureChangeEffect? = null) {
        _state.value = SignatureChangeUiState(error = FlowError(++errorCounter, copyKey))
        effect?.let { _effects.send(it) }
    }
}

data class SignatureCardUiState(
    /** Thumbnail, or original when the thumbnail is null; null = empty placeholder. */
    val imageUrl: String? = null,
    val loading: Boolean = false,
    /** GET answered 400 SIGNATURE_REGISTRATION_REQUIRED: empty image + "변경하기" (REQ-SIGN-016). */
    val needsRegistration: Boolean = false,
)

sealed interface SignatureCardEffect {
    data class Toast(val copyKey: String) : SignatureCardEffect
    /** 401 after refresh already failed: login screen. */
    data object GoLogin : SignatureCardEffect
}

/** Settings signature card (REQ-SIGN-013..017). Guests never call the API. */
class SignatureCardStateHolder(
    private val scope: CoroutineScope,
    private val signatures: SignatureRepository,
    private val isGuest: Boolean,
) {
    private val _state = MutableStateFlow(SignatureCardUiState())
    val state: StateFlow<SignatureCardUiState> = _state.asStateFlow()

    private val _effects = Channel<SignatureCardEffect>(Channel.BUFFERED)
    val effects: Flow<SignatureCardEffect> = _effects.receiveAsFlow()

    /** Cards are hidden for guests. */
    val visible: Boolean get() = !isGuest

    // Touched only on [scope]'s dispatcher (main in production).
    private var job: Job? = null

    /** Settings tab became visible (every time) or a change finished: GET unless one is already in flight. */
    fun onTabShown() {
        if (isGuest || _state.value.loading) return
        _state.update { it.copy(loading = true) }
        job = scope.launch { load() }
    }

    /** A change succeeded: the GET that is in flight (if any) predates it, so it is cancelled and its answer dropped; GET again. */
    fun reload() {
        if (isGuest) return
        job?.cancel()
        _state.update { it.copy(loading = true) }
        job = scope.launch { load() }
    }

    /** Logout / account switch: drops the shown image and ignores any in-flight response. */
    fun onAccountChanged() {
        job?.cancel()
        _state.value = SignatureCardUiState()
    }

    private suspend fun load() {
        when (val result = guardedApiCall("signature load") { signatures.current() }) {
            is ApiResult.Success -> _state.value = SignatureCardUiState(imageUrl = result.value.displayUrl)
            is ApiResult.Failure -> onLoadFailure(result.error)
        }
    }

    private suspend fun onLoadFailure(error: ApiError) {
        val http = error as? ApiError.Http
        when {
            http?.status == 400 && http.errorCode == ErrorCode.SIGNATURE_REGISTRATION_REQUIRED ->
                _state.value = SignatureCardUiState(needsRegistration = true)
            http?.status == 401 -> {
                _state.update { it.copy(loading = false) }
                _effects.send(SignatureCardEffect.GoLogin)
            }
            else -> {
                _state.update { it.copy(loading = false) }
                _effects.send(SignatureCardEffect.Toast(OnbCopyKeys.SIGN_LOAD_ERROR))
            }
        }
    }
}
