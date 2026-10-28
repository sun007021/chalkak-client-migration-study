@file:OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)

package kr.chalkak.core.data.post

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.testing.FakeLikeServer
import kr.chalkak.core.data.post.testing.FakePostRepository
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Shared like toggle (D-04). Fake repository + virtual time only; the HTTP side lives in PostRepositoryTest.
 * Screens (display, feed) are covered through their own state holders in :feature:display.
 */
class LikeControllerTest {
    private class Rig(
        val repo: FakePostRepository,
        val server: FakeLikeServer,
        val changes: PostChanges,
        val controller: LikeController,
        val events: MutableList<LikeEvent>,
        val loggedIn: BooleanArray,
    ) {
        fun state(id: String = POST_MINE) = controller.state(id)
        fun snapshot(id: String = POST_MINE) = controller.state(id)?.snapshot
        fun seed(id: String = POST_MINE, liked: Boolean = false, count: Int = 10) {
            controller.merge(id, LikeSnapshot(liked, count), controller.revision())
        }
    }

    private fun TestScope.scope(): CoroutineScope = CoroutineScope(StandardTestDispatcher(testScheduler) + SupervisorJob())

    @OptIn(ExperimentalCoroutinesApi::class)
    private fun <T> TestScope.collectAll(flow: Flow<T>): MutableList<T> {
        val out = CopyOnWriteArrayList<T>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect { out += it } }
        return out
    }

    private fun TestScope.rig(
        serverLiked: Boolean = false,
        serverCount: Int = 10,
        latencyMs: Long = 0,
        seedPost: Boolean = true,
        seedLiked: Boolean = serverLiked,
        seedCount: Int = serverCount,
    ): Rig {
        val server = FakeLikeServer(serverLiked, serverCount, latencyMs)
        val repo = FakePostRepository().also { r -> r.likeHandler = { put, id -> server.handle(put, id) } }
        val changes = PostChanges()
        val loggedIn = booleanArrayOf(true)
        val controller = LikeController(scope(), repo, { loggedIn[0] }, changes)
        val events = collectAll(controller.events)
        return Rig(repo, server, changes, controller, events, loggedIn).also { if (seedPost) it.seed(POST_MINE, seedLiked, seedCount) }
    }

    private fun gen(liked: Boolean, count: Int) = LikePostState(LikeSnapshot(liked, count), pending = false)

    // ---- optimistic update --------------------------------------------------------------------------------

    @Test
    fun `TC-LIKE-003 TC-LIKE-005 TC-LIKE-006 the heart flips isLiked and likeCount plus one before the server answers`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.controller.toggle(POST_MINE)
        assertEquals(LikePostState(LikeSnapshot(true, 11), pending = true), r.state())
        runCurrent()
        assertEquals(listOf("PUT $POST_MINE"), r.server.calls.toList())
        assertEquals(LikePostState(LikeSnapshot(true, 11), pending = true), r.state())
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(gen(true, 11), r.state())
        assertTrue(r.events.isEmpty())
    }

    @Test
    fun `TC-LIKE-007 tapping a liked post flips back immediately with DELETE and the count never goes below zero`() = runTest {
        val r = rig(serverLiked = true, serverCount = 11)
        val gate = r.server.hold(POST_MINE)
        r.controller.toggle(POST_MINE)
        assertEquals(LikeSnapshot(false, 10), r.snapshot())
        runCurrent()
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf("DELETE $POST_MINE"), r.server.calls.toList())
        assertEquals(gen(false, 10), r.state())

        val zero = rig(serverLiked = true, serverCount = 0)
        zero.controller.toggle(POST_MINE)
        assertEquals(LikeSnapshot(false, 0), zero.snapshot())
    }

    @Test
    fun `TC-LIKE-008 a success response overwrites the optimistic value with the server's count and state`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> PostFixtures.likeResult("like/posts-likes-put__liked-count-differs.json") }
        r.controller.toggle(POST_MINE)
        assertEquals(LikeSnapshot(true, 11), r.snapshot())
        advanceUntilIdle()
        assertEquals(gen(true, 13), r.state())
        assertTrue(r.events.isEmpty())
    }

    // ---- failure -----------------------------------------------------------------------------------------------

    @Test
    fun `TC-LIKE-009 a 500 rolls back and emits one generic failure toast key`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> PostFixtures.failure("like/posts-likes-put__500-server-error.json") }
        r.controller.toggle(POST_MINE)
        assertEquals(LikeSnapshot(true, 11), r.snapshot())
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_MINE, LikeFailure.GENERIC)), r.events.toList())
        assertEquals("like.error.generic", LikeFailure.GENERIC.copyKey)
        assertEquals("좋아요를 반영하지 못했어요", Copy[LikeFailure.GENERIC.copyKey])
    }

    @Test
    fun `TC-LIKE-009 a network failure and an invalid response also roll back with the generic toast`() = runTest {
        for (failure in listOf(PostFixtures.network(), ApiResult.Failure(ApiError.InvalidResponse("bad body")))) {
            val r = rig()
            r.repo.likeHandler = { _, _ -> failure }
            r.controller.toggle(POST_MINE)
            advanceUntilIdle()
            assertEquals(gen(false, 10), r.state())
            assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_MINE, LikeFailure.GENERIC)), r.events.toList())
        }
    }

    @Test
    fun `TC-LIKE-002 a contract-violating success body is a failure that rolls back`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> ApiResult.Failure(ApiError.InvalidResponse("postId mismatch")) }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertEquals(1, r.events.size)
    }

    @Test
    fun `TC-LIKE-010 a 404 rolls back, shows the toast, reports PostGone and marks the post removed`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> PostFixtures.failure("like/posts-likes-put__404-not-found.json") }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(LikeSnapshot(false, 10), r.snapshot())
        assertTrue(LikeEvent.PostGone(POST_MINE) in r.events)
        assertTrue(LikeEvent.Failed(POST_MINE, LikeFailure.GENERIC) in r.events)
        assertTrue(r.changes.isRemoved(POST_MINE))
        assertEquals(1, r.repo.likeCalls.size)
    }

    @Test
    fun `TC-LIKE-011 a banned member's PUT 403 rolls back with the banned toast and is never resent`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> PostFixtures.failure("like/posts-likes-put__403-banned.json") }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        advanceTimeBy(60_000)
        assertEquals(gen(false, 10), r.state())
        assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_MINE, LikeFailure.BANNED)), r.events.toList())
        assertEquals("like.error.banned", LikeFailure.BANNED.copyKey)
        assertEquals(listOf("PUT $POST_MINE"), r.repo.likeCalls.toList())
    }

    @Test
    fun `TC-LIKE-012 a banned member can still cancel a like (DELETE is sent and succeeds)`() = runTest {
        val r = rig(serverLiked = true, serverCount = 11)
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(listOf("DELETE $POST_MINE"), r.server.calls.toList())
        assertEquals(gen(false, 10), r.state())
        assertTrue(r.events.isEmpty())
    }

    @Test
    fun `TC-LIKE-013 when re-authentication is required the like rolls back and is sent once`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED)) }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertEquals(1, r.repo.likeCalls.size)
    }

    @Test
    fun `TC-LIKE-009 a repository that throws rolls the like back with a generic failure instead of crashing`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> error("boom") }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_MINE, LikeFailure.GENERIC)), r.events.toList())
        r.repo.likeHandler = { _, _ -> ApiResult.Success(LikeResult(POST_MINE, 11, true)) }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(true, 11), r.state())
    }

    @Test
    fun `TC-LIKE-013 a plain 401 rolls back silently without a toast event`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> ApiResult.Failure(ApiError.Http(401, ErrorCode.UNAUTHORIZED)) }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertEquals(1, r.repo.likeCalls.size)
        assertTrue(r.events.isEmpty())
    }

    @Test
    fun `TC-LIKE-013 re-authentication required also rolls back without a toast event`() = runTest {
        val r = rig(serverLiked = true, serverCount = 10)
        r.repo.likeHandler = { _, _ -> ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED)) }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(true, 10), r.state())
        assertTrue(r.events.isEmpty())
    }

    @Test
    fun `TC-LIKE-009 an Error thrown by the repository never leaves the post stuck in flight`() = runTest {
        val r = rig()
        r.repo.likeHandler = { _, _ -> throw AssertionError("fake blew up") }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_MINE, LikeFailure.GENERIC)), r.events.toList())
        r.repo.likeHandler = { _, _ -> ApiResult.Success(LikeResult(POST_MINE, 11, true)) }
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(true, 11), r.state())
    }

    @Test
    fun `TC-LIKE-014 a guest tap changes nothing, sends nothing and asks to log in`() = runTest {
        val r = rig()
        r.loggedIn[0] = false
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertTrue(r.repo.likeCalls.isEmpty())
        assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_MINE, LikeFailure.LOGIN_REQUIRED)), r.events.toList())
        assertEquals("guest.like", LikeFailure.LOGIN_REQUIRED.copyKey)
        assertEquals("좋아요를 누르려면 로그인이 필요해요", Copy[LikeFailure.LOGIN_REQUIRED.copyKey])
    }

    // ---- serialisation ------------------------------------------------------------------------------------------

    @Test
    fun `TC-LIKE-015 and TC-LIKE-018 on-off-on while the PUT is in flight sends exactly one PUT and ends liked`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.controller.toggle(POST_MINE)
        runCurrent()
        r.controller.toggle(POST_MINE)
        assertEquals(LikePostState(LikeSnapshot(false, 10), pending = true), r.state())
        r.controller.toggle(POST_MINE)
        assertEquals(LikePostState(LikeSnapshot(true, 11), pending = true), r.state())
        runCurrent()
        assertEquals(listOf("PUT $POST_MINE"), r.server.calls.toList()) // no duplicate while in flight
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf("PUT $POST_MINE"), r.server.calls.toList())
        assertEquals(gen(true, 11), r.state())
        assertTrue(r.server.isLiked(POST_MINE))
    }

    @Test
    fun `TC-LIKE-016 on-off while the PUT is in flight sends one more DELETE afterwards and ends not liked`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.controller.toggle(POST_MINE)
        runCurrent()
        r.controller.toggle(POST_MINE)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf("PUT $POST_MINE", "DELETE $POST_MINE"), r.server.calls.toList())
        assertEquals(gen(false, 10), r.state())
        assertFalse(r.server.isLiked(POST_MINE))
        assertEquals(1, r.server.maxInFlightPerPost)
    }

    @Test
    fun `TC-LIKE-017 any tap sequence of length 1 to 9 keeps at most one request in flight and ends in the last intent`() = runTest {
        val random = Random(20261027)
        repeat(120) { round ->
            val taps = random.nextInt(1, 10)
            val r = rig(latencyMs = 150)
            repeat(taps) {
                r.controller.toggle(POST_MINE)
                advanceTimeBy(random.nextLong(0, 260))
            }
            advanceUntilIdle()
            assertTrue(r.server.maxInFlightPerPost <= 1, "round $round taps=$taps")
            val expectedLiked = taps % 2 == 1
            assertEquals(expectedLiked, r.server.isLiked(POST_MINE), "server state round $round taps=$taps")
            assertEquals(LikePostState(LikeSnapshot(expectedLiked, r.server.likeCount(POST_MINE)), pending = false), r.state(), "round $round")
            assertTrue(r.events.isEmpty())
        }
    }

    @Test
    fun `TC-LIKE-019 two different posts are requested in parallel and a failure of one does not touch the other`() = runTest {
        val r = rig()
        r.seed(POST_OTHER, liked = false, count = 38)
        val g1 = r.server.hold(POST_MINE)
        val g2 = r.server.hold(POST_OTHER)
        r.server.failNext(POST_OTHER, PostFixtures.failure("like/posts-likes-put__500-server-error.json"))
        r.controller.toggle(POST_MINE)
        r.controller.toggle(POST_OTHER)
        runCurrent()
        assertEquals(setOf("PUT $POST_MINE", "PUT $POST_OTHER"), r.server.calls.toSet()) // both in flight at once
        g2.complete(Unit)
        g1.complete(Unit)
        advanceUntilIdle()
        assertEquals(gen(true, 11), r.state(POST_MINE))
        assertEquals(gen(false, 38), r.state(POST_OTHER))
        assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_OTHER, LikeFailure.GENERIC)), r.events.toList())
    }

    @Test
    fun `TC-LIKE-020 when the PUT fails after the user switched the intent back, only the toast is shown and nothing is resent`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.server.failNext(POST_MINE, PostFixtures.failure("like/posts-likes-put__500-server-error.json"))
        r.controller.toggle(POST_MINE)
        runCurrent()
        r.controller.toggle(POST_MINE)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(gen(false, 10), r.state())
        assertEquals(listOf("PUT $POST_MINE"), r.server.calls.toList())
        assertEquals(listOf<LikeEvent>(LikeEvent.Failed(POST_MINE, LikeFailure.GENERIC)), r.events.toList())
    }

    @Test
    fun `TC-LIKE-022 a stale rollback does not undo a newer tap, the newest intent is sent instead`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.server.failNext(POST_MINE, PostFixtures.failure("like/posts-likes-put__500-server-error.json"))
        r.controller.toggle(POST_MINE) // PUT #1 (will fail)
        runCurrent()
        r.controller.toggle(POST_MINE) // off
        r.controller.toggle(POST_MINE) // on again = newest intent
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf("PUT $POST_MINE", "PUT $POST_MINE"), r.server.calls.toList())
        assertEquals(gen(true, 11), r.state())
        assertTrue(r.server.isLiked(POST_MINE))
    }

    // ---- stale list/detail responses ----------------------------------------------------------------------------------

    @Test
    fun `TC-LIKE-021 TC-LIKE-023 a revalidation requested before a finished like cannot overwrite it`() = runTest {
        val r = rig()
        val staleRevision = r.controller.revision()
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        assertTrue(r.controller.revision() > staleRevision)
        // the old list/detail response (count 10, not liked) arrives late
        assertEquals(LikeSnapshot(true, 11), r.controller.merge(POST_MINE, LikeSnapshot(false, 10), staleRevision))
        assertEquals(gen(true, 11), r.state())
        // a response requested after the like is accepted again
        assertEquals(LikeSnapshot(true, 15), r.controller.merge(POST_MINE, LikeSnapshot(true, 15), r.controller.revision()))
        assertEquals(gen(true, 15), r.state())
    }

    @Test
    fun `TC-LIKE-021 a response that arrives while the like is still in flight does not overwrite it either`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.controller.toggle(POST_MINE)
        runCurrent()
        val shown = r.controller.merge(POST_MINE, LikeSnapshot(false, 10), r.controller.revision())
        assertEquals(LikeSnapshot(true, 11), shown)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(gen(true, 11), r.state())
    }

    @Test
    fun `TC-LIKE-004 TC-LIKE-025 every holder sees the same value for a post because the state lives in one controller`() = runTest {
        val r = rig()
        r.controller.toggle(POST_MINE)
        advanceUntilIdle()
        // a second screen merging its own (older) copy of the same post is shown the shared value
        assertEquals(LikeSnapshot(true, 11), r.controller.merge(POST_MINE, LikeSnapshot(false, 10), 0L))
        assertEquals(gen(true, 11), r.controller.states.value[POST_MINE])
    }

    // ---- misc --------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-LIKE-031 reset drops a response of the previous account and the next account starts clean`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.controller.toggle(POST_MINE)
        runCurrent()
        r.controller.reset() // logout / account switch
        assertNull(r.state())
        gate.complete(Unit)
        advanceUntilIdle()
        assertNull(r.state())
        assertTrue(r.events.isEmpty())
        // account B: its server value is taken as is
        assertEquals(LikeSnapshot(false, 5), r.controller.merge(POST_MINE, LikeSnapshot(false, 5), r.controller.revision()))
    }

    @Test
    fun `TC-LIKE-031 a failure of the previous account's request after reset shows no toast`() = runTest {
        val r = rig()
        val gate = r.server.hold(POST_MINE)
        r.server.failNext(POST_MINE, PostFixtures.failure("like/posts-likes-put__500-server-error.json"))
        r.controller.toggle(POST_MINE)
        runCurrent()
        r.controller.reset()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertNull(r.state())
    }

    @Test
    fun `TC-LIKE-033 an idempotent answer for an already liked post is accepted without a toast`() = runTest {
        val r = rig(serverLiked = true, serverCount = 11, seedLiked = false, seedCount = 10)
        r.controller.toggle(POST_MINE)
        assertEquals(LikeSnapshot(true, 11), r.snapshot())
        advanceUntilIdle()
        assertEquals(gen(true, 11), r.state())
        assertTrue(r.events.isEmpty())
        assertNotNull(r.state())
    }
}
