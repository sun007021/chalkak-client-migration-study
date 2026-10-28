package kr.chalkak.feature.settings

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kr.chalkak.core.data.settings.NotificationSettingsRepository
import kr.chalkak.core.data.settings.NotificationSettings
import kr.chalkak.core.data.settings.PushSetting
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult

/**
 * Push switches (REQ-SET-008..021). [values] is empty until a GET succeeded for the current account: no value is
 * invented while loading or after a failed load (REQ-SET-010).
 */
data class PushSettingsUiState(
    val loading: Boolean = false,
    val values: Map<PushSetting, Boolean> = emptyMap(),
    /** Settings whose PATCH is in flight (their switch ignores further input, REQ-SET-014). */
    val saving: Set<PushSetting> = emptySet(),
    /** Device notification permission as last checked (tab shown, foreground, toggle); null = not checked yet. */
    val devicePermission: NotificationPermission? = null,
) {
    /** Switches are usable only after a successful load and not while (re)loading. */
    val switchesEnabled: Boolean get() = !loading && values.isNotEmpty()
}

sealed interface PushSettingsEffect {
    /** Toast with [copyKey] (`settings.push.load-error` / `settings.push.save-error`). One effect per occurrence. */
    data class Toast(val copyKey: String) : PushSettingsEffect

    /** 401 that survived the token refresh, or REAUTHENTICATION_REQUIRED: login screen, no toast. */
    data object GoLogin : PushSettingsEffect

    /** Turning a switch on while the device notification permission is off (REQ-SET-015). No PATCH was sent. */
    data object OpenSystemNotificationSettings : PushSettingsEffect
}

