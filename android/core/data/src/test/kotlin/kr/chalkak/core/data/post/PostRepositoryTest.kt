@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.post

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kr.chalkak.core.network.StoredSession
import kr.chalkak.core.network.testing.BEARER_1
import kr.chalkak.core.network.testing.MockResponses
import kr.chalkak.core.network.testing.NetHarness
import kr.chalkak.core.network.testing.TestSessions
import kr.chalkak.core.network.testing.api
import kr.chalkak.core.network.testing.guardPath
import kr.chalkak.core.network.testing.refreshSuccess
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** HTTP-level contract of [DefaultPostRepository] against `shared/fixtures/{display,feed,like}` (catalog display-feed.md). */
class PostRepositoryTest {
    private val clock = FakeClock()
    private val today = LocalDate.of(2026, 10, 27)

    private class Env(val h: NetHarness, val repo: PostRepository) : AutoCloseable {
        override fun close() = h.close()
        fun requests(path: String): List<RecordedRequest> = h.dispatcher.requests(path)
    }

    private fun TestScope.env(initial: StoredSession = StoredSession.User(TestSessions.user(clock))): Env {
        val h = NetHarness(backgroundScope, initial, clock = clock)
        return Env(h, DefaultPostRepository(h.client))
    }

    private fun fx(path: String, status: Int? = null) = MockResponses.fromFixture(path, status)
    private fun success(r: ApiResult<*>) = assertIs<ApiResult.Success<*>>(r).value
    private fun failure(r: ApiResult<*>) = assertIs<ApiResult.Failure>(r).error
    private fun http(r: ApiResult<*>) = assertIs<ApiError.Http>(failure(r))
    private fun bodyJson(req: RecordedRequest): JsonObject = Json.parseToJsonElement(req.body.readUtf8()).jsonObject

    private fun postPath(id: String = POST_MINE) = api("/posts/$id")
    private fun likesPath(id: String = POST_MINE) = api("/posts/$id/likes")

    // ---- DISP: topics + posts -----------------------------------------------------------------------

    @Test
    fun `TC-DISP-002 topic then posts use the canonical topicDate and map all four image urls plus like fields`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/topics"), fx("display/topics__open-2026-10-27.json"))
            e.h.dispatcher.enqueue(api("/posts"), fx("display/posts-list__recent-page1.json"))
            val topic = assertIs<Topic>(success(e.repo.topic(today)))
            assertEquals("2026-10-27", e.requests(api("/topics")).single().requestUrl!!.queryParameter("date"))
            assertEquals("2026-10-27", topic.topicDate)
            assertEquals("OPEN", topic.phase)

            val page = assertIs<PostPage>(success(e.repo.posts(PostsQuery(topic.date, PostSort.RECENT))))
            val url = e.requests(api("/posts")).single().requestUrl!!
            assertEquals("2026-10-27", url.queryParameter("topicDate"))
            assertEquals("recent", url.queryParameter("sort"))
            assertEquals("1", url.queryParameter("page"))
            assertEquals("20", url.queryParameter("pageSize"))
            assertNull(url.queryParameter("randomSeed"))

