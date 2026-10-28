package kr.chalkak.feature.display

import java.time.LocalDate
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeSnapshot
import kr.chalkak.core.data.post.PostPage
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.data.post.PostsQuery
import kr.chalkak.core.data.post.Topic
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.guardedApiCall

/** Cache key of a list: the date and the sort actually requested (archive = POPULAR). */
internal data class ListKey(val date: LocalDate, val sort: PostSort)

/** Pages of one (date, sort) list. [pages] are in server order; the flattened list shows an id once (REQ-DISP-023). */
internal data class CachedList(
    val topic: Topic,
    val pages: List<List<PostSummary>>,
    val hasNext: Boolean,
    val randomSeed: String?,
) {
    val nextPage: Int get() = pages.size + 1
    val posts: List<PostSummary> get() = pages.flatten().distinctBy { it.id }
}

/**
 * Topic + page loading and the per-(date, sort) cache of the exhibition (REQ-DISP-002, 020..028). Knows nothing of
 * what is shown: the holder decides which list to display and when a result may commit. Single-threaded like the holder.
 */
internal class DisplayLists(
    private val repository: PostRepository,
    private val likes: LikeController,
) {
    private val cache = HashMap<ListKey, CachedList>()
    private val firstPageLoads = HashMap<Long, ListKey>()
    private val pagingKeys = HashSet<ListKey>()
    private var loadCounter = 0L

    operator fun get(key: ListKey): CachedList? = cache[key]

    /** Drops cached lists (account change). Running loads are cancelled by the holder via [forgetLoads]. */
    fun clear() = cache.clear()

    /** Forgets the bookkeeping of cancelled loads. */
    fun forgetLoads() {
        firstPageLoads.clear()
        pagingKeys.clear()
    }

    fun isLoadingFirstPage(key: ListKey?): Boolean = key != null && key in firstPageLoads.values

    fun isPaging(key: ListKey?): Boolean = key != null && key in pagingKeys

    /** Leaving random for another sort drops its seed: coming back starts a new random order (REQ-DISP-021). */
    fun forgetRandomSeed(date: LocalDate) {
        val key = ListKey(date, PostSort.RANDOM)
        cache[key]?.let { cache[key] = it.copy(randomSeed = null) }
    }

    /** The list that may request its next page now (REQ-DISP-026), or null. Marks it as paging. */
    fun beginNextPage(key: ListKey): CachedList? {
        val list = cache[key] ?: return null
        if (!list.hasNext || key in pagingKeys || isLoadingFirstPage(key)) return null
        if (key.sort == PostSort.RANDOM && list.randomSeed == null) return null
        pagingKeys += key
        return list
    }

    /** REQ-DISP-002: the topic of a date must carry that date, otherwise the response is invalid. */
    suspend fun topic(target: LocalDate): ApiResult<Topic> =
        guardedApiCall("topic") {
            when (val result = repository.topic(target)) {
                is ApiResult.Success ->
                    if (result.value.date == target) result else ApiResult.Failure(ApiError.InvalidResponse("topicDate differs from the requested date"))
                is ApiResult.Failure -> result
            }
        }

    /**
     * Loads page 1 of [key], keeps the cached later pages of the same list and stores the result in the cache.
     * [onChange] runs after the load was registered (the holder shows "refreshing").
     */
    suspend fun loadFirstPage(key: ListKey, topic: Topic, onChange: () -> Unit): ApiResult<CachedList> {
        val loadId = ++loadCounter
        firstPageLoads[loadId] = key
        onChange()
        try {
            val revision = likes.revision()
            val seed = cache[key]?.randomSeed
            val result = guardedApiCall("posts") {
                repository.posts(PostsQuery(key.date, key.sort, page = 1, randomSeed = seed.takeIf { key.sort == PostSort.RANDOM }))
            }
            return when (result) {
                is ApiResult.Failure -> result
                is ApiResult.Success -> {
                    val list = mergeFirstPage(cache[key], topic, key, result.value, mergeLikes(result.value.posts, revision))
                    cache[key] = list
                    ApiResult.Success(list)
                }
            }
        } finally {
            firstPageLoads.remove(loadId)
        }
    }

    /** Requests [page] of [key] (after [beginNextPage]) and appends it unless the list moved on meanwhile. */
    suspend fun loadNextPage(key: ListKey, page: Int, seed: String?): ApiResult<Unit> {
        try {
            val revision = likes.revision()
            val result = guardedApiCall("posts") {
                repository.posts(PostsQuery(key.date, key.sort, page, seed.takeIf { key.sort == PostSort.RANDOM }))
            }
            return when (result) {
                is ApiResult.Failure -> result
                is ApiResult.Success -> {
                    appendPage(key, page, seed, result.value, revision)
                    ApiResult.Success(Unit)
                }
            }
        } finally {
            pagingKeys -= key
        }
    }

    private fun mergeFirstPage(old: CachedList?, topic: Topic, key: ListKey, page: PostPage, posts: List<PostSummary>): CachedList {
        val seed = page.randomSeed.takeIf { key.sort == PostSort.RANDOM }
        val keepTail = old != null && old.pages.size > 1 && (key.sort != PostSort.RANDOM || (seed != null && seed == old.randomSeed))
        return if (keepTail) {
            CachedList(topic, listOf(posts) + old!!.pages.drop(1), old.hasNext, seed)
        } else {
            CachedList(topic, listOf(posts), page.hasNext, seed)
        }
    }

    private fun appendPage(key: ListKey, page: Int, seed: String?, response: PostPage, revision: Long) {
        val current = cache[key] ?: return
        if (current.nextPage != page || current.randomSeed != seed) return
        val posts = mergeLikes(response.posts, revision)
        cache[key] = current.copy(pages = current.pages + listOf(posts), hasNext = response.hasNext)
    }

    /** Registers the server like values in the shared controller and keeps what the user changed meanwhile. */
    private fun mergeLikes(posts: List<PostSummary>, requestedAtRevision: Long): List<PostSummary> =
        posts.map { post ->
            val shown = likes.merge(post.id, LikeSnapshot(post.isLiked, post.likeCount), requestedAtRevision)
            post.copy(isLiked = shown.isLiked, likeCount = shown.likeCount)
        }
}
