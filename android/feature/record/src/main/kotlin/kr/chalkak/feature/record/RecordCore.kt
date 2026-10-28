package kr.chalkak.feature.record

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.record.RecordPost
import kr.chalkak.core.network.ApiError
import kr.chalkak.feature.auth.HomeMode
import java.time.LocalDate
import java.time.YearMonth

/**
 * State, effects, month cache and the "which answer may land" counters. Single-threaded (the holder's scope).
 *
 * Choices the spec leaves open:
 *  - Selection is re-derived whenever the shown month's posts change (answer, cache, deletion): the selected day is kept while it
 *    still has a post, otherwise the newest remaining day (none -> null). So a day that vanished in a revalidation behaves
 *    like a deleted one (REQ-REC-028), and a pending requested day (REQ-REC-032) wins until the user acts or a fresh answer settles it.
 *  - After a month rollover the shown month is kept (REQ-REC-007); only [RecordUiState.currentMonth] / `availableMonths` move.
 *  - A banned member's 403 (REQ-REC-042) is "other" until D-08 gives the wording.
 */
internal class RecordCore(mode: HomeMode, private val kst: KstCalendar, private val postChanges: PostChanges) {
    val effects = Channel<RecordEffect>(Channel.BUFFERED)
    val state = MutableStateFlow(initialState(mode))

    /** Bumped when the shown month or the account/screen changes; an older calendar answer never lands. */
    var navigation = 0L
        private set

    /** Bumped when the screen is left or the account changes; an older months answer never lands. */
    var epoch = 0L
        private set

    /** The first entry chose the month to show; later entries keep it. */
    var entered = false

    /** A day asked for by another screen, applied until a fresh answer settles it (REQ-REC-032). */
    var requestedDate: LocalDate? = null

    private val cache = HashMap<YearMonth, List<RecordPost>>()
    private var serverMonths: List<YearMonth> = emptyList()
    private var toastCounter = 0L

    val member: Boolean get() = state.value.mode == HomeMode.Member
    val shown: YearMonth get() = state.value.month

    fun isCached(month: YearMonth) = month in cache

    fun toast(copyKey: String) {
        effects.trySend(RecordEffect.ShowToast(++toastCounter, copyKey))
    }

    fun emit(effect: RecordEffect) {
        effects.trySend(effect)
    }

    fun supersedeNavigation() {
        navigation++
    }

    fun supersedeAll() {
        navigation++
        epoch++
    }

    /** Account switch: nothing of the previous account stays. */
    fun reset(mode: HomeMode) {
        supersedeAll()
        cache.clear()
        serverMonths = emptyList()
        requestedDate = null
        entered = false
        state.value = initialState(mode)
    }

    private fun initialState(mode: HomeMode): RecordUiState {
        val current = kst.currentMonth()
        return RecordUiState(
            mode = mode, currentMonth = current, availableMonths = listOf(current), month = current,
            phase = RecordPhase.Loading, revalidating = false, cells = emptyList(), selectedDate = null,
            panel = null, error = null, saving = false,
        )
    }

    // ---- months ------------------------------------------------------------------------------------

    /** Current month is recomputed on every entry / foreground (REQ-REC-003). */
    fun refreshCurrentMonth() {
        state.update { it.copy(currentMonth = kst.currentMonth(), availableMonths = kst.selectableMonths(serverMonths)) }
    }

    fun setServerMonths(months: List<YearMonth>) {
        serverMonths = months
        refreshCurrentMonth()
    }

    /** Moves to [month]: the old selection, requested day and tooltip belong to the old month. */
    fun switchMonth(month: YearMonth) {
        supersedeNavigation()
        requestedDate = null
        state.update { it.copy(month = month, selectedDate = null, panel = null) }
    }

    // ---- content -----------------------------------------------------------------------------------

    /** Content of the shown month from the cache, or the Loading state when there is none (previous content is cleared). */
    fun showCachedOrLoading() {
        if (isCached(shown)) present(revalidating = true) else showLoading()
    }

    fun showLoading() {
        state.update {
            it.copy(
                phase = RecordPhase.Loading, revalidating = false, cells = emptyList(),
                selectedDate = null, panel = null, error = null,
            )
        }
    }

    /** A fresh answer for [month] (already validated by the repository). */
    fun commit(month: YearMonth, posts: List<RecordPost>) {
        cache[month] = posts
        present(revalidating = false)
        requestedDate = null
    }

    /** A deletion may change what the shown month holds. */
    fun onRemovedChanged() {
        if (state.value.phase == RecordPhase.Content) present(state.value.revalidating)
    }

    private fun present(revalidating: Boolean) {
        val current = state.value
        val removed = postChanges.removed.value
        val posts = cache[current.month].orEmpty().filterNot { it.postId in removed }.associateBy { it.topicDate }
        val selected = selectionIn(posts, current.selectedDate)
        val keepHint = selected == current.selectedDate && current.panel?.hintOpen == true
        state.value = current.copy(
            phase = RecordPhase.Content,
            revalidating = revalidating,
            cells = cellsOf(current.month, posts),
            selectedDate = selected,
            panel = panelOf(selected?.let(posts::get), keepHint),
            error = null,
        )
    }

    private fun selectionIn(posts: Map<LocalDate, RecordPost>, current: LocalDate?): LocalDate? =
        requestedDate?.takeIf { it in posts } ?: current?.takeIf { it in posts } ?: posts.keys.maxOrNull()

    // ---- failures ----------------------------------------------------------------------------------

    /** Failure of the shown month's request: cached content stays and toasts, otherwise the error screen. */
    fun fail(month: YearMonth, error: ApiError) {
        if (isCached(month)) {
            state.update { it.copy(revalidating = false) }
            toast(error.toRevalidationToastKey())
        } else {
            showError(error.toRecordError())
        }
    }

    /** A bug inside a job: shown as the error state / toast, never as a crash. */
    fun crashed() {
        state.update { it.copy(saving = false) }
        fail(shown, ApiError.InvalidResponse("unexpected failure"))
    }

    private fun showError(error: RecordError) {
        state.update {
            it.copy(
                phase = RecordPhase.Error, revalidating = false, cells = emptyList(),
                selectedDate = null, panel = null, error = error,
            )
        }
    }

    // ---- user actions on the shown month -----------------------------------------------------------

    fun selectDate(date: LocalDate) {
        val current = state.value
        if (current.phase != RecordPhase.Content || current.cells.none { it.date == date && it.post != null }) return
        requestedDate = null
        state.update {
            val post = it.cells.first { cell -> cell.date == date }.post
            it.copy(selectedDate = date, panel = panelOf(post, hintOpen = false))
        }
    }

    fun toggleHint() {
        state.update { s ->
            val panel = s.panel?.takeIf { it.pendingBadge } ?: return@update s
            s.copy(panel = panelOf(panel.post, hintOpen = !panel.hintOpen))
        }
    }

    fun setSaving(saving: Boolean) {
        state.update { it.copy(saving = saving) }
    }

    fun setRevalidatingOff() {
        state.update { it.copy(revalidating = false) }
    }
}
