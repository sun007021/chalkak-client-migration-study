package kr.chalkak.feature.onboarding

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.data.onboarding.SignatureUploader
import kr.chalkak.core.data.onboarding.SignupRepository
import kr.chalkak.core.data.onboarding.SignupUpload
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode

data class SignupUiState(
    /** True from "시작하기" until the flow ends, including PENDING waits: button disabled + progress. */
    val busy: Boolean = false,
    val error: FlowError? = null,
)

sealed interface SignupEffect {
    /** Signup finished (or an already-registered account logged in): home, signup screens removed from the back stack. */
    data object GoHome : SignupEffect
    /** 401 / missing context: context discarded, login screen with [copyKey] (`sign.error.expired`). */
    data class BackToLogin(val copyKey: String) : SignupEffect
    /** Server rejected the signature (`400 BUSINESS_ERROR` on confirm): drawing screen again. */
    data object BackToDrawing : SignupEffect
}

/**
 * Preview "시작하기" (REQ-ONB-012..026). Order: signup uploads -> PUT -> confirm (polled while SIGNATURE_PROCESSING_PENDING:
 * first try + up to SIGNUP_PENDING_RETRY_MAX retries, SIGNUP_PENDING_RETRY_INTERVAL_MS apart, virtual-time `delay`).
 * Every start begins at step 1 with the same idToken/rawNonce from [context].
 */
class SignupStateHolder(
    private val scope: CoroutineScope,
    private val context: SignupContext,
    private val signup: SignupRepository,
    private val uploader: SignatureUploader,
    private val auth: AuthRepository,
    private val push: DeviceRegistrar,
) {
    private enum class Step { Uploads, Put, Confirm }

    private val _state = MutableStateFlow(SignupUiState())
    val state: StateFlow<SignupUiState> = _state.asStateFlow()

    private val _effects = Channel<SignupEffect>(Channel.BUFFERED)
    val effects: Flow<SignupEffect> = _effects.receiveAsFlow()

    // Touched only on [scope]'s dispatcher (main in production).
    private var job: Job? = null
    private var errorCounter = 0L

    fun onErrorShown() = _state.update { it.copy(error = null) }

    /** Ignored while busy (TC-ONB-043). [png] was already size-checked by the pad. No context -> BackToLogin(sign.error.expired). */
    fun onStartClicked(png: ByteArray) {
        if (!_state.compareAndSet(_state.value.takeIf { !it.busy } ?: return, SignupUiState(busy = true))) return
        job = scope.launch { signUp(png) }
    }

    /** Screen left: cancels in-flight work; late results are dropped (no error, no navigation; TC-ONB-044). */
    fun onScreenGone() {
        job?.cancel()
        _state.update { it.copy(busy = false) }
    }

    private suspend fun signUp(png: ByteArray) {
        val idToken = context.idToken
        val rawNonce = context.rawNonce
        if (idToken == null || rawNonce == null) return expire()
        val upload = when (val result = guardedApiCall("signup step") { signup.requestUpload(idToken, rawNonce) }) {
            is ApiResult.Success -> result.value
            is ApiResult.Failure -> return onUploadsFailure(result.error, idToken, rawNonce)
        }
        when (val result = guardedApiCall("signup step") { uploader.put(upload.uploadUrl, png) }) {
            is ApiResult.Success -> confirmWithPolling(upload)
            is ApiResult.Failure -> failWith(result.error, Step.Put)
        }
    }

    private suspend fun confirmWithPolling(upload: SignupUpload) {
        var retries = 0
        while (true) {
            when (val result = guardedApiCall("signup step") { signup.confirm(upload.signupToken) }) {
                is ApiResult.Success -> return complete()
                is ApiResult.Failure -> {
                    if (!result.error.isProcessingPending()) return failWith(result.error, Step.Confirm)
                    if (retries >= AppConstants.SIGNUP_PENDING_RETRY_MAX) return fail(OnbCopyKeys.SIGNUP_ERROR_TIMEOUT)
                    retries++
                    delay(AppConstants.SIGNUP_PENDING_RETRY_INTERVAL_MS)
                }
            }
        }
    }

    /** `400` on issuing means the social account already exists: log in with the same pair instead (REQ-ONB-022). */
    private suspend fun onUploadsFailure(error: ApiError, idToken: String, rawNonce: String) {
        if (error !is ApiError.Http || error.status != 400 || error.errorCode != ErrorCode.BUSINESS_ERROR) {
            return failWith(error, Step.Uploads)
        }
        when (val result = guardedApiCall("signup step") { auth.socialLogin(idToken, rawNonce) }) {
            is ApiResult.Success -> when (result.value) {
                is SocialLoginOutcome.LoggedIn -> complete()
                SocialLoginOutcome.SignUpRequired -> fail(OnbCopyKeys.SIGNUP_ERROR_GENERIC)
            }
            is ApiResult.Failure -> failWith(result.error, Step.Uploads)
        }
    }

    private fun ApiError.isProcessingPending() =
        this is ApiError.Http && status == 400 && errorCode == ErrorCode.SIGNATURE_PROCESSING_PENDING

    private suspend fun complete() {
        context.discard()
        try {
            push.registerCurrentDevice()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Push registration is best effort; signup already succeeded.
        }
        _state.value = SignupUiState()
        _effects.send(SignupEffect.GoHome)
    }

    private suspend fun failWith(error: ApiError, step: Step) {
        val http = error as? ApiError.Http
        when {
            error is ApiError.Network -> fail(OnbCopyKeys.SIGN_ERROR_NETWORK)
            http == null || step == Step.Put -> fail(OnbCopyKeys.SIGNUP_ERROR_GENERIC)
            http.status == 401 -> expire()
            http.status == 403 && http.message != null -> fail(serverMessage = http.message)
            step == Step.Confirm && http.status == 400 && http.errorCode == ErrorCode.BUSINESS_ERROR ->
                fail(OnbCopyKeys.SIGN_ERROR_INVALID, SignupEffect.BackToDrawing)
            step == Step.Confirm && http.status == 404 -> fail(OnbCopyKeys.SIGNUP_ERROR_REUPLOAD, SignupEffect.BackToDrawing)
            else -> fail(OnbCopyKeys.SIGNUP_ERROR_GENERIC)
        }
    }

    private suspend fun expire() {
        context.discard()
        _state.value = SignupUiState()
        _effects.send(SignupEffect.BackToLogin(OnbCopyKeys.SIGN_ERROR_EXPIRED))
    }

    private suspend fun fail(copyKey: String? = null, effect: SignupEffect? = null, serverMessage: String? = null) {
        _state.value = SignupUiState(error = FlowError(++errorCounter, copyKey, serverMessage))
        effect?.let { _effects.send(it) }
    }
}
