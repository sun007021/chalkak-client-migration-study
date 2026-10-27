package kr.chalkak.feature.home

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.auth.HomeMode

/** One load / refresh: [keepContent] keeps shown content on failure, [notify] turns the first such failure into a toast. */
internal class Batch(val generation: Int, val keepContent: Boolean, val notify: Boolean) {
    var failureToast: String? = null

    fun noteFailure(error: ApiError) {
        if (notify && failureToast == null) failureToast = error.toastKey()
    }
}

/**
 * State, effects and the generation check shared by the holder and its section loaders. Every state write of a load goes
 * through [update], so "a superseded load never lands" is enforced in this one place. Single-threaded (scope's main dispatcher).
 */
internal class HomeCore(mode: HomeMode, private val diagnostics: HomeDiagnostics) {
    val state = MutableStateFlow(HomeUiState(mode = mode))
    val effects = Channel<HomeEffect>(Channel.BUFFERED)

    var generation = 0
        private set
    private var toastCounter = 0L

    val member: Boolean get() = state.value.mode == HomeMode.Member

    /** Invalidates every batch created so far. */
    fun supersede() {
        generation++
    }

    fun newBatch(keepContent: Boolean = false, notify: Boolean = false) = Batch(generation, keepContent, notify)

    fun isCurrent(batch: Batch): Boolean = batch.generation == generation

    fun update(batch: Batch, transform: (HomeUiState) -> HomeUiState) {
        if (isCurrent(batch)) state.update(transform)
    }

    fun emit(effect: HomeEffect) {
        effects.trySend(effect)
    }

    fun showToast(copyKey: String) = emit(HomeEffect.ShowToast(++toastCounter, copyKey))

    /** Runs a repository call; an unexpected exception becomes a failure with its context instead of escaping. */
    suspend fun <T> guarded(call: suspend () -> ApiResult<T>): ApiResult<T> =
        try {
            call()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            diagnostics.unexpected("home.call", e)
            ApiResult.Failure(ApiError.InvalidResponse(unexpectedReason("call", e)))
        }

    /**
     * Section guard: a bug inside a loader (mapping, state transform) is reported to the diagnostics and shown as that
     * section's error state through [onCrash], so the section never stays Loading and no other section is touched.
     */
    suspend fun section(name: String, onCrash: (ApiError) -> Unit, block: suspend () -> Unit) {
        try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            diagnostics.unexpected("home.$name", e)
            onCrash(ApiError.InvalidResponse(unexpectedReason(name, e)))
        }
    }

    private fun unexpectedReason(where: String, e: Exception) = "home $where failed: ${e::class.simpleName}: ${e.message}"
}

/** First load or no content -> Error; with content on a refresh -> keep it and remember the failure for the toast. */
internal fun <T> sectionAfterFailure(batch: Batch, shown: Section<T>, error: ApiError): Section<T> =
    if (batch.keepContent && shown is Section.Ready) {
        batch.noteFailure(error)
        shown
    } else {
        Section.Error(network = error.isNetwork())
    }