class PushSettingsStateHolder(
    private val scope: CoroutineScope,
    private val repository: NotificationSettingsRepository,
    private val device: DeviceNotificationSettings,
) {
    private val _state = MutableStateFlow(PushSettingsUiState())
    val state: StateFlow<PushSettingsUiState> = _state.asStateFlow()

    private val _effects = Channel<PushSettingsEffect>(Channel.BUFFERED)
    val effects: Flow<PushSettingsEffect> = _effects.receiveAsFlow()

    // Touched only on [scope]'s dispatcher (main in production).
    private var loadJob: Job? = null
    private val saveJobs = mutableMapOf<PushSetting, Job>()
    private val valuesBeforeSave = mutableMapOf<PushSetting, Boolean>()

    /** Settings tab became visible (every time): GET; switches disabled while loading. Ignored while a GET is in flight. */
    fun onTabShown() {
        refreshPermission()
        if (_state.value.loading) return
        _state.update { it.copy(loading = true) }
        loadJob = scope.launch { load() }
    }

    /**
     * The user flipped [setting] to [enabled]. Ignored while not loaded or while this setting is saving. Turning on with
     * a denied device permission -> [PushSettingsEffect.OpenSystemNotificationSettings] only (no PATCH, no value change).
     * Turning on with a not-determined permission -> system prompt first (REQ-SET-018): granted continues like below,
     * denied leaves the switch off and sends nothing. Otherwise optimistic update, single-key PATCH, rollback of this
     * setting only + save-error toast on failure.
     */
    fun onToggled(setting: PushSetting, enabled: Boolean) {
        val current = _state.value
        val before = current.values[setting]
        if (!current.switchesEnabled || setting in current.saving || before == null || before == enabled) return
        when (if (enabled) refreshPermission() else null) {
            NotificationPermission.Denied -> _effects.trySend(PushSettingsEffect.OpenSystemNotificationSettings)
            NotificationPermission.NotDetermined -> {
                // The switch stays as it was and is locked while the prompt is up.
                valuesBeforeSave[setting] = before
                _state.update { it.copy(saving = it.saving + setting) }
                saveJobs[setting] = scope.launch {
                    if (requestPermission() == NotificationPermission.Granted) {
                        _state.update { it.copy(values = it.values + (setting to true)) }
                        save(setting, true, before)
                    } else {
                        valuesBeforeSave.remove(setting)
                        saveJobs.remove(setting)
                        _state.update { it.copy(saving = it.saving - setting) }
                    }
                }
            }
            else -> {
                valuesBeforeSave[setting] = before
                _state.update { it.copy(values = it.values + (setting to enabled), saving = it.saving + setting) }
                saveJobs[setting] = scope.launch { save(setting, enabled, before) }
            }
        }
    }

    /** App returned to the foreground: re-check the device permission; switch values stay as the server said (REQ-SET-017). */
    fun onAppForegrounded() {
        refreshPermission()
    }

    /** Screen left: cancels in-flight work; a setting that was saving goes back to its previous value, no toast (TC-SET-030). */
    fun onScreenGone() {
        loadJob?.cancel()
        cancelSaves()
        _state.update { current ->
            val restored = current.saving.fold(current.values) { values, setting ->
                valuesBeforeSave[setting]?.let { values + (setting to it) } ?: values
            }
            current.copy(loading = false, values = restored, saving = emptySet())
        }
        valuesBeforeSave.clear()
    }

    /** Logout / account switch: clears all values and ignores any in-flight response of the old account. */
    fun onAccountChanged() {
        loadJob?.cancel()
        cancelSaves()
        valuesBeforeSave.clear()
        _state.value = PushSettingsUiState()
    }

    private fun cancelSaves() {
        saveJobs.values.forEach { it.cancel() }
        saveJobs.clear()
    }

    private suspend fun load() {
        when (val result = guardedApiCall("notification settings load") { repository.load() }) {
            is ApiResult.Success -> _state.update { it.copy(loading = false, values = merged(it, result.value)) }
            is ApiResult.Failure -> onLoadFailure(result.error)
        }
    }

    /** Server values, except for settings with a save in flight, which keep their optimistic value. */
    private fun merged(current: PushSettingsUiState, loaded: NotificationSettings): Map<PushSetting, Boolean> =
        PushSetting.entries.associateWith { setting ->
            if (setting in current.saving) current.values[setting] ?: loaded[setting] else loaded[setting]
        }

    private suspend fun onLoadFailure(error: ApiError) {
        _state.update { it.copy(loading = false, values = emptyMap()) }
        _effects.send(if (isUnauthorized(error)) PushSettingsEffect.GoLogin else PushSettingsEffect.Toast(SettingsCopyKeys.PUSH_LOAD_ERROR))
    }

    private suspend fun save(setting: PushSetting, enabled: Boolean, before: Boolean) {
        val result = guardedApiCall("notification settings save") { repository.update(setting, enabled) }
        valuesBeforeSave.remove(setting)
        saveJobs.remove(setting)
        when (result) {
            is ApiResult.Success -> _state.update { it.copy(saving = it.saving - setting) }
            is ApiResult.Failure -> onSaveFailure(setting, before, result.error)
        }
    }

    private suspend fun onSaveFailure(setting: PushSetting, before: Boolean, error: ApiError) {
        // A failed reload may have emptied the values meanwhile; do not repopulate them with a single setting.
        _state.update {
            val values = if (setting in it.values) it.values + (setting to before) else it.values
            it.copy(values = values, saving = it.saving - setting)
        }
        _effects.send(if (isUnauthorized(error)) PushSettingsEffect.GoLogin else PushSettingsEffect.Toast(SettingsCopyKeys.PUSH_SAVE_ERROR))
    }

    private fun isUnauthorized(error: ApiError) = (error as? ApiError.Http)?.status == 401

    /** Shows the system prompt; a throwing adapter counts as "not granted". The permission shown in the state follows the answer. */
    private suspend fun requestPermission(): NotificationPermission {
        val answer = try {
            device.requestPermission()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            NotificationPermission.Denied
        }
        currentCoroutineContext().ensureActive()
        _state.update { it.copy(devicePermission = answer) }
        return answer
    }

    /** A throwing platform adapter counts as "unknown": the switch then follows the normal save path. */
    private fun refreshPermission(): NotificationPermission? {
        val permission = try {
            device.permission()
        } catch (e: Exception) {
            null
        }
        _state.update { it.copy(devicePermission = permission) }
        return permission
    }
}
