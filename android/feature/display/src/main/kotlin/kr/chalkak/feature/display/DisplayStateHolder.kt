package kr.chalkak.feature.display

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.common.KstCalendar
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.core.data.post.CurrentUser
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeEvent
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import java.time.LocalDate

/** Archive carousel size (REQ-DISP-018). */
private const val FEATURED_PHOTO_COUNT = 5

/**
 * Exhibition tab (DISP) + its like handling (LIKE). Runs on [scope]; every request is cancellable and stale answers
 * (date/sort/generation changed) are never shown. Lists are cached per (date, sort).
 *
 * Contract used by the tests:
 *  - first [onScreenShown] loads; later [onScreenShown] / [onTabReselected] revalidate the first page of the shown
 *    list (old photos stay, the cached tail is kept); [onScreenHidden] cancels in-flight list requests silently and
 *    suppresses toasts (likes keep running in [LikeController]); a cancelled first load is redone on the next show;
 *  - toasts are only set while the screen is shown; every toast gets a new [ToastMessage.id];
 *  - date moves load the target's topic and first page BEFORE the screen switches; only the latest move may commit
 *    and repeated moves continue from the pending target;
 *  - `screen_view` is sent when the screen becomes visible, not on repeated [onScreenShown] calls (TC-ANL-018).
 */
