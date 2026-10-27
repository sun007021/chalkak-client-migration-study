package kr.chalkak.feature.display

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.core.network.ApiResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** Delete button, confirmation and outcomes (TC-FEED-034..045). */
class FeedDeleteTest {
    private val deleted = ApiResult.Success(Unit)

    private fun TestScope.mineRig(): FeedRig {
        val r = feedRig(FeedEntry.FromRecord(POST_MINE, null))
        r.repo.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
        r.show()
        return r
    }

    private fun FeedRig.confirmDelete() { holder.onDeleteClicked(); holder.onDeleteConfirmed(); idle() }

    @Test
    fun `TC-FEED-034 the delete button is for my posts and another user's post never sends a DELETE`() = runTest {
        val mine = mineRig()
        assertTrue(mine.s.canDelete)

        val other = feedRig(FeedEntry.FromPush(POST_OTHER))
        other.repo.details.always(POST_OTHER, PostFixtures.detailResult("feed/posts-detail__other.json"))
        other.show()
        assertFalse(other.s.canDelete)
        other.holder.onDeleteClicked(); other.holder.onDeleteConfirmed(); other.idle()
        assertFalse(other.s.deleteConfirmVisible)
        assertTrue(other.repo.deletes.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-035 the button asks first, cancel sends nothing`() = runTest {
        val r = mineRig()
        r.holder.onDeleteClicked(); r.idle()
        assertTrue(r.s.deleteConfirmVisible)
        assertEquals(listOf("게시물 삭제", "게시물을 삭제하시겠어요?", "삭제"), listOf("feed.delete.title", "feed.delete.body", "feed.delete.confirm").map { Copy[it] })
        assertTrue(r.repo.deletes.calls.isEmpty())
        r.holder.onDeleteCancelled(); r.idle()
        assertFalse(r.s.deleteConfirmVisible)
        assertTrue(r.repo.deletes.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-036 TC-FEED-043 a 204 returns to the previous screen, removes the post everywhere and asks for one toast`() = runTest {
        val r = mineRig()
        r.repo.deletes.enqueue(POST_MINE, deleted)
        r.confirmDelete()
        assertEquals(listOf(POST_MINE), r.repo.deletes.calls.toList())
        assertEquals(listOf<FeedEffect>(FeedEffect.Deleted(POST_MINE, "feed.delete.success")), r.effects.toList())
        assertEquals("게시물을 삭제했어요", Copy["feed.delete.success"])
        assertTrue(r.changes.isRemoved(POST_MINE))
        assertFalse(r.s.deleting)
    }

    @Test
    fun `TC-FEED-038 repeated confirm while deleting sends one DELETE and later taps are ignored`() = runTest {
        val r = mineRig()
        val gate = gated<ApiResult<Unit>>(deleted)
        r.repo.deletes.enqueue(POST_MINE, gate)
        r.holder.onDeleteClicked()
        r.holder.onDeleteConfirmed(); r.holder.onDeleteConfirmed(); r.holder.onDeleteConfirmed(); runCurrent()
        assertTrue(r.s.deleting)
        assertEquals(1, r.repo.deletes.calls.size)
        gate.release(); advanceUntilIdle()
        r.holder.onDeleteConfirmed(); r.holder.onDeleteConfirmed(); r.idle()
        assertEquals(1, r.repo.deletes.calls.size)
        assertEquals(1, r.effects.size)
    }

    @Test
    fun `TC-FEED-039 a post that cannot be deleted in its state stays, with the state message and no removal`() = runTest {
        for (fixture in listOf("feed/posts-delete__400-validating.json", "feed/posts-delete__400-rejected.json")) {
            val r = mineRig()
            r.repo.deletes.enqueue(POST_MINE, PostFixtures.failure(fixture))
            r.confirmDelete()
            assertEquals(FeedStatus.Content, r.s.status, fixture)
            assertFalse(r.s.deleting)
            assertEquals("feed.delete.error.state", r.toasts().single().copyKey, fixture)
            assertEquals("삭제할 수 없는 상태의 게시물이에요", Copy["feed.delete.error.state"])
            assertFalse(r.changes.isRemoved(POST_MINE))
            assertTrue(r.effects.isEmpty())
        }
    }

    @Test
    fun `TC-FEED-040 a delete 403 says only the author can delete, never the ban text`() = runTest {
        val r = mineRig()
        r.repo.deletes.enqueue(POST_MINE, PostFixtures.failure("feed/posts-delete__403-not-owner.json"))
        r.confirmDelete()
        val toast = r.toasts().single()
        assertEquals("feed.delete.error.forbidden", toast.copyKey)
        assertEquals("본인이 작성한 게시물만 삭제할 수 있어요", Copy[toast.copyKey])
        assertTrue(r.toasts().none { it.copyKey == "like.error.banned" || it.copyKey == "feed.edit.error.banned" })
    }

    @Test
    fun `TC-FEED-041 a delete 404 says not found and removes the post from the lists`() = runTest {
        val r = mineRig()
        r.repo.deletes.enqueue(POST_MINE, PostFixtures.failure("feed/posts-delete__404-not-found.json"))
        r.confirmDelete()
        assertEquals("feed.error.not-found", r.toasts().single().copyKey)
        assertTrue(r.changes.isRemoved(POST_MINE))
    }

    @Test
    fun `TC-FEED-042 401, a lost connection and other failures have their own text and a retry works`() = runTest {
        val cases = listOf(
            PostFixtures.failure("feed/posts-delete__401-unauthorized.json") to "feed.edit.error.login",
            PostFixtures.network() to "common.error.network",
            PostFixtures.failure("feed/posts-delete__500-server-error.json") to "feed.delete.error.other",
        )
        for ((failure, key) in cases) {
            val r = mineRig()
            r.repo.deletes.enqueue(POST_MINE, failure, deleted)
            r.confirmDelete()
            assertEquals(key, r.toasts().single().copyKey)
            assertFalse(r.s.deleting)
            assertTrue(r.effects.isEmpty())
            r.confirmDelete() // try again
            assertEquals(2, r.repo.deletes.calls.size, key)
            assertIs<FeedEffect.Deleted>(r.effects.single())
        }
        assertEquals("게시물을 삭제하지 못했어요", Copy["feed.delete.error.other"])
    }

    @Test
    fun `TC-FEED-045 leaving during the delete still applies the result, but a failure toast is only for a visible screen`() = runTest {
        val ok = mineRig()
        val gate = gated<ApiResult<Unit>>(deleted)
        ok.repo.deletes.enqueue(POST_MINE, gate)
        ok.holder.onDeleteClicked(); ok.holder.onDeleteConfirmed(); runCurrent()
        ok.holder.onScreenHidden(); runCurrent()
        gate.release(); advanceUntilIdle()
        assertTrue(ok.changes.isRemoved(POST_MINE))

        val failing = mineRig()
        val failGate = gated<ApiResult<Unit>>(PostFixtures.failure("feed/posts-delete__500-server-error.json"))
        failing.repo.deletes.enqueue(POST_MINE, failGate)
        failing.holder.onDeleteClicked(); failing.holder.onDeleteConfirmed(); runCurrent()
        failing.holder.onScreenHidden(); runCurrent()
        failGate.release(); advanceUntilIdle()
        assertTrue(failing.toasts().isEmpty())
        assertFalse(failing.changes.isRemoved(POST_MINE))
    }
}
