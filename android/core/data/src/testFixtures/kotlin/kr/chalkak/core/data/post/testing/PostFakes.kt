package kr.chalkak.core.data.post.testing

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.post.CurrentUser
import kr.chalkak.core.data.post.LikeResult
import kr.chalkak.core.data.post.PostDetail
import kr.chalkak.core.data.post.PostPage
import kr.chalkak.core.data.post.PostRepository
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.PostSummary
import kr.chalkak.core.data.post.PostsQuery
import kr.chalkak.core.data.post.TitleUpdateResult
import kr.chalkak.core.data.post.Topic
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiJson
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList

const val USER_A_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const val USER_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

/** Fixture ids (shared/fixtures/feed + like). 201 is user A's own post of today, 202 belongs to user B. */
const val POST_MINE = "22222222-2222-4222-8222-222222222201"
const val POST_OTHER = "22222222-2222-4222-8222-222222222202"
const val POST_MINE_PAST = "22222222-2222-4222-8222-222222222290"

/** Mutable [CurrentUser]; `null` = guest. */
class FakeUser(var id: String? = USER_A_ID) : CurrentUser {
    override fun userId(): String? = id
}

/** Loads typed values from `shared/fixtures/` (never copies payloads into tests). */
object PostFixtures {
    private fun <T> parse(path: String, serializer: kotlinx.serialization.KSerializer<T>): T =
        ApiJson.instance.decodeFromString(serializer, Fixtures.read(path))

    fun topic(path: String): Topic = parse(path, Topic.serializer())
    fun page(path: String): PostPage = parse(path, PostPage.serializer())
    fun detail(path: String): PostDetail = parse(path, PostDetail.serializer())
    fun title(path: String): TitleUpdateResult = parse(path, TitleUpdateResult.serializer())
    fun like(path: String): LikeResult = parse(path, LikeResult.serializer())

    fun topicResult(path: String): ApiResult<Topic> = ApiResult.Success(topic(path))
    fun pageResult(path: String): ApiResult<PostPage> = ApiResult.Success(page(path))
    fun detailResult(path: String): ApiResult<PostDetail> = ApiResult.Success(detail(path))
    fun titleResult(path: String): ApiResult<TitleUpdateResult> = ApiResult.Success(title(path))
    fun likeResult(path: String): ApiResult<LikeResult> = ApiResult.Success(like(path))

    /** An error fixture (`{errorCode, message}`, status from manifest.json) as the [ApiResult] the network layer produces. */
    fun failure(path: String): ApiResult.Failure {
        val status = Fixtures.manifestEntry(path)["status"]!!.jsonPrimitive.int
        val body = Fixtures.json(path).jsonObject
        return ApiResult.Failure(
            ApiError.Http(
                status,
                ErrorCode.from(body["errorCode"]?.jsonPrimitive?.content),
                body["message"]?.jsonPrimitive?.content,
            ),
        )
    }

    fun http(status: Int, code: ErrorCode, message: String? = null) = ApiResult.Failure(ApiError.Http(status, code, message))
    fun network() = ApiResult.Failure(ApiError.Network(kr.chalkak.core.network.NetworkKind.OFFLINE))

    /** A list item of `display/posts-list__recent-page1.json` by trailing id digits ("201" = user A's own post). */
    fun summary(idSuffix: String, path: String = "display/posts-list__recent-page1.json"): PostSummary =
        page(path).posts.first { it.id.endsWith(idSuffix) }

    /** The fixture a default fake server answers for [query]. */
    fun pageFor(query: PostsQuery): PostPage {
        val file = when (query.sort) {
            PostSort.RECENT -> if (query.page == 1) "recent-page1" else "recent-page2"
            PostSort.POPULAR -> "popular-page1"
            PostSort.RANDOM -> if (query.page == 1) "random-page1-seed" else "random-page2"
        }
        return page("display/posts-list__$file.json").let { if (query.page > 2) it.copy(posts = emptyList(), hasNext = false) else it }
    }