class DisplayStateHolder(
    scope: CoroutineScope,
    repository: PostRepository,
    private val likes: LikeController,
    private val changes: PostChanges,
    private val user: CurrentUser,
    private val calendar: KstCalendar,
    private val analytics: AnalyticsTracker,
    /** Entry from another screen (record "전시 보러가기", upload success): open this date instead of today. */
    initialDate: LocalDate? = null,
    initialSort: PostSort? = null,
) {
    private val view = DisplayView(calendar.today(), initialDate, initialSort)
    private var visible = false

    private val lists = DisplayLists(repository, likes)
    private val toasts = ToastSlot()
    private val jobs = JobTracker(scope, ::onUnexpected)
    private val navigator = DateNavigator(view, lists, jobs::launch, ::publish, ::showToast)

    private val _state = MutableStateFlow(buildState())
    val state: StateFlow<DisplayUiState> = _state.asStateFlow()

    private val _effects = Channel<DisplayEffect>(Channel.BUFFERED)
    val effects: Flow<DisplayEffect> = _effects.receiveAsFlow()

    init {
        // Everything derived from shared data (likes, removals, title edits) follows it without a screen event.
        scope.launch(start = CoroutineStart.UNDISPATCHED) { likes.states.collect { publish() } }
        scope.launch(start = CoroutineStart.UNDISPATCHED) { changes.removed.collect { publish() } }
        scope.launch(start = CoroutineStart.UNDISPATCHED) { changes.titles.collect { publish() } }
        scope.launch(start = CoroutineStart.UNDISPATCHED) { likes.events.collect(::onLikeEvent) }
    }

    fun onScreenShown() {
        if (!visible) {
            visible = true
            analytics.screenViewSafely("display")
        }
        view.latest = calendar.today()
        if (view.viewKey != null) {
            navigator.refreshShown()
        } else if (!navigator.isInitialLoading) {
            if (!view.explicitDate) view.date = view.latest
            navigator.startInitialLoad()
        }
        publish()
    }

    fun onScreenHidden() {
        visible = false
        cancelRequests()
        toasts.drop()
        publish()
    }

    /** Re-selecting the exhibition tab: scroll to top (UI) + revalidate. */
    fun onTabReselected() {
        if (view.viewKey != null) navigator.refreshShown() else if (!navigator.isInitialLoading) navigator.startInitialLoad()
        publish()
    }

    /** Moves one day back/forward from the date being navigated to (pending target if a move is in flight). */
    fun onPreviousDate() = navigator.moveFrom { view.range.previous(it) }

    fun onNextDate() = navigator.moveFrom { view.range.next(it) }

    /** Date picker result; clamped into `[earliestDate, latestDate]`; the shown date again = no request. */
    fun onDateSelected(date: LocalDate) = navigator.select(date)

    fun onSortSelected(sort: PostSort) {
        if (view.viewKey == null || view.pendingDate != null || view.isArchive()) return
        if (sort == view.sort && view.viewKey == ListKey(view.date, sort)) return
        if (view.sort == PostSort.RANDOM && sort != PostSort.RANDOM) lists.forgetRandomSeed(view.date)
        view.sort = sort
        navigator.switchTo(ListKey(view.date, sort))
        publish()
    }

    /** The list scrolled within the last 3 items. Requests the next page once (not while paging/refreshing, not at the end). */
    fun onReachedEnd() {
        val key = view.viewKey ?: return
        val list = lists.beginNextPage(key) ?: return
        jobs.launch { loadNextPage(key, list.nextPage, list.randomSeed) }
        publish()
    }

    /** "다시 시도" on the error screen: same date, same sort. */
    fun onRetry() {
        if (view.baseStatus == DisplayStatus.Error && view.viewKey == null) navigator.startInitialLoad()
        publish()
    }

    fun onPhotoClicked(postId: String) {
        if (user.userId() == null) return showToast(CopyKeys.GUEST_FEED)
        val post = displayedPhotos().firstOrNull { it.id == postId } ?: return
        _effects.trySend(DisplayEffect.OpenFeed(post))
    }

    fun onLikeClicked(postId: String) {
        likes.toggle(postId)
        publish()
    }

    fun onFeaturedPageChanged(index: Int) {
        view.featuredPage = index.coerceIn(0, maxOf(0, featuredPhotos(displayedPhotos()).size - 1))
        publish()
    }

    /** The UI displayed [ToastMessage] with this id; clears it. */
    fun onToastShown(id: Long) {
        if (toasts.shown(id)) publish()
    }

    /**
     * Logout / account switch (D-17): drop caches, seed and view of the previous account. The session owner resets the
     * shared [LikeController] (and [PostChanges]) once; this holder only clears what it derived from them.
     */
    fun onUserChanged() {
        cancelRequests()
        lists.clear()
        view.reset(calendar.today())
        toasts.drop()
        publish()
    }

    private fun cancelRequests() {
        jobs.cancelAll()
        lists.forgetLoads()
        navigator.cancelAll()
    }

    /** A bug inside a job: shown like a failed load (error screen without content, toast with content). */
    private fun onUnexpected(e: Exception) {
        view.pendingDate = null
        view.targetKey = null
        if (view.viewKey == null) {
            view.baseStatus = DisplayStatus.Error
            view.failureKey = CopyKeys.DISPLAY_ERROR
        } else {
            showToast(CopyKeys.DISPLAY_ERROR)
        }
        publish()
    }

    private suspend fun loadNextPage(key: ListKey, page: Int, seed: String?) {
        val result = lists.loadNextPage(key, page, seed)
        if (result is ApiResult.Failure) showToast(failureCopyKey(result.error))
        publish()
    }

    // ---- events and output ---------------------------------------------------------------------------------------

    private fun onLikeEvent(event: LikeEvent) {
        if (event is LikeEvent.Failed) showToast(event.failure.copyKey)
        publish()
    }

    private fun showToast(copyKey: String) {
        if (!visible) return
        toasts.show(copyKey)
        publish()
    }

    private fun publish() {
        _state.value = buildState()
    }

    private fun displayedPhotos(): List<PostSummary> {
        val list = view.viewKey?.let { lists[it] } ?: return emptyList()
        return list.posts.filterNot { changes.isRemoved(it.id) }.map(::withSharedValues)
    }

    private fun withSharedValues(post: PostSummary): PostSummary {
        val like = likes.state(post.id)?.snapshot
        val titles = changes.titles.value
        val liked = if (like == null) post else post.copy(isLiked = like.isLiked, likeCount = like.likeCount)
        return if (post.id in titles) liked.copy(title = titles[post.id]) else liked
    }

    private fun featuredPhotos(photos: List<PostSummary>) =
        if (view.isArchive()) photos.take(FEATURED_PHOTO_COUNT) else emptyList()

    private fun buildState(): DisplayUiState {
        val key = view.viewKey
        val list = key?.let { lists[it] }
        val photos = displayedPhotos()
        val status = when {
            key == null -> view.baseStatus
            photos.isEmpty() -> DisplayStatus.Empty
            else -> DisplayStatus.Content
        }
        val archive = view.isArchive()
        val movingFrom = view.pendingDate ?: view.date
        val canMove = !view.isFirstLoading()
        return DisplayUiState(
            date = view.date,
            earliestDate = view.range.earliest,
            latestDate = view.latest,
            topic = view.viewTopic,
            sort = view.sort,
            status = status,
            errorCopyKey = view.failureKey.takeIf { status == DisplayStatus.Error },
            showRetry = status == DisplayStatus.Error,
            isArchive = archive,
            sortOptions = if (archive) emptyList() else PostSort.entries,
            descriptionKey = if (archive) "display.header.desc-archive" else "display.header.desc-latest",
            dateLabel = DateFormats.monthDay(view.viewTopic?.date ?: view.date),
            photos = photos,
            featured = featuredPhotos(photos),
            featuredPage = view.featuredPage,
            hasNext = list?.hasNext ?: false,
            randomSeed = list?.randomSeed,
            isRefreshing = key != null &&
                (view.pendingDate != null || lists.isLoadingFirstPage(key) || lists.isLoadingFirstPage(view.targetKey)),
            isPaging = lists.isPaging(key),
            canGoPrevious = canMove && movingFrom > view.range.earliest,
            canGoNext = canMove && movingFrom < view.latest,
            toast = toasts.current,
        )
    }
}
