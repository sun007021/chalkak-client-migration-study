package kr.chalkak.feature.display

import java.time.LocalDate
import kotlinx.coroutines.Job
import kr.chalkak.core.data.post.Topic
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.httpStatus

/**
 * Loads dates and lists for the exhibition and decides which answer may become the shown one. Every request that
 * decides what is shown takes a generation from [navigation]; only the newest generation may commit, older answers
 * are dropped (REQ-DISP-028). Date moves load the target BEFORE the screen switches (REQ-DISP-006).
 */
internal class DateNavigator(
    private val view: DisplayView,
    private val lists: DisplayLists,
    private val launch: (suspend () -> Unit) -> Job,
    private val publish: () -> Unit,
    private val toast: (String) -> Unit,
) {
    /** Bumped by every request that decides what is shown; only the newest one may commit. */
    private var navigation = 0L
    private var initialJob: Job? = null

    val isInitialLoading: Boolean get() = initialJob?.isActive == true

    /** Invalidates every running request (their jobs are cancelled by the owner of the job tracker). */
    fun cancelAll() {
        navigation++
        initialJob = null
        view.pendingDate = null
        view.targetKey = null
    }

    fun startInitialLoad() {
        val generation = ++navigation
        view.baseStatus = DisplayStatus.Loading
        view.failureKey = null
        view.pendingDate = null
        view.targetKey = null
        val target = view.date
        initialJob = launch { loadDate(target, generation, ::failInitial) }
    }

    /** Moves one day from the date being navigated to (pending target if a move is in flight). */
    fun moveFrom(step: (LocalDate) -> LocalDate?) {
        if (view.isFirstLoading()) return
        step(view.pendingDate ?: view.date)?.let(::startMove)
    }

    /** Date picker result; clamped into the range; the shown date again = no request. */
    fun select(date: LocalDate) {
        if (view.isFirstLoading()) return
        val target = view.range.clamp(date)
        when {
            target == (view.pendingDate ?: view.date) -> Unit
            target == view.date -> abandonMove()
            else -> startMove(target)
        }
    }

    /** Revalidates the shown list, or switches to the list the current date/clock asks for (midnight, REQ-DISP-015). */
    fun refreshShown() {
        val key = ListKey(view.date, view.sortFor(view.date))
        if (lists.isLoadingFirstPage(key)) return
        if (key == view.viewKey) refreshFirstPage(key, commitGeneration = null) else switchTo(key)
    }

    fun switchTo(key: ListKey) {
        val generation = ++navigation
        val cached = lists[key]
        if (cached != null) {
            view.viewKey = key
            view.viewTopic = cached.topic
            view.targetKey = null
        } else {
            view.targetKey = key
        }
        refreshFirstPage(key, commitGeneration = if (cached == null) generation else null)
    }

    private fun startMove(target: LocalDate) {
        val generation = ++navigation
        view.pendingDate = target
        launch { loadDate(target, generation) { g, error, _ -> failMove(g, error) } }
        publish()
    }

    private fun abandonMove() {
        navigation++
        view.pendingDate = null
        publish()
    }

    /**
     * Topic, then page 1 of [target]; commits it when [generation] is still the newest request, otherwise the answer
     * is dropped. A failure goes to [onFailure] (with the topic when it was already known).
     */
    private suspend fun loadDate(target: LocalDate, generation: Long, onFailure: (Long, ApiError, Topic?) -> Unit) {
        val topic = when (val result = lists.topic(target)) {
            is ApiResult.Success -> result.value
            is ApiResult.Failure -> return onFailure(generation, result.error, null)
        }
        if (generation != navigation) return
        val key = ListKey(target, view.sortFor(target))
        when (val result = lists.loadFirstPage(key, topic, publish)) {
            is ApiResult.Success -> if (generation == navigation) commit(key, topic)
            is ApiResult.Failure -> onFailure(generation, result.error, topic)
        }
        publish()
    }

    private fun failInitial(generation: Long, error: ApiError, topic: Topic?) {
        if (generation != navigation) return
        view.viewTopic = topic
        if (error.httpStatus == 404) {
            view.baseStatus = DisplayStatus.Empty
            view.failureKey = null
        } else {
            view.baseStatus = DisplayStatus.Error
            view.failureKey = failureCopyKey(error)
        }
        publish()
    }

    private fun failMove(generation: Long, error: ApiError) {
        if (generation != navigation) return
        view.pendingDate = null
        toast(missingOrFailureKey(error))
        publish()
    }

    private fun refreshFirstPage(key: ListKey, commitGeneration: Long?) {
        val topic = lists[key]?.topic ?: view.viewTopic ?: return
        launch {
            when (val result = lists.loadFirstPage(key, topic, publish)) {
                is ApiResult.Success -> if (commitGeneration != null && commitGeneration == navigation) commit(key, topic)
                is ApiResult.Failure -> failRefresh(key, commitGeneration, result.error)
            }
            publish()
        }
    }

    private fun failRefresh(key: ListKey, commitGeneration: Long?, error: ApiError) {
        if (commitGeneration != null) {
            if (commitGeneration != navigation) return
            view.targetKey = null
            if (key.date == view.date && !view.isArchive()) view.viewKey?.let { view.sort = it.sort }
        }
        toast(missingOrFailureKey(error))
    }

    private fun commit(key: ListKey, topic: Topic) {
        if (key.date != view.date) view.featuredPage = 0
        view.viewKey = key
        view.viewTopic = topic
        view.date = key.date
        view.baseStatus = DisplayStatus.Content
        view.failureKey = null
        view.pendingDate = null
        view.targetKey = null
    }

    private fun missingOrFailureKey(error: ApiError) =
        if (error.httpStatus == 404) CopyKeys.DISPLAY_DATE_MISSING else failureCopyKey(error)
}

/** Network wording for connection problems, the generic exhibition error otherwise (D-20). */
internal fun failureCopyKey(error: ApiError) = if (error is ApiError.Network) CopyKeys.NETWORK else CopyKeys.DISPLAY_ERROR
