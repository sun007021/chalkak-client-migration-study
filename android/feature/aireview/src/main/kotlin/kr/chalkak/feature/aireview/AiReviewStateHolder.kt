package kr.chalkak.feature.aireview

import kotlinx.coroutines.CancellationException
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
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.MonotonicClock
import kr.chalkak.core.data.aireview.AiReview
import kr.chalkak.core.data.aireview.AiReviewRepository
import kr.chalkak.core.data.aireview.AiReviewStatus
import kr.chalkak.core.data.post.CurrentUser
import kr.chalkak.core.network.ApiResult

/**
 * AI feedback pill + sheets + polling for ONE post at a time. It does not know the feed or the home screen: the host
 * forwards (1) the target once the post is known to be mine, (2) visibility, (3) user changes, (4) clicks.
 *
 *  - Nothing is sent before a target is set AND the screen is shown AND the user is logged in (guests: Hidden, 0 calls).
 *  - `POST` only from [onStartConfirmed]; never automatic, never repeated (REQ-AIR-019/020).
 *  - Polling (3s, 300s window, D-03) uses coroutine `delay` for the interval and [windowClock] for the window, so tests
 *    drive both with the test scheduler.
 *  - [calendar] is read at every click so KST midnight is honoured (REQ-AIR-003); [windowClock] never reads `requestedAt`.
 *
 * @param refreshCompletedOnShow true = detail behaviour (REQ-AIR-051: re-entering re-GETs a completed result);
 *   false = home card behaviour (a completed result of the same target is kept, PROCESSING resumes polling, TC-AIR-018).
 * @param openSheetOnEntry push entry (`PostDetail(openAiFeedbackSheet = true)`, REQ-AIR-046/047): after the FIRST
 *   resolved GET open the result sheet (COMPLETED) or the failure sheet (FAILED) exactly once; PROCESSING / NONE open nothing.
 */
