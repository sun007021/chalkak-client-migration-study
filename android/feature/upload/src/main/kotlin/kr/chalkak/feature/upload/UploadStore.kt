package kr.chalkak.feature.upload

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update

/**
 * The one place the upload collaborators write the screen state and effects to. Messages get a fresh id per occurrence (D-20).
 * After [close] no effect is emitted (the screen is gone, REQ-UPL-011 / TC-UPL-079).
 */
internal class UploadStore(cameraAvailable: Boolean) {
    private val _state = MutableStateFlow(PhotoUploadUiState(cameraAvailable = cameraAvailable))
    private val _effects = Channel<UploadEffect>(Channel.UNLIMITED)
    private var errorCounter = 0L
    private var closed = false

    val state: StateFlow<PhotoUploadUiState> get() = _state.asStateFlow()
    val effects: Flow<UploadEffect> get() = _effects.receiveAsFlow()
    val current: PhotoUploadUiState get() = _state.value

    fun update(change: (PhotoUploadUiState) -> PhotoUploadUiState) = _state.update(change)

    fun emit(effect: UploadEffect) {
        if (!closed) _effects.trySend(effect)
    }

    /** Shows [copyKey] (or the server's own text) as the one visible message. */
    fun showError(copyKey: String? = null, serverMessage: String? = null) {
        update { it.copy(error = UploadError(++errorCounter, copyKey, serverMessage)) }
    }

    fun close() {
        closed = true
    }
}