            assertEquals(20, page.posts.size)
            assertTrue(page.hasNext)
            val mine = page.posts.first { it.id == POST_MINE }
            assertEquals("https://cdn.example.test/posts/$POST_MINE/original.webp", mine.originalImageUrl)
            assertEquals("https://cdn.example.test/posts/$POST_MINE/thumbnail.webp", mine.thumbnailImageUrl)
            assertEquals("https://cdn.example.test/signatures/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.png", mine.signatureOriginalImageUrl)
            assertEquals("https://cdn.example.test/signatures/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/thumbnail.png", mine.signatureThumbnailImageUrl)
            assertEquals("비 오는 날", mine.title)
            assertEquals(10, mine.likeCount)
            assertFalse(mine.isLiked)
            assertTrue(mine.isMine)
            assertNull(page.randomSeed)
        }
    }

    @Test
    fun `TC-DISP-003 query values are lower-case sort, pageSize 20, page at least 1, seed only when valid`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(
                api("/posts"),
                fx("display/posts-list__recent-page1.json"),
                fx("display/posts-list__popular-page1.json"),
                fx("display/posts-list__random-page1-seed.json"),
                fx("display/posts-list__random-page2.json"),
            )
            e.repo.posts(PostsQuery(today, PostSort.RECENT))
            e.repo.posts(PostsQuery(today, PostSort.POPULAR))
            e.repo.posts(PostsQuery(today, PostSort.RANDOM))
            e.repo.posts(PostsQuery(today, PostSort.RANDOM, page = 2, randomSeed = "seed_abc123"))
            val urls = e.requests(api("/posts")).map { it.requestUrl!! }
            assertEquals(listOf("recent", "popular", "random", "random"), urls.map { it.queryParameter("sort") })
            assertTrue(urls.all { it.queryParameter("pageSize") == "20" })
            assertEquals(listOf(null, null, null, "seed_abc123"), urls.map { it.queryParameter("randomSeed") })
            assertEquals(listOf("1", "1", "1", "2"), urls.map { it.queryParameter("page") })
        }
    }

    @Test
    fun `TC-DISP-003 invalid pages and seeds cannot be built`() {
        assertFailsWith<IllegalArgumentException> { PostsQuery(today, PostSort.RECENT, page = 0) }
        assertFailsWith<IllegalArgumentException> { PostsQuery(today, PostSort.RECENT, page = -1) }
        for (bad in listOf("", "x".repeat(65), "bad!seed", "공백 seed", "a b")) {
            assertFailsWith<IllegalArgumentException>("seed '$bad'") { PostsQuery(today, PostSort.RANDOM, page = 2, randomSeed = bad) }
        }
        // valid boundaries
        PostsQuery(today, PostSort.RANDOM, page = 2, randomSeed = "x".repeat(64))
        PostsQuery(today, PostSort.RANDOM, page = 2, randomSeed = "A-b_9")
    }

    @Test
    fun `TC-DISP-003 and TC-DISP-018 a seed on recent or popular and random page 2 without a seed cannot be built`() {
        assertFailsWith<IllegalArgumentException> { PostsQuery(today, PostSort.RECENT, randomSeed = "seed_abc123") }
        assertFailsWith<IllegalArgumentException> { PostsQuery(today, PostSort.POPULAR, randomSeed = "seed_abc123") }
        assertFailsWith<IllegalArgumentException> { PostsQuery(today, PostSort.RANDOM, page = 2) }
        PostsQuery(today, PostSort.RANDOM, page = 1) // first random page: no seed
    }

    @Test
    fun `TC-DISP-004 logged in sends Authorization, guest sends none and keeps isLiked and isMine false`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/topics"), fx("display/topics__open-2026-10-27.json"))
            e.h.dispatcher.enqueue(api("/posts"), fx("display/posts-list__recent-page1.json"))
            e.repo.topic(today)
            e.repo.posts(PostsQuery(today, PostSort.RECENT))
            assertEquals(BEARER_1, e.requests(api("/topics")).single().getHeader("Authorization"))
            assertEquals(BEARER_1, e.requests(api("/posts")).single().getHeader("Authorization"))
        }
        env(StoredSession.Guest).use { e ->
            e.h.dispatcher.enqueue(api("/topics"), fx("display/topics__open-2026-10-27.json"))
            e.h.dispatcher.enqueue(api("/posts"), fx("display/posts-list__guest-page1.json"))
            e.repo.topic(today)
            val page = assertIs<PostPage>(success(e.repo.posts(PostsQuery(today, PostSort.RECENT))))
            assertNull(e.requests(api("/topics")).single().getHeader("Authorization"))
            assertNull(e.requests(api("/posts")).single().getHeader("Authorization"))
            assertTrue(page.posts.none { it.isLiked || it.isMine })
        }
    }

    @Test
    fun `TC-DISP-053 a guest uses only the public GET topics and GET posts`() = runTest {
        env(StoredSession.Guest).use { e ->
            e.h.dispatcher.enqueue(api("/topics"), fx("display/topics__open-2026-10-27.json"))
            e.h.dispatcher.enqueue(api("/posts"), fx("display/posts-list__guest-page1.json"))
            assertIs<ApiResult.Success<*>>(e.repo.topic(today))
            assertIs<ApiResult.Success<*>>(e.repo.posts(PostsQuery(today, PostSort.RECENT)))
            assertEquals(listOf("/api/v1/topics", "/api/v1/posts"), e.h.dispatcher.recorded.map { it.requestUrl!!.encodedPath })
            assertTrue(e.h.dispatcher.recorded.all { it.getHeader("Authorization") == null })
        }
    }

    @Test
    fun `TC-DISP-007 and TC-DISP-008 posts 404 and 400 keep status errorCode and message and are not retried`() = runTest {
        val cases = listOf(
            "display/posts-list__404-topic-not-found.json" to 404,
            "display/posts-list__400-future-date.json" to 400,
            "display/posts-list__400-bad-query.json" to 400,
        )
        for ((fixture, status) in cases) {
            env().use { e ->
                e.h.dispatcher.enqueue(api("/posts"), fx(fixture))
                val err = http(e.repo.posts(PostsQuery(today, PostSort.RECENT)))
                assertEquals(status, err.status, fixture)
                assertEquals(ErrorCode.BUSINESS_ERROR, err.errorCode)
                assertNotNull(err.message)
                assertEquals(1, e.requests(api("/posts")).size)
            }
        }
    }

    @Test
    fun `TC-DISP-006 topics 404 is an Http 404 BUSINESS_ERROR`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/topics"), fx("display/topics__404-not-found.json"))
            val err = http(e.repo.topic(today))
            assertEquals(404, err.status)
            assertEquals(ErrorCode.BUSINESS_ERROR, err.errorCode)
        }
    }

    @Test
    fun `TC-DISP-051 a 401 UNAUTHORIZED on the public posts list refreshes once and resends`() = runTest {
        env().use { e ->
            e.h.guardPath("/posts", Fixtures.read("display/posts-list__recent-page1.json"))
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            val page = assertIs<PostPage>(success(e.repo.posts(PostsQuery(today, PostSort.RECENT))))
            assertEquals(20, page.posts.size)
            assertEquals(2, e.requests(api("/posts")).size)
            assertEquals(1, e.h.refreshRequests().size)
        }
    }

    @Test
    fun `TC-DISP-052 posts GET waits Retry-After then succeeds, and 5xx gives up after two retries (0_5s, 1s)`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/posts"), fx("display/posts-list__503-retry-after.json"), fx("display/posts-list__recent-page1.json"))
            assertIs<ApiResult.Success<*>>(e.repo.posts(PostsQuery(today, PostSort.RECENT)))
            assertEquals(2, e.requests(api("/posts")).size)
            assertEquals(1_000L, testScheduler.currentTime)
        }
        val start = testScheduler.currentTime
        env().use { e ->
            e.h.dispatcher.enqueue(api("/posts"), *Array(4) { fx("display/posts-list__500-server-error.json") })
            assertEquals(500, http(e.repo.posts(PostsQuery(today, PostSort.RECENT))).status)
            assertEquals(3, e.requests(api("/posts")).size)
            assertEquals(1_500L, testScheduler.currentTime - start)
        }
    }

    @Test
    fun `TC-DISP-005 a dropped connection becomes a Network error`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(api("/topics"), *Array(3) { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) })
            assertIs<ApiError.Network>(failure(e.repo.topic(today)))
        }
    }

    @Test
    fun `TC-FEED-009 list items with a negative likeCount make the whole page InvalidResponse`() = runTest {
        env().use { e ->
            val body = Fixtures.read("display/posts-list__recent-page1.json").replaceFirst("\"likeCount\": 10", "\"likeCount\": -1")
            assertTrue("-1" in body)
            e.h.dispatcher.enqueue(api("/posts"), MockResponses.json(200, body))
            assertIs<ApiError.InvalidResponse>(failure(e.repo.posts(PostsQuery(today, PostSort.RECENT))))
        }
    }

    // ---- FEED: detail ---------------------------------------------------------------------------------

    @Test
    fun `TC-FEED-002 detail needs Authorization and maps id authorId topic urls title and like fields`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(POST_OTHER), fx("feed/posts-detail__other.json"))
            val d = assertIs<PostDetail>(success(e.repo.detail(POST_OTHER)))
            val req = e.requests(postPath(POST_OTHER)).single()
            assertEquals("GET", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
            assertEquals(POST_OTHER, d.id)
            assertEquals("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", d.authorId)
            assertEquals(PostTopicRef("11111111-1111-4111-8111-111111111127", "가을 하늘", "2026-10-27"), d.topic)
            assertEquals("https://cdn.example.test/posts/$POST_OTHER/original.webp", d.originalImageUrl)
            assertEquals("https://cdn.example.test/posts/$POST_OTHER/thumbnail.webp", d.thumbnailImageUrl)
            assertEquals("https://cdn.example.test/signatures/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/original.png", d.signatureOriginalImageUrl)
            assertEquals("은행잎", d.title)
            assertEquals(38, d.likeCount)
            assertFalse(d.isLiked)
        }
    }

    @Test
    fun `TC-FEED-003 a null thumbnail falls back to the original url without an error`() = runTest {
        env().use { e ->
            val id = "22222222-2222-4222-8222-222222222205"
            e.h.dispatcher.enqueue(postPath(id), fx("feed/posts-detail__null-thumbnail.json"))
            val d = assertIs<PostDetail>(success(e.repo.detail(id)))
            assertNull(d.thumbnailImageUrl)
            assertEquals(d.originalImageUrl, d.thumbnailOrOriginalUrl)
        }
        val withThumb = PostFixturesAccess.listItem()
        assertEquals(withThumb.thumbnailImageUrl, withThumb.thumbnailOrOriginalUrl)
    }

    @Test
    fun `TC-FEED-006 detail 401 UNAUTHORIZED refreshes once and resends with the new token`() = runTest {
        env().use { e ->
            e.h.guardPath("/posts/$POST_OTHER", Fixtures.read("feed/posts-detail__other.json"))
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertIs<PostDetail>(success(e.repo.detail(POST_OTHER)))
            assertEquals(2, e.requests(postPath(POST_OTHER)).size)
            assertEquals(1, e.h.refreshRequests().size)
        }
    }

    @Test
    fun `TC-FEED-007 and TC-FEED-008 detail 404 400 and 500 keep status and code`() = runTest {
        val cases = listOf(
            Triple("feed/posts-detail__404-not-found.json", 404, ErrorCode.BUSINESS_ERROR),
            Triple("feed/posts-detail__400-invalid-id.json", 400, ErrorCode.BUSINESS_ERROR),
        )
        for ((fixture, status, code) in cases) {
            env().use { e ->
                e.h.dispatcher.enqueue(postPath(POST_OTHER), fx(fixture))
                val err = http(e.repo.detail(POST_OTHER))
                assertEquals(status, err.status, fixture)
                assertEquals(code, err.errorCode)
            }
        }
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(POST_OTHER), *Array(3) { fx("feed/posts-detail__500-server-error.json") })
            val err = http(e.repo.detail(POST_OTHER))
            assertEquals(500, err.status)
            assertEquals(ErrorCode.INTERNAL_ERROR, err.errorCode)
        }
    }

    @Test
    fun `TC-FEED-009 a string likeCount, a negative likeCount and a missing topic are InvalidResponse`() = runTest {
        val negative = Fixtures.read("feed/posts-detail__other.json").replace("\"likeCount\": 38", "\"likeCount\": -3")
        assertTrue("-3" in negative)
        val missingTopic = Fixtures.read("feed/posts-detail__invalid-schema.json").replace("\"likeCount\": \"많음\"", "\"likeCount\": 1")
        val bodies = listOf(fx("feed/posts-detail__invalid-schema.json"), MockResponses.json(200, negative), MockResponses.json(200, missingTopic))
        for (resp in bodies) {
            env().use { e ->
                e.h.dispatcher.enqueue(postPath(POST_OTHER), resp)
                assertIs<ApiError.InvalidResponse>(failure(e.repo.detail(POST_OTHER)))
            }
        }
    }

    // ---- FEED: title update ------------------------------------------------------------------------------

    @Test
    fun `TC-FEED-023 PUT posts id sends method path Authorization and a JSON body and parses postId and title`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(), fx("feed/posts-title-update__200.json"))
            val r = assertIs<TitleUpdateResult>(success(e.repo.updateTitle(POST_MINE, "가나다라마바사아자차")))
            val req = e.requests(postPath()).single()
            assertEquals("PUT", req.method)
            assertEquals(BEARER_1, req.getHeader("Authorization"))
            assertTrue(req.getHeader("Content-Type")!!.startsWith("application/json"))
            val json = bodyJson(req)
            assertEquals(setOf("title"), json.keys)
            assertEquals("가나다라마바사아자차", json.getValue("title").jsonPrimitive.content)
            assertEquals(TitleUpdateResult(POST_MINE, "가나다라마바사아자차"), r)
        }
    }

    @Test
    fun `TC-FEED-022 clearing the title sends the title key with null (never omits it)`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(), fx("feed/posts-title-update__200-null-title.json"))
            val r = assertIs<TitleUpdateResult>(success(e.repo.updateTitle(POST_MINE, null)))
            val raw = e.requests(postPath()).single().body.readUtf8()
            val json = Json.parseToJsonElement(raw).jsonObject
            assertTrue("title" in json.keys, raw)
            assertEquals(JsonNull, json.getValue("title"))
            assertNull(r.title)
        }
    }

    @Test
    fun `TC-FEED-027 TC-FEED-028 TC-FEED-029 TC-FEED-030 title update errors keep status code and message, one request`() = runTest {
        val cases = listOf(
            Triple("feed/posts-title-update__400-not-editable.json", 400, ErrorCode.BUSINESS_ERROR),
            Triple("feed/posts-title-update__400-title-too-long.json", 400, ErrorCode.BUSINESS_ERROR),
            Triple("feed/posts-title-update__403-banned.json", 403, ErrorCode.FORBIDDEN),
            Triple("feed/posts-title-update__404-not-found.json", 404, ErrorCode.BUSINESS_ERROR),
        )
        for ((fixture, status, code) in cases) {
            env().use { e ->
                e.h.dispatcher.enqueue(postPath(), fx(fixture))
                val err = http(e.repo.updateTitle(POST_MINE, "제목"))
                assertEquals(status, err.status, fixture)
                assertEquals(code, err.errorCode, fixture)
                assertNotNull(err.message)
                assertEquals(1, e.requests(postPath()).size, fixture)
            }
        }
    }

    @Test
    fun `TC-FEED-032 PUT 500 is retried twice (0_5s then 1s) and then fails, a disconnect ends as Network`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(), *Array(4) { fx("feed/posts-title-update__500-server-error.json") })
            val t0 = testScheduler.currentTime
            assertEquals(500, http(e.repo.updateTitle(POST_MINE, "제목")).status)
            assertEquals(3, e.requests(postPath()).size)
            assertEquals(1_500L, testScheduler.currentTime - t0)
        }
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(), *Array(3) { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) })
            assertIs<ApiError.Network>(failure(e.repo.updateTitle(POST_MINE, "제목")))
            assertEquals(3, e.requests(postPath()).size)
        }
    }

    @Test
    fun `TC-FEED-033 repeating the same save after a lost response is a normal 200`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(), fx("feed/posts-title-update__200.json"), fx("feed/posts-title-update__200.json"))
            assertIs<ApiResult.Success<*>>(e.repo.updateTitle(POST_MINE, "가나다라마바사아자차"))
            assertIs<ApiResult.Success<*>>(e.repo.updateTitle(POST_MINE, "가나다라마바사아자차"))
        }
    }

    // ---- FEED: delete -----------------------------------------------------------------------------------------

    @Test
    fun `TC-FEED-036 and TC-FEED-037 DELETE posts id with Authorization answers 204 and repeating it is still a success`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(postPath(), fx("feed/posts-delete__204.json"), fx("feed/posts-delete__204.json"))
            assertEquals(ApiResult.Success(Unit), e.repo.delete(POST_MINE))
            assertEquals(ApiResult.Success(Unit), e.repo.delete(POST_MINE))
            val reqs = e.requests(postPath())
            assertEquals(listOf("DELETE", "DELETE"), reqs.map { it.method })
            assertEquals(BEARER_1, reqs.first().getHeader("Authorization"))
        }
    }

    @Test
    fun `TC-FEED-039 TC-FEED-040 TC-FEED-041 delete errors keep status and errorCode (403 is FORBIDDEN, not a ban)`() = runTest {
        val cases = listOf(
            Triple("feed/posts-delete__400-validating.json", 400, ErrorCode.BUSINESS_ERROR),
            Triple("feed/posts-delete__400-rejected.json", 400, ErrorCode.BUSINESS_ERROR),
            Triple("feed/posts-delete__403-not-owner.json", 403, ErrorCode.FORBIDDEN),
            Triple("feed/posts-delete__404-not-found.json", 404, ErrorCode.BUSINESS_ERROR),
        )
        for ((fixture, status, code) in cases) {
            env().use { e ->
                e.h.dispatcher.enqueue(postPath(), fx(fixture))
                val err = http(e.repo.delete(POST_MINE))
                assertEquals(status, err.status, fixture)
                assertEquals(code, err.errorCode, fixture)
            }
        }
    }

    // ---- LIKE -------------------------------------------------------------------------------------------------

    @Test
    fun `TC-LIKE-001 like is PUT and unlike is DELETE on the same path, bodyless, with Authorization`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-put__liked.json"), fx("like/posts-likes-delete__unliked.json"))
            assertEquals(LikeResult(POST_MINE, 11, true), success(e.repo.like(POST_MINE)))
            assertEquals(LikeResult(POST_MINE, 10, false), success(e.repo.unlike(POST_MINE)))
            val reqs = e.requests(likesPath())
            assertEquals(listOf("PUT", "DELETE"), reqs.map { it.method })
            assertTrue(reqs.all { it.bodySize == 0L })
            assertTrue(reqs.all { it.getHeader("Authorization") == BEARER_1 })
        }
    }

    @Test
    fun `TC-LIKE-002 a mismatching postId or a PUT answering isLiked false is an InvalidResponse`() = runTest {
        for (fixture in listOf("like/posts-likes-put__postid-mismatch.json", "like/posts-likes-put__inconsistent-state.json")) {
            env().use { e ->
                e.h.dispatcher.enqueue(likesPath(), fx(fixture))
                assertIs<ApiError.InvalidResponse>(failure(e.repo.like(POST_MINE)), fixture)
            }
        }
    }

    @Test
    fun `TC-LIKE-002 a DELETE answer is only checked for its postId, not second-guessed on isLiked`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-put__postid-mismatch.json"))
            assertIs<ApiError.InvalidResponse>(failure(e.repo.unlike(POST_MINE)))
        }
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-put__liked.json"))
            assertEquals(true, assertIs<LikeResult>(success(e.repo.unlike(POST_MINE))).isLiked)
        }
    }

    @Test
    fun `TC-LIKE-033 an idempotent PUT on an already liked post and a DELETE on a not liked post are plain successes`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-put__already-liked.json"), fx("like/posts-likes-delete__not-liked.json"))
            assertEquals(LikeResult(POST_MINE, 11, true), success(e.repo.like(POST_MINE)))
            assertEquals(LikeResult(POST_MINE, 10, false), success(e.repo.unlike(POST_MINE)))
        }
    }

    @Test
    fun `TC-LIKE-012 cancelling a like is sent normally regardless of any ban state`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-delete__unliked.json"))
            assertEquals(false, assertIs<LikeResult>(success(e.repo.unlike(POST_MINE))).isLiked)
        }
    }

    @Test
    fun `TC-LIKE-010 and TC-LIKE-011 like 404 and 403 are returned once with status and errorCode`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-put__404-not-found.json"))
            assertEquals(404, http(e.repo.like(POST_MINE)).status)
            assertEquals(1, e.requests(likesPath()).size)
        }
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-put__403-banned.json"))
            val err = http(e.repo.like(POST_MINE))
            assertEquals(403, err.status)
            assertEquals(ErrorCode.FORBIDDEN, err.errorCode)
            assertEquals(1, e.requests(likesPath()).size)
        }
    }

    @Test
    fun `TC-LIKE-013 like 401 UNAUTHORIZED refreshes once and resends the same request`() = runTest {
        env().use { e ->
            e.h.guardPath("/posts/$POST_MINE/likes", Fixtures.read("like/posts-likes-put__liked.json"))
            e.h.dispatcher.enqueue(api("/auth/refresh"), refreshSuccess())
            assertEquals(LikeResult(POST_MINE, 11, true), success(e.repo.like(POST_MINE)))
            assertEquals(2, e.requests(likesPath()).size)
            assertEquals(1, e.h.refreshRequests().size)
        }
    }

    @Test
    fun `TC-LIKE-026 two 500s then 200 succeeds after 1_5s of virtual backoff, three 500s fail`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(
                likesPath(),
                fx("like/posts-likes-put__500-server-error.json"),
                fx("like/posts-likes-put__500-server-error.json"),
                fx("like/posts-likes-put__liked.json"),
            )
            val t0 = testScheduler.currentTime
            assertEquals(LikeResult(POST_MINE, 11, true), success(e.repo.like(POST_MINE)))
            assertEquals(3, e.requests(likesPath()).size)
            assertEquals(1_500L, testScheduler.currentTime - t0)
        }
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), *Array(3) { fx("like/posts-likes-put__500-server-error.json") })
            assertEquals(500, http(e.repo.like(POST_MINE)).status)
            assertEquals(3, e.requests(likesPath()).size)
        }
    }

    @Test
    fun `TC-LIKE-027 a 429 with Retry-After 1 waits one second before the resend`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), fx("like/posts-likes-put__429-retry-after.json"), fx("like/posts-likes-put__liked.json"))
            val t0 = testScheduler.currentTime
            assertIs<ApiResult.Success<*>>(e.repo.like(POST_MINE))
            assertEquals(1_000L, testScheduler.currentTime - t0)
            assertEquals(2, e.requests(likesPath()).size)
        }
    }

    @Test
    fun `TC-LIKE-028 an offline like ends as a Network error after the retries`() = runTest {
        env().use { e ->
            e.h.dispatcher.enqueue(likesPath(), *Array(3) { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) })
            assertIs<ApiError.Network>(failure(e.repo.like(POST_MINE)))
            assertEquals(3, e.requests(likesPath()).size)
        }
    }

    /** First list item of the recent page (has a thumbnail). */
    private object PostFixturesAccess {
        fun listItem(): PostSummary = kr.chalkak.core.data.post.testing.PostFixtures.summary("202")
    }
}