class AiReviewStateHolder(
    private val scope: CoroutineScope,
    private val repository: AiReviewRepository,
    private val user: CurrentUser,
    private val calendar: KstCalendar,
    private val windowClock: MonotonicClock,
    private val refreshCompletedOnShow: Boolean = true,
    private val openSheetOnEntry: Boolean = false,
) {
    private val store = MutableStateFlow(AiReviewUiState(AiPill.Hidden, null, false, null, null, null))
    private val effectChannel = Channel<AiReviewEffect>(Channel.UNLIMITED)
    private val poller = AiPoller(repository, windowClock)

    val state: StateFlow<AiReviewUiState> = store.asStateFlow()

    val effects: Flow<AiReviewEffect> = effectChannel.receiveAsFlow()

    private var target: AiReviewTarget? = null
    private var visible = false

    /** [setTarget] began the load while visible; the host's next [onScreenShown] is the same event and must not GET again. */
    private var loadStartedByTarget = false
    private var cleared = false
    private var gate = AiGate.Idle
    private var requesting = false
    private var entryOpenPending = openSheetOnEntry

    /** Bumped by everything that invalidates in-flight work; answers of an older generation change nothing. */
    private var generation = 0L
    private var run: Job? = null
    private val toasts = AiToasts()

    /** The post to serve, or null for "none". A different target drops everything of the old one (late answers too); the same target is a no-op. */
    fun setTarget(target: AiReviewTarget?) {
        if (cleared || target == this.target) return
        this.target = target
        resetForNewSubject()
        if (visible) {
            begin()
            loadStartedByTarget = target != null
        }
    }

    /**
     * Screen became visible: GET (never POST), then poll while PROCESSING. A repeated call while visible re-validates
     * with a fresh GET, except the one that directly follows a [setTarget] which already started the load: show +
     * target change send exactly one GET in either order (also on an immediate dispatcher, where nothing is queued).
     */
    fun onScreenShown() {
        if (cleared) return
        val loadJustStarted = loadStartedByTarget
        loadStartedByTarget = false
        if (visible && loadJustStarted) return
        visible = true
        begin()
    }

    /** Screen is not visible (background, covered, other tab): stop polling, discard in-flight answers, clear the transient poll message. */
    fun onScreenHidden() {
        if (cleared) return
        visible = false
        loadStartedByTarget = false
        invalidateRun()
        requesting = false
        if (gate == AiGate.Checking) gate = AiGate.Idle
        edit { it.copy(toast = null) }
    }

    /** Pill tap: Request -> start sheet, Retry -> re-request sheet, View -> result sheet, Failed -> failure sheet, Recheck -> GET. Other pills ignore it. */
    fun onPillClicked() {
        if (cleared) return
        edit { it } // KST midnight may have passed since the pill was drawn (REQ-AIR-003)
        val review = store.value.review
        when (store.value.pill) {
            AiPill.Recheck -> recheck()
            AiPill.Request -> openSheet(AiSheet.Start(retry = false))
            AiPill.Retry -> openSheet(AiSheet.Start(retry = true))
            AiPill.View -> review?.let { r -> AiSheets.result(r)?.let(::openSheet) }
            AiPill.Failed -> review?.let { openSheet(AiSheets.failed(it, isToday())) }
            else -> Unit
        }
    }

    /** "분석 시작하기": the only way a POST is sent. Ignored while a POST is in flight or when the date check fails. */
    fun onStartConfirmed() {
        val post = target?.postId
        if (cleared || post == null || requesting || store.value.sheet !is AiSheet.Start) return
        if (!AiPillLogic.requestAllowed(store.value.review, isToday())) {
            edit { it.copy(sheet = null) }
            return
        }
        val windowStart = windowClock.nanoTime() // REQ-AIR-026: the window opens when the POST is sent
        requesting = true
        toasts.newRun()
        edit { it.copy(sheet = null, criteriaDialogOpen = false, noticeCopyKey = null) }
        launchRun { token -> postAndFollow(post, windowStart, token) }
    }

    /** Any sheet closed without an action (start sheet: no request). Also closes the criteria dialog. */
    fun onSheetDismissed() {
        edit { it.copy(sheet = null, criteriaDialogOpen = false) }
    }

    fun onCriteriaHelpClicked() {
        edit { if (it.sheet is AiSheet.Result) it.copy(criteriaDialogOpen = true) else it }
    }

    fun onCriteriaHelpDismissed() {
        edit { it.copy(criteriaDialogOpen = false) }
    }

    fun onToastShown(id: Long) {
        edit { if (it.toast?.id == id) it.copy(toast = null) else it }
    }

    /** Logout / account switch (D-17): target, review, sheets and in-flight answers of the old account are dropped. */
    fun onUserChanged() {
        if (cleared) return
        target = null
        resetForNewSubject()
    }

    /** Host screen closed: cancel everything; late answers change nothing and show nothing. */
    fun onCleared() {
        cleared = true
        invalidateRun()
    }

    // ---- entering and re-checking ---------------------------------------------------------------------------

    private fun begin() {
        invalidateRun()
        requesting = false
        toasts.newRun()
        val post = target?.postId
        if (post == null || user.userId() == null) { // guests: no pill, no call (REQ-AIR-007)
            gate = AiGate.Idle
            edit { it.copy(noticeCopyKey = null) }
            return
        }
        val review = store.value.review
        gate = if (review == null) AiGate.Checking else AiGate.Idle
        edit { it.copy(noticeCopyKey = null) }
        if (!refreshCompletedOnShow && review?.status == AiReviewStatus.COMPLETED) return
        launchGetAndPoll(post)
    }

    private fun recheck() {
        val post = target?.postId ?: return
        gate = AiGate.Checking
        toasts.newRun()
        edit { it.copy(toast = null, noticeCopyKey = null) }
        launchGetAndPoll(post)
    }

    private fun launchGetAndPoll(post: String) {
        val windowStart = windowClock.nanoTime()
        launchRun { token ->
            val result = guardedApiCall("ai-review get") { repository.get(post) }
            if (applyGet(result, token, firstOfEntry = true)) poll(post, windowStart, token)
        }
    }

    private fun resetForNewSubject() {
        invalidateRun()
        gate = AiGate.Idle
        requesting = false
        edit { AiReviewUiState(AiPill.Hidden, null, false, null, null, null) }
    }

    // ---- POST -----------------------------------------------------------------------------------------------

    private suspend fun postAndFollow(post: String, windowStart: Long, token: Long) {
        val result = guardedApiCall("ai-review post") { repository.request(post) }
        if (token != generation) return
        requesting = false
        when (result) {
            is ApiResult.Success -> {
                accept(result.value, openEntrySheet = false)
                if (result.value.status == AiReviewStatus.PROCESSING) poll(post, windowStart, token)
            }
            is ApiResult.Failure -> onPostFailure(AiFailure.of(result.error, isPost = true), post, windowStart, token)
        }
    }

    private suspend fun onPostFailure(failure: AiFailure, post: String, windowStart: Long, token: Long) {
        when (failure) {
            AiFailure.NotFound -> {
                gate = AiGate.Gone
                showToast("ai.error.not-found")
            }
            AiFailure.LoginRequired -> loginRequired()
            AiFailure.Banned -> showToast("ai.error.banned")
            is AiFailure.ServerMessage -> showToast(null, failure.message)
            AiFailure.Conflict -> syncAfterPost(post, windowStart, token)
            is AiFailure.Generic -> {
                showToast(failure.copyKey)
                syncAfterPost(post, windowStart, token)
            }
        }
        edit { it }
    }

    /** The POST may have been accepted although its answer was lost: ask once, never POST again (REQ-AIR-024). */
    private suspend fun syncAfterPost(post: String, windowStart: Long, token: Long) {
        val result = guardedApiCall("ai-review sync") { repository.get(post) }
        if (applyGet(result, token, firstOfEntry = false)) poll(post, windowStart, token)
    }

    // ---- answers --------------------------------------------------------------------------------------------

    /** Applies a GET answer; returns true when polling should (continue to) run. */
    private fun applyGet(result: ApiResult<AiReview>, token: Long, firstOfEntry: Boolean): Boolean {
        if (token != generation) return false
        return when (result) {
            is ApiResult.Success -> {
                accept(result.value, openEntrySheet = firstOfEntry)
                result.value.status == AiReviewStatus.PROCESSING
            }
            is ApiResult.Failure -> onGetFailure(AiFailure.of(result.error, isPost = false))
        }
    }

    private fun onGetFailure(failure: AiFailure): Boolean {
        when (failure) {
            AiFailure.NotFound -> {
                gate = AiGate.Gone
                edit { it.copy(review = null, sheet = null, criteriaDialogOpen = false, noticeCopyKey = null) }
                return false
            }
            AiFailure.LoginRequired -> {
                loginRequired()
                return false
            }
            is AiFailure.Generic -> showToastOnce(failure.copyKey)
            else -> showToastOnce("ai.error.load")
        }
        val review = store.value.review
        gate = if (review == null) AiGate.CheckFailed else AiGate.Idle
        edit { it }
        return review?.status == AiReviewStatus.PROCESSING
    }

    private fun accept(review: AiReview, openEntrySheet: Boolean) {
        gate = AiGate.Idle
        val sheet = if (openEntrySheet) entrySheetFor(review) else null
        edit {
            it.copy(
                review = review,
                sheet = sheet ?: it.sheet,
                noticeCopyKey = if (review.status == AiReviewStatus.PROCESSING) it.noticeCopyKey else null,
            )
        }
    }

    /** REQ-AIR-047: the first answer of an entry decides, once. */
    private fun entrySheetFor(review: AiReview): AiSheet? {
        if (!entryOpenPending) return null
        entryOpenPending = false
        return AiSheets.forEntry(review, isToday())
    }

    private suspend fun poll(post: String, windowStart: Long, token: Long) {
        val end = poller.poll(post, windowStart) { applyGet(it, token, firstOfEntry = false) }
        if (end == PollEnd.WindowEnded && token == generation) edit { it.copy(noticeCopyKey = "ai.poll.timeout") }
    }

    private fun loginRequired() {
        showToast("ai.error.login")
        effectChannel.trySend(AiReviewEffect.LoginRequired)
    }

    // ---- plumbing -------------------------------------------------------------------------------------------

    /** Runs [body] as the one current run. A bug inside it is shown as "could not load", never rethrown into the scope. */
    private fun launchRun(body: suspend (token: Long) -> Unit) {
        invalidateRun()
        val token = generation
        run = scope.launch {
            try {
                body(token)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                if (token == generation) onUnexpected()
            }
        }
    }

    private fun onUnexpected() {
        requesting = false
        if (store.value.review == null) gate = AiGate.CheckFailed
        showToast("ai.error.load")
        edit { it }
    }

    private fun invalidateRun() {
        generation++
        run?.cancel()
        run = null
    }

    private fun showToast(copyKey: String?, serverMessage: String? = null) {
        val toast = toasts.create(copyKey, serverMessage)
        edit { it.copy(toast = toast) }
    }

    private fun showToastOnce(copyKey: String) {
        toasts.once(copyKey)?.let { toast -> edit { it.copy(toast = toast) } }
    }

    private fun openSheet(sheet: AiSheet) {
        if (sheet is AiSheet.Start && !AiPillLogic.requestAllowed(store.value.review, isToday())) return
        edit { it.copy(sheet = sheet, criteriaDialogOpen = false) }
    }

    private fun isToday(): Boolean = target?.let { it.topicDate == calendar.today() } ?: false

    /** Every state change goes through here so the pill is always derived from the same inputs. */
    private fun edit(change: (AiReviewUiState) -> AiReviewUiState) {
        store.update { old ->
            val next = change(old)
            next.copy(pill = AiPillLogic.pill(target != null, gate, requesting, next.review, isToday()))
        }
    }
}
