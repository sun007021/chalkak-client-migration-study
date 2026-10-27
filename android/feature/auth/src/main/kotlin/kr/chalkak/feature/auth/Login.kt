package kr.chalkak.feature.auth

import kr.chalkak.core.common.analytics.AnalyticsTracker
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.chalkak.core.data.auth.NonceHasher
import kr.chalkak.core.data.auth.SocialLoginOutcome
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.GuestFlagStore
import kr.chalkak.core.data.auth.NonceGenerator

/** [id] is unique per occurrence so an identical message shown twice still re-triggers the UI (TC-AUTH-029). */
data class LoginError(val id: Long, val copyKey: String? = null, val serverMessage: String? = null)

data class LoginUiState(
    /** True while Kakao SDK or social-login is in flight: both buttons disabled + progress. */
    val busy: Boolean = false,
    val error: LoginError? = null,
) {
    val buttonsEnabled: Boolean get() = !busy
}

sealed interface LoginEffect {
    data class GoHome(val mode: HomeMode) : LoginEffect
    data class GoTerms(val pending: PendingSignup) : LoginEffect
}

class LoginStateHolder(
    private val scope: CoroutineScope,
    private val socialLogin: SocialLoginClient,
    private val nonces: NonceGenerator,
    private val auth: AuthRepository,
    private val guestFlags: GuestFlagStore,
    private val push: PushRegistrar,
    private val analytics: AnalyticsTracker,
) {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    private val _effects = Channel<LoginEffect>(Channel.BUFFERED)
    val effects: Flow<LoginEffect> = _effects.receiveAsFlow()

    // Touched only on [scope]'s dispatcher (main in production).
    private var job: Job? = null
    private var errorCounter = 0L

    /** Sends `screen_view(login)` (REQ-BOOT-021). */
    fun onScreenShown() = analytics.screenView("login")

    /** New rawNonce per press; SDK gets the hash, server gets the raw value. Ignored while busy. */
    fun onKakaoClicked() = startWork { kakaoLogin() }

    /** No server call: stores the guest flag and goes Home(Guest); storage failure -> stay + `auth.login.error.guest`. */
    fun onGuestClicked() = startWork { guestLogin() }

    fun onErrorShown() = _state.update { it.copy(error = null) }

    /** Screen left: cancels in-flight work; late results are dropped (no session saved by this holder, no error). */
    fun onScreenGone() {
        job?.cancel()
        _state.update { it.copy(busy = false) }
    }

    private fun startWork(work: suspend () -> Unit) {
        if (!_state.compareAndSet(_state.value.takeIf { !it.busy } ?: return, LoginUiState(busy = true))) return
        job = scope.launch { work() }
    }

    private suspend fun kakaoLogin() {
        val rawNonce = nonces.newRawNonce()
        val kakao = try {
            socialLogin.requestIdToken(NonceHasher.sha256Hex(rawNonce))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            KakaoLoginResult.Failed
        }
        when (kakao) {
            is KakaoLoginResult.IdToken -> serverLogin(kakao.value, rawNonce)
            KakaoLoginResult.Cancelled -> idle()
            KakaoLoginResult.MissingIdToken, KakaoLoginResult.ConfigError -> fail(CopyKeys.LOGIN_ERROR_CONFIG)
            KakaoLoginResult.Failed -> fail(CopyKeys.LOGIN_ERROR_KAKAO_FAILED)
        }
    }

    private suspend fun serverLogin(idToken: String, rawNonce: String) {
        val response = try {
            auth.socialLogin(idToken, rawNonce)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // e.g. secure storage failed while saving the session: stay on login with a retryable error instead of crashing.
            return fail(CopyKeys.LOGIN_ERROR_GENERIC)
        }
        when (val result = response) {
            is ApiResult.Success -> when (result.value) {
                is SocialLoginOutcome.LoggedIn -> {
                    registerPush()
                    finish(LoginEffect.GoHome(HomeMode.Member))
                }
                SocialLoginOutcome.SignUpRequired -> finish(LoginEffect.GoTerms(PendingSignup(idToken, rawNonce)))
            }
            is ApiResult.Failure -> showError(result.error)
        }
    }

    private suspend fun guestLogin() {
        try {
            guestFlags.markGuest()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return fail(CopyKeys.LOGIN_ERROR_GUEST)
        }
        finish(LoginEffect.GoHome(HomeMode.Guest))
    }

    private suspend fun registerPush() {
        try {
            push.registerCurrentDevice()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Push registration is best effort; login already succeeded.
        }
    }

    private fun showError(error: ApiError) = when {
        error is ApiError.Http && error.status == 401 -> fail(CopyKeys.LOGIN_ERROR_KAKAO_ACCOUNT)
        error is ApiError.Http && error.status == 403 && error.message != null -> fail(serverMessage = error.message)
        error is ApiError.Http -> fail(CopyKeys.LOGIN_ERROR_GENERIC)
        error is ApiError.Network -> fail(CopyKeys.LOGIN_ERROR_NETWORK)
        error is ApiError.InvalidResponse -> fail(CopyKeys.LOGIN_ERROR_INVALID_RESPONSE)
        error is ApiError.Config -> fail(CopyKeys.LOGIN_ERROR_CONFIG)
        else -> idle()
    }

    private fun idle() = _state.update { it.copy(busy = false) }

    private fun fail(copyKey: String? = null, serverMessage: String? = null) {
        _state.value = LoginUiState(error = LoginError(++errorCounter, copyKey, serverMessage))
    }

    private suspend fun finish(effect: LoginEffect) {
        idle()
        _effects.send(effect)
    }
}