    fun topicFor(date: LocalDate, phase: String = "OPEN"): Topic = Topic(
        id = "11111111-1111-4111-8111-111111111127",
        title = "가을 하늘",
        topicDate = date.toString(),
        startsAt = "${date.minusDays(1)}T15:00:00Z",
        endsAt = "${date}T15:00:00Z",
        phase = phase,
    )
}

/** One scripted answer. [gate] suspends the call until [release]; [delayMs] is virtual time. */
class Reply<out T>(val value: T, val gate: CompletableDeferred<Unit>? = null, val delayMs: Long = 0L) {
    fun release() { gate?.complete(Unit) }
}

fun <T> gated(value: T): Reply<T> = Reply(value, CompletableDeferred())
fun <T> delayed(value: T, delayMs: Long): Reply<T> = Reply(value, delayMs = delayMs)

/**
 * Scripted endpoint: per key a FIFO of one-shot replies, then an optional sticky reply, then [default].
 * Every call is recorded in [calls] (before it suspends), so "no request" is `calls.isEmpty()`.
 */
class Route<K : Any, V>(private val name: String, private val unscripted: (K) -> V) {
    val calls = CopyOnWriteArrayList<K>()
    private val queues = ConcurrentHashMap<K, ConcurrentLinkedQueue<Reply<V>>>()
    private val sticky = ConcurrentHashMap<K, Reply<V>>()
    @Volatile var default: ((K) -> V)? = null

    fun enqueue(key: K, vararg replies: Reply<V>) {
        queues.getOrPut(key) { ConcurrentLinkedQueue() }.addAll(replies)
    }

    fun enqueue(key: K, vararg values: V) = enqueue(key, *values.map { Reply(it) }.toTypedArray())

    fun always(key: K, reply: Reply<V>) { sticky[key] = reply }
    fun always(key: K, value: V) = always(key, Reply(value))

    suspend fun respond(key: K): V {
        calls += key
        val reply = queues[key]?.poll() ?: sticky[key] ?: Reply(default?.invoke(key) ?: unscripted(key))
        reply.gate?.await()
        if (reply.delayMs > 0) delay(reply.delayMs)
        return reply.value
    }

    override fun toString() = "Route($name)"
}

private fun unscripted(what: Any) = ApiResult.Failure(ApiError.InvalidResponse("unscripted $what"))

/** In-memory [PostRepository]. Unscripted calls fail with InvalidResponse; [autoRespond] makes every date/query answer from fixtures. */
class FakePostRepository : PostRepository {
    val topics = Route<LocalDate, ApiResult<Topic>>("topic") { unscripted("topic $it") }
    val posts = Route<PostsQuery, ApiResult<PostPage>>("posts") { unscripted("posts $it") }
    val details = Route<String, ApiResult<PostDetail>>("detail") { unscripted("detail $it") }
    val updates = Route<String, ApiResult<TitleUpdateResult>>("updateTitle") { unscripted("updateTitle $it") }
    val deletes = Route<String, ApiResult<Unit>>("delete") { unscripted("delete $it") }

    /** Titles sent by [updateTitle], in order, as (postId, title). */
    val sentTitles = CopyOnWriteArrayList<Pair<String, String?>>()

    /** `put == true` -> PUT. Replace to script like calls ([FakeLikeServer.handle] is the usual handler). */
    @Volatile var likeHandler: suspend (put: Boolean, postId: String) -> ApiResult<LikeResult> =
        { put, id -> unscripted("like put=$put $id") }
    val likeCalls = CopyOnWriteArrayList<String>()

    /** Every date answers with a generated topic; every query with the matching fixture page. */
    fun autoRespond(phase: String = "OPEN"): FakePostRepository {
        topics.default = { ApiResult.Success(PostFixtures.topicFor(it, phase)) }
        posts.default = { ApiResult.Success(PostFixtures.pageFor(it)) }
        return this
    }

