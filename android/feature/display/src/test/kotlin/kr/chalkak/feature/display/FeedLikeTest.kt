package kr.chalkak.feature.display

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The heart on the post detail (TC-LIKE-006/009/010/023/024). */
class FeedLikeTest {
    private val mineToday = "feed/posts-detail__mine-today.json"
    private val fail500 = PostFixtures.failure("like/posts-likes-put__500-server-error.json")

    private fun kotlinx.coroutines.test.TestScope.confirmed(): FeedRig {
        val r = feedRig(FeedEntry.FromRecord(POST_MINE, null))
        r.repo.details.always(POST_MINE, PostFixtures.detailResult(mineToday))
        r.show()
        return r
    }

    @Test
    fun `TC-LIKE-006 the heart on the detail flips isLiked and count immediately`() = runTest {
        val r = confirmed()
        assertTrue(r.s.likeEnabled)
        assertEquals(false to 10, r.s.content?.isLiked to r.s.content?.likeCount)
        r.holder.onLikeClicked()
        assertEquals(true to 11, r.s.content?.isLiked to r.s.content?.likeCount)
        r.idle()
        assertEquals(true to 11, r.s.content?.isLiked to r.s.content?.likeCount)
        assertEquals(listOf("PUT $POST_MINE"), r.server.calls.toList())
    }

    @Test
    fun `TC-LIKE-009 a failed like on the detail rolls back and toasts (no silent rollback)`() = runTest {
        val r = confirmed()
        r.server.failNext(POST_MINE, fail500)
        r.holder.onLikeClicked(); r.idle()
        assertEquals(false to 10, r.s.content?.isLiked to r.s.content?.likeCount)
        assertEquals("like.error.generic", r.toasts().single().copyKey)
        assertEquals("좋아요를 반영하지 못했어요", Copy["like.error.generic"])
    }

    @Test
    fun `TC-LIKE-010 a 404 on the like closes the detail and refreshes the list`() = runTest {
        val r = confirmed()
        r.server.failNext(POST_MINE, PostFixtures.failure("like/posts-likes-put__404-not-found.json"))
        r.holder.onLikeClicked(); r.idle()
        assertTrue(FeedEffect.Closed(POST_MINE) in r.effects)
        assertTrue(r.changes.isRemoved(POST_MINE))
        assertTrue(r.toasts().isNotEmpty())
    }

    @Test
    fun `TC-LIKE-023 a detail answer that arrives after the like finished does not overwrite it`() = runTest {
        val r = confirmed()
        val gate = gated(PostFixtures.detailResult(mineToday))
        r.repo.details.enqueue(POST_MINE, gate)
        r.holder.onScreenShown(); runCurrent() // revalidation in flight, says 10 / not liked
        r.holder.onLikeClicked(); r.idle()
        assertEquals(true to 11, r.s.content?.isLiked to r.s.content?.likeCount)
        gate.release(); advanceUntilIdle()
        assertEquals(true to 11, r.s.content?.isLiked to r.s.content?.likeCount)
    }

    @Test
    fun `TC-LIKE-024 a display seed cannot be liked until the detail is confirmed`() = runTest {
        val r = feedRig(FeedEntry.FromDisplay(PostFixtures.summary("202")), likeCount = 38)
        val gate = gated(PostFixtures.detailResult("feed/posts-detail__other.json"))
        r.repo.details.enqueue(POST_OTHER, gate)
        r.holder.onScreenShown(); runCurrent()
        assertFalse(r.s.likeEnabled)
        r.holder.onLikeClicked(); runCurrent()
        assertTrue(r.repo.likeCalls.isEmpty())
        assertEquals(false to 38, r.s.content?.isLiked to r.s.content?.likeCount)
        gate.release(); advanceUntilIdle()
        assertTrue(r.s.likeEnabled)
        r.holder.onLikeClicked(); r.idle()
        assertEquals(listOf("PUT $POST_OTHER"), r.repo.likeCalls.toList())
        assertEquals(true to 39, r.s.content?.isLiked to r.s.content?.likeCount)
    }

    @Test
    fun `TC-LIKE-014 a guest cannot like on the detail either`() = runTest {
        val r = feedRig(FeedEntry.FromPush(POST_OTHER), userId = null)
        r.repo.details.always(POST_OTHER, PostFixtures.detailResult("feed/posts-detail__other.json"))
        r.show()
        r.holder.onLikeClicked(); r.idle()
        assertTrue(r.repo.likeCalls.isEmpty())
        assertEquals(false, r.s.content?.isLiked)
    }
}
