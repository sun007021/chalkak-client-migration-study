package kr.chalkak.feature.record

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kr.chalkak.core.common.DateFormats
import java.time.YearMonth

/**
 * "이미지로 저장": render the shown month -> save `chalkak-calendar-yyyy-MM.png` -> one toast (REQ-REC-037..039). A tap while a save
 * runs is ignored. A failing renderer / saver is the failure toast. Cancelling (account change) drops the toast; adapters
 * should keep their MediaStore write atomic (pending flag) because the coroutine can be cancelled between render and write.
 */
internal class RecordSaveFlow(
    private val jobs: RecordJobs,
    private val core: RecordCore,
    private val renderer: CalendarImageRenderer,
    private val saver: CalendarImageSaver,
) {
    private var job: Job? = null

    /** Bumped by every start and cancel; only the latest save may clear `saving`. */
    private var generation = 0L

    fun start() {
        val snapshot = core.state.value
        if (snapshot.saving || snapshot.phase != RecordPhase.Content) return
        core.setSaving(true)
        val token = ++generation
        job = jobs.launch {
            try {
                val outcome = save(snapshot.month, snapshot.cells)
                // An adapter that ignores cancellation must not toast for a save the user already left.
                currentCoroutineContext().ensureActive()
                core.toast(copyKeyOf(outcome))
            } finally {
                // A cancelled save was superseded by [cancel] and its owner reset `saving`; a later save may be running.
                if (token == generation) core.setSaving(false)
            }
        }
    }

    fun cancel() {
        generation++
        job?.cancel()
        job = null
    }

    private suspend fun save(month: YearMonth, cells: List<RecordCell>): SaveOutcome =
        try {
            saver.save(DateFormats.calendarFileName(month), renderer.render(month, cells))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            SaveOutcome.Failed
        }

    private fun copyKeyOf(outcome: SaveOutcome) = when (outcome) {
        SaveOutcome.Saved -> RecordCopy.SAVE_OK
        SaveOutcome.PermissionDenied -> RecordCopy.SAVE_DENIED
        SaveOutcome.Failed -> RecordCopy.SAVE_FAIL
    }
}
