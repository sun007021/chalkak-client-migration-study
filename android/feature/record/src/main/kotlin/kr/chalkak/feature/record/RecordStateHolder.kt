package kr.chalkak.feature.record

import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kr.chalkak.core.common.Clock
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.analytics.screenViewSafely
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.record.RecordRepository
import kr.chalkak.core.network.JobTracker
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.display.FeedEntry

/**
 * Record tab state (REC). Runs on the injected [scope]; every date comes from [clock] in KST.
 *
 * Contract the implementer must satisfy (the tests are the detail):
 * - [onShown]: member -> `months()` + `calendar(month)`; the month shown is the KST current month on the first entry (D-19);
 *   `availableMonths` = server months + current month, newest first. Guest -> toast `record.guest`, NO repository call, no
 *   `screen_view`. Later calls / [onForeground] revalidate: the shown month and selected date are kept, cached content stays
 *   visible, a failure keeps it and toasts (`common.error.network` for Network errors, else `record.err.other`).
 * - A month answer is cached per month; moving to a cached month shows it at once ([RecordUiState.revalidating]) and asks again;
 *   an uncached month clears the content ([RecordPhase.Loading]); first-load failure -> [RecordPhase.Error] ([RecordError]).
 * - Month moves ([onPreviousMonth], [onNextMonth], [onMonthPicked]) stay inside `availableMonths`; the same / unknown month is a
 *   no-op without a request. A late answer of a superseded request (older navigation, [onScreenGone], [onAccountChanged]) never lands.
 * - Posts whose id is in [postChanges] `.removed` are filtered from cache and from every answer; if the selected day loses its
 *   post the selection moves to the newest remaining day of the month (none -> null). `availableMonths` is not trimmed.
 * - Default selection = newest `topicDate` of the month; `onShown(requestedDate)` selects that date only if it has a post, and
 *   remembers it across a failed first load + [onRetry].
 * - Only APPROVED panels expose the feed / exhibition actions; PENDING shows the badge (+ tooltip toggle) only.
 */
class RecordStateHolder(
    scope: CoroutineScope,
    clock: Clock,
    repository: RecordRepository,
    postChanges: PostChanges,
    private val analytics: AnalyticsTracker,
    mode: HomeMode,
    renderer: CalendarImageRenderer,
    saver: CalendarImageSaver,
) {
    private val core = RecordCore(mode, KstCalendar(clock), postChanges)
    private val jobs = JobTracker(scope) { core.crashed() }
    private val loader = RecordLoader(jobs, core, repository)
    private val saveFlow = RecordSaveFlow(jobs, core, renderer, saver)
    private var visible = false


    val state: StateFlow<RecordUiState> = core.state.asStateFlow()
    val effects: Flow<RecordEffect> = core.effects.receiveAsFlow()

    init {
        jobs.launch { postChanges.removed.collect { core.onRemovedChanged() } }
    }

    /** Record screen became visible (tab selected / returned from feed or display). [requestedDate]: opened from home with a day. */
    fun onShown(requestedDate: LocalDate? = null) = guarded {
        if (!core.member) return@guarded core.toast(RecordCopy.GUEST)
        if (!visible) {
            visible = true
            analytics.screenViewSafely("record")
        }
        enter(requestedDate)
    }

    /** App back in the foreground while the screen is visible: same revalidation as a later [onShown]. */
    fun onForeground() = guarded {
        if (core.member) enter(null)
    }

    /** Screen left: in-flight work is cancelled, results are dropped, no error and no toast. */
    fun onScreenGone() = guarded {
        visible = false
        core.supersedeAll()
        loader.cancelAll()
        saveFlow.cancel()
        core.setSaving(false)
        core.setRevalidatingOff()
    }

    fun onPreviousMonth() = guarded { core.state.value.let { s -> s.availableMonths.firstOrNull { it < s.month }?.let(::moveTo) } }

    fun onNextMonth() = guarded { core.state.value.let { s -> s.availableMonths.lastOrNull { it > s.month }?.let(::moveTo) } }

    /** Month picker choice. */
    fun onMonthPicked(month: YearMonth) = guarded { moveTo(month) }

    /** Tap on a grid cell; a date without a post does nothing (REQ-REC-030). */
    fun onDateSelected(date: LocalDate) = guarded { core.selectDate(date) }

    /** Tap on the "사진 반영 중" badge: opens / closes the tooltip; no-op without a PENDING selection. */
    fun onPendingBadgeTapped() = guarded { core.toggleHint() }

    fun onOpenFeed() = guarded {
        core.state.value.panel?.takeIf { it.actionsVisible }?.post?.let {
            core.emit(RecordEffect.OpenFeed(FeedEntry.FromRecord(it.postId, it.thumbnailImageUrl)))
        }
    }

    fun onOpenDisplay() = guarded {
        core.state.value.panel?.takeIf { it.actionsVisible }?.post?.let { core.emit(RecordEffect.OpenDisplay(it.topicDate)) }
    }

    /** Error screen "다시 시도". */
    fun onRetry() = guarded {
        if (!core.member || core.state.value.phase != RecordPhase.Error) return@guarded
        core.supersedeNavigation()
        core.showLoading()
        loader.loadMonths()
        loader.loadCalendar(core.shown)
    }

    /** Error screen "로그인 하기" -> [RecordEffect.LoginRequired]. */
    fun onLoginTapped() = guarded { core.emit(RecordEffect.LoginRequired) }

    /** "이미지로 저장": render PNG -> save as `chalkak-calendar-yyyy-MM.png` -> toast; ignored while saving. */
    fun onSaveImage() = guarded { saveFlow.start() }

    /** Logout / login switched the account: cache, selection and in-flight results of the previous account are dropped, then load again. */
    fun onAccountChanged(mode: HomeMode) = guarded {
        loader.cancelAll()
        saveFlow.cancel()
        core.reset(mode)
        if (core.member) enter(null)
    }

    /** Entry / foreground: current month recomputed, shown month kept (first entry: requested or current month), then revalidate. */
    private fun enter(requestedDate: LocalDate?) {
        core.refreshCurrentMonth()
        val current = core.state.value.currentMonth
        val requested = requestedDate?.takeIf { YearMonth.from(it) <= current }
        val target = requested?.let(YearMonth::from) ?: if (core.entered) core.shown else current
        core.entered = true
        if (target != core.shown) core.switchMonth(target)
        if (requested != null) core.requestedDate = requested
        loader.loadMonths()
        showAndLoad(target)
    }

    /** Arrows / picker: only inside `availableMonths`, the shown or an unknown month is a no-op (REQ-REC-005/006). */
    private fun moveTo(month: YearMonth) {
        if (!core.member || month == core.shown || month !in core.state.value.availableMonths) return
        core.switchMonth(month)
        showAndLoad(month)
    }

    private fun showAndLoad(month: YearMonth) {
        core.showCachedOrLoading()
        loader.loadCalendar(month)
    }

    /** No public handler may throw: a bug becomes the error state / toast. */
    private inline fun guarded(block: () -> Unit) {
        try {
            block()
        } catch (e: Exception) {
            core.crashed()
        }
    }
}
