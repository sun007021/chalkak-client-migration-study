package kr.chalkak.feature.display

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.PostTitle
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.common.analytics.screenViewSafely
import kr.chalkak.core.data.post.CurrentUser
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeEvent
import kr.chalkak.core.data.post.LikeSnapshot
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostDetail
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.JobTracker
import kr.chalkak.core.network.httpStatus

/**
 * Post detail (FEED) incl. title edit, delete and the heart (LIKE). Shares [LikeController] and [PostChanges] with
 * the other screens. [calendar] is read on every check so the edit button follows KST midnight (T6/T9).
 * `screen_view` `feed` is sent when the screen becomes visible, whatever the entry (TC-ANL-007, TC-ANL-018).
 */
class FeedStateHolder(
    private val scope: CoroutineScope,
    private val repository: PostRepository,
    private val likes: LikeController,
    private val changes: PostChanges,
    private val user: CurrentUser,
    private val calendar: KstCalendar,
    private val analytics: AnalyticsTracker,
    private val entry: FeedEntry,
) {
    private val postId: String = entry.postId

    private var detail: PostDetail? = null

    /** The list item / thumbnail the screen was opened with; dropped on account change. */
    private var seedActive = true
    private var status = if (entry is FeedEntry.FromDisplay) FeedStatus.Content else FeedStatus.Loading
    private var errorKey: String? = null
    private val titleEditor = TitleEditor(repository, changes, postId)
    private var visible = false

    private val toasts = ToastSlot()
    private val jobs = JobTracker(scope, ::onUnexpected)
    private val detailSource = FeedDetailSource(repository, likes, postId)
    private val ownership = FeedOwnership(entry, user)
    private val deleteFlow = DeleteFlow(repository, changes, postId) { _effects.trySend(it) }
    private val contentFactory = FeedContentFactory(entry, likes, changes)
    private var loadJob: Job? = null

    private val _state = MutableStateFlow(buildState())
    val state: StateFlow<FeedUiState> = _state.asStateFlow()

    private val _effects = Channel<FeedEffect>(Channel.BUFFERED)
    val effects: Flow<FeedEffect> = _effects.receiveAsFlow()

    private val collectors = ArrayList<Job>()

    init {
        if (entry is FeedEntry.FromDisplay) {
            val post = entry.post
            likes.merge(post.id, LikeSnapshot(post.isLiked, post.likeCount), likes.revision())
        }
        collectors += scope.launch(start = CoroutineStart.UNDISPATCHED) { likes.states.collect { publish() } }
        collectors += scope.launch(start = CoroutineStart.UNDISPATCHED) { changes.titles.collect { publish() } }
        collectors += scope.launch(start = CoroutineStart.UNDISPATCHED) { likes.events.collect(::onLikeEvent) }
    }

    /** First show loads; later shows revalidate (content stays; a failure only toasts). */
    fun onScreenShown() {
        if (!visible) {
            visible = true
            analytics.screenViewSafely("feed")
        }
        if (status != FeedStatus.NotFound) load()
        publish()
    }

    /** Not visible: toasts are suppressed, results are still applied. */
    fun onScreenHidden() {
        visible = false
        toasts.drop()
        publish()
    }

    /** Screen closed: cancel in-flight requests; late answers are ignored and shown as nothing. */
    fun onCleared() {
        collectors.forEach { it.cancel() }
        jobs.cancelAll()
    }

    fun onRetry() {
        if (status == FeedStatus.Error) load()
        publish()
    }

    fun onLikeClicked() {
        if (detail == null || status != FeedStatus.Content) return
        likes.toggle(postId)
        publish()
    }

    /** Re-evaluated against the clock on every call (the UI may stay open across KST midnight). */
    fun canEditTitle(): Boolean {
        val current = detail ?: return false
        return status == FeedStatus.Content && isMine() && calendar.isTitleEditAllowed(current.topic.date)
    }

    /** Opens the dialog prefilled with the current title; ignored when [canEditTitle] is false. */
    fun onEditClicked() {
        if (!canEditTitle()) return
        titleEditor.open(content()?.title)
        publish()
    }

    /** Keystroke / paste: the stored input is `PostTitle.limitInput(text)` (D-01, code points). */
    fun onTitleInput(text: String) {
        titleEditor.input(text)
        publish()
    }

    fun onEditCancelled() {
        titleEditor.cancel()
        publish()
    }

    /** Sends `PostTitle.toRequestValue(input)`; ignored while saving. */
    fun onSaveClicked() {
        if (titleEditor.dialog == null || titleEditor.isSaving) return
        if (!canEditTitle()) {
            titleEditor.close()
            return publish()
        }
        val request = titleEditor.beginSave() ?: return
        jobs.launch { saveTitle(request) }
        publish()
    }

    fun onDeleteClicked() {
        deleteFlow.ask(canDelete())
        publish()
    }

    fun onDeleteCancelled() {
        deleteFlow.dismissConfirm()
        publish()
    }

    /** Sends DELETE once (ignored while [FeedUiState.deleting]); only for my posts. */
    fun onDeleteConfirmed() {
        if (!deleteFlow.confirm(canDelete())) return
        jobs.launch { deleteFlow.run()?.let(::showToast); publish() }
        publish()
    }

    fun onToastShown(id: Long) = if (toasts.shown(id)) publish() else Unit

    /** Logout / account switch (D-17): detail state, removed ids and title judgement of the old account are dropped. */
    fun onUserChanged() {
        jobs.cancelAll()
        loadJob = null
        detail = null
        seedActive = false
        ownership.dropProvisional()
        status = FeedStatus.Loading
        errorKey = null
        titleEditor.close()
        deleteFlow.reset()
        toasts.drop()
        changes.reset()
        publish()
    }

    /** A bug inside a job must not leave a spinner or a disabled dialog behind: report it like the call that was running. */
    private fun onUnexpected(e: Exception) {
        when {
            titleEditor.isSaving -> titleEditor.interrupted()
            deleteFlow.deleting -> {
                deleteFlow.reset()
                showToast(CopyKeys.FEED_DELETE_OTHER)
            }
            hasVisibleContent() -> showToast(CopyKeys.FEED_LOAD_ERROR)
            else -> {
                status = FeedStatus.Error
                errorKey = CopyKeys.FEED_LOAD_ERROR
            }
        }
        publish()
    }

    private fun hasVisibleContent() = detail != null || (seedActive && entry is FeedEntry.FromDisplay)

    private fun load() {
        if (loadJob?.isActive == true) return
        if (!hasVisibleContent()) {
            status = FeedStatus.Loading
            errorKey = null
        }
        loadJob = jobs.launch { loadDetail() }
    }

    private suspend fun loadDetail() {
        when (val result = detailSource.load()) {
            is ApiResult.Success -> {
                detail = result.value
                status = FeedStatus.Content
                errorKey = null
            }
            is ApiResult.Failure -> failLoad(result.error)
        }
        publish()
    }

    private fun failLoad(error: ApiError) {
        if (error.httpStatus == 404) return markGone()
        val loginProblem = error.httpStatus == 401
        if (loginProblem) _effects.trySend(FeedEffect.LoginRequired)
        val key = FeedFailures.load(error)
        when {
            !hasVisibleContent() -> {
                status = FeedStatus.Error
                errorKey = key
            }
            !loginProblem -> showToast(key)
        }
    }

    private fun markGone() {
        status = FeedStatus.NotFound
        errorKey = CopyKeys.FEED_NOT_FOUND
        titleEditor.close()
        deleteFlow.dismissConfirm()
        changes.markRemoved(postId)
    }

    private suspend fun saveTitle(request: TitleEditor.SaveRequest) {
        when (titleEditor.save(request)) {
            TitleSaveOutcome.SAVED -> showToast(CopyKeys.FEED_EDIT_SUCCESS)
            TitleSaveOutcome.POST_GONE -> {
                markGone()
                _effects.trySend(FeedEffect.Closed(postId))
            }
            TitleSaveOutcome.LOGIN_REQUIRED -> _effects.trySend(FeedEffect.LoginRequired)
            TitleSaveOutcome.SHOWN_IN_DIALOG -> Unit
        }
        publish()
    }

    private fun onLikeEvent(event: LikeEvent) {
        when {
            event is LikeEvent.Failed && event.postId == postId -> showToast(event.failure.copyKey)
            event is LikeEvent.PostGone && event.postId == postId -> _effects.trySend(FeedEffect.Closed(postId))
        }
        publish()
    }

    private fun showToast(copyKey: String) {
        if (!visible) return
        toasts.show(copyKey)
        publish()
    }

    private fun publish() { _state.value = buildState() }

    private fun isMine() = ownership.isMine(detail)

    private fun canDelete() = detail != null && status == FeedStatus.Content && isMine()

    private fun content(): FeedContent? = contentFactory.create(detail, seedActive)

    private fun buildState(): FeedUiState {
        val confirmed = detail != null
        return FeedUiState(
            status = status,
            errorCopyKey = errorKey.takeIf { status == FeedStatus.Error || status == FeedStatus.NotFound },
            content = content(),
            confirmed = confirmed,
            isMine = isMine(),
            likeEnabled = confirmed && status == FeedStatus.Content,
            canEditTitle = canEditTitle(),
            canDelete = canDelete(),
            edit = titleEditor.dialog,
            deleteConfirmVisible = deleteFlow.confirmVisible,
            deleting = deleteFlow.deleting,
            toast = toasts.current,
        )
    }
}