    override suspend fun topic(date: LocalDate) = topics.respond(date)
    override suspend fun posts(query: PostsQuery) = posts.respond(query)
    override suspend fun detail(postId: String) = details.respond(postId)

    override suspend fun updateTitle(postId: String, title: String?): ApiResult<TitleUpdateResult> {
        sentTitles += postId to title
        return updates.respond(postId)
    }

    override suspend fun delete(postId: String) = deletes.respond(postId)

    override suspend fun like(postId: String): ApiResult<LikeResult> {
        likeCalls += "PUT $postId"
        return likeHandler(true, postId)
    }

    override suspend fun unlike(postId: String): ApiResult<LikeResult> {
        likeCalls += "DELETE $postId"
        return likeHandler(false, postId)
    }
}

/**
 * Stateful fake of the like endpoints: idempotent PUT/DELETE over per-post server state, optional per-call gates and
 * scripted failures, and a high-water mark of concurrent in-flight calls per post.
 */
class FakeLikeServer(
    private val initialLiked: Boolean = false,
    private val initialCount: Int = 10,
    /** Virtual milliseconds every call takes. */
    var latencyMs: Long = 0L,
) {
    private val liked = ConcurrentHashMap<String, Boolean>()
    private val counts = ConcurrentHashMap<String, Int>()
    private val gates = ConcurrentHashMap<String, ConcurrentLinkedQueue<CompletableDeferred<Unit>>>()
    private val failures = ConcurrentHashMap<String, ConcurrentLinkedQueue<ApiResult.Failure>>()
    private val inFlight = ConcurrentHashMap<String, Int>()

    /** "PUT <id>" / "DELETE <id>" in arrival order. */
    val calls = CopyOnWriteArrayList<String>()
    @Volatile var maxInFlightPerPost = 0
    @Volatile var maxInFlightTotal = 0
    private val total = java.util.concurrent.atomic.AtomicInteger()

    fun isLiked(postId: String): Boolean = liked[postId] ?: initialLiked
    fun likeCount(postId: String): Int = counts[postId] ?: initialCount

    /** The next call for [postId] suspends until the returned gate is completed. */
    fun hold(postId: String): CompletableDeferred<Unit> =
        CompletableDeferred<Unit>().also { gates.getOrPut(postId) { ConcurrentLinkedQueue() }.add(it) }

    /** The next call for [postId] answers [failure] without changing server state. */
    fun failNext(postId: String, failure: ApiResult.Failure) {
        failures.getOrPut(postId) { ConcurrentLinkedQueue() }.add(failure)
    }

    suspend fun handle(put: Boolean, postId: String): ApiResult<LikeResult> {
        calls += (if (put) "PUT " else "DELETE ") + postId
        val now = synchronized(inFlight) {
            val n = (inFlight[postId] ?: 0) + 1
            inFlight[postId] = n
            if (n > maxInFlightPerPost) maxInFlightPerPost = n
            val t = total.incrementAndGet()
            if (t > maxInFlightTotal) maxInFlightTotal = t
            n
        }
        check(now >= 1)
        try {
            gates[postId]?.poll()?.await()
            if (latencyMs > 0) delay(latencyMs)
            failures[postId]?.poll()?.let { return it }
            val wasLiked = isLiked(postId)
            if (put && !wasLiked) {
                liked[postId] = true
                counts[postId] = likeCount(postId) + 1
            } else if (!put && wasLiked) {
                liked[postId] = false
                counts[postId] = maxOf(0, likeCount(postId) - 1)
            }
            return ApiResult.Success(LikeResult(postId, likeCount(postId), isLiked(postId)))
        } finally {
            synchronized(inFlight) {
                inFlight[postId] = (inFlight[postId] ?: 1) - 1
                total.decrementAndGet()
            }
        }
    }
}
