package kr.chalkak.feature.home

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.data.post.LikeController
import kr.chalkak.core.data.post.LikeSnapshot
import kr.chalkak.core.data.post.PostChanges
import kr.chalkak.core.data.post.testing.FakeLikeServer
import kr.chalkak.core.data.post.testing.FakePostRepository
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Home's like port over the shared [LikeController] (D-04): home taps use the same optimistic rule and state as display and feed. */
class LikeControllerTogglerTest {
    private class Rig(scope: TestScope, count: Int = 10) {
        val server = FakeLikeServer(initialLiked = false, initialCount = count)
        val repo = FakePostRepository().also { r -> r.likeHandler = { put, id -> server.handle(put, id) } }
        val controller = LikeController(CoroutineScope(StandardTestDispatcher(scope.testScheduler) + SupervisorJob()), repo, { true }, PostChanges())
        val toggler = LikeControllerToggler(controller)
    }

    @Test
    fun `TC-LIKE-005 a home card tap registers the post and flips it optimistically before the server answers`() = runTest {
        val rig = Rig(this)
        assertNull(rig.controller.state("p1"))
        val gate = rig.server.hold("p1")

        rig.toggler.toggle("p1", currentlyLiked = false, likeCount = 10)
        runCurrent()

        val shown = rig.controller.state("p1")!!
        assertEquals(LikeSnapshot(true, 11), shown.snapshot)
        assertTrue(shown.pending)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(LikeSnapshot(true, 11), rig.controller.state("p1")!!.snapshot)
        assertEquals(listOf("PUT p1"), rig.server.calls)
    }

    @Test
    fun `TC-LIKE-005 a post already shared by display keeps its state and is flipped, not re-registered`() = runTest {
        val rig = Rig(this)
        rig.controller.merge("p1", LikeSnapshot(true, 5), rig.controller.revision())

        rig.toggler.toggle("p1", currentlyLiked = false, likeCount = 99)
        advanceUntilIdle()

        assertEquals(listOf("DELETE p1"), rig.server.calls)
        assertEquals(false, rig.controller.state("p1")!!.snapshot.isLiked)
    }
}
