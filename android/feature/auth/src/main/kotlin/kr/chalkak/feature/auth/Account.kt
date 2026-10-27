package kr.chalkak.feature.auth

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kr.chalkak.core.data.auth.AuthRepository
import kr.chalkak.core.data.auth.GuestFlagStore

enum class ConfirmKind { Logout, Withdraw }

data class ConfirmDialog(val kind: ConfirmKind, val messageKey: String, val okKey: String, val cancelKey: String)

data class AccountUiState(
    val confirm: ConfirmDialog? = null,
    /** A logout/withdraw request is running: its button is disabled. */
    val busy: Boolean = false,
    /** Toast copy key; unique [toastId] per occurrence. */
    val toastKey: String? = null,
    val toastId: Long = 0,
)

sealed interface AccountEffect {
    /** Login screen with a cleared back stack. */
    data object GoToLogin : AccountEffect
}

/** Settings-side account actions (D-16). Work survives [onScreenGone] (the result is applied, UI feedback is dropped). */
class AccountActions(
    private val scope: CoroutineScope,
    private val auth: AuthRepository,
    private val guestFlags: GuestFlagStore,
) {
    private val _state = MutableStateFlow(AccountUiState())
    val state: StateFlow<AccountUiState> = _state.asStateFlow()

    private val _effects = Channel<AccountEffect>(Channel.BUFFERED)
    val effects: Flow<AccountEffect> = _effects.receiveAsFlow()

    // Touched only on [scope]'s dispatcher (main in production).
    private var screenGone = false
    private var toastCounter = 0L

    fun onLogoutClicked() = openConfirm(ConfirmDialog(ConfirmKind.Logout, CopyKeys.LOGOUT_MESSAGE, CopyKeys.LOGOUT_OK, CopyKeys.CONFIRM_CANCEL))

    fun onWithdrawClicked() = openConfirm(ConfirmDialog(ConfirmKind.Withdraw, CopyKeys.WITHDRAW_MESSAGE, CopyKeys.WITHDRAW_OK, CopyKeys.CONFIRM_CANCEL))

    fun onConfirmCancelled() = _state.update { it.copy(confirm = null) }

    /** Confirms the open dialog; repeated calls while busy are ignored. */
    fun onConfirmed() {
        val kind = _state.value.takeIf { !it.busy }?.confirm?.kind ?: return
        _state.update { it.copy(confirm = null, busy = true) }
        scope.launch {
            when (kind) {
                ConfirmKind.Logout -> { auth.logout(); finish(AccountEffect.GoToLogin) }
                ConfirmKind.Withdraw -> withdraw()
            }
        }
    }

    /** Settings "login" button for guests: clears the guest flag and opens login. */
    fun onGuestSignInClicked() {
        scope.launch {
            try {
                guestFlags.clearGuest()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The login screen replaces the guest state either way.
            }
            _effects.send(AccountEffect.GoToLogin)
        }
    }

    fun onToastShown() = _state.update { it.copy(toastKey = null) }

    fun onScreenGone() {
        screenGone = true
    }

    private fun openConfirm(dialog: ConfirmDialog) = _state.update { if (it.busy) it else it.copy(confirm = dialog) }

    private suspend fun withdraw() {
        when (val result = auth.withdraw()) {
            is ApiResult.Success -> finish(AccountEffect.GoToLogin)
            is ApiResult.Failure -> if ((result.error as? ApiError.Http)?.status == 401) finish(AccountEffect.GoToLogin) else failWithdraw()
        }
    }

    private fun failWithdraw() {
        _state.update {
            if (screenGone) it.copy(busy = false) else it.copy(busy = false, toastKey = CopyKeys.WITHDRAW_ERROR, toastId = ++toastCounter)
        }
    }

    private suspend fun finish(effect: AccountEffect) {
        _state.update { it.copy(busy = false) }
        _effects.send(effect)
    }
}
