package kr.chalkak.feature.display

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The heart on the exhibition grid and carousel (TC-LIKE-003/004/009/010/011/014/021/029/030/031/032). */
class DisplayLikeTest {
    private val other = "202"
    private val fail500 = PostFixtures.failure("like/posts-likes-put__500-server-error.json")

    private fun DisplayRig.pair(suffix: String = "202") = photo(suffix).let { it.isLiked to it.likeCount }

    @Test
    fun `TC-LIKE-003 tapping the heart on the grid flips isLiked and count immediately`() = runTest {
        val r = displayRig()
        r.show()
        assertEquals(false to 38, r.pair())
        r.holder.onLikeClicked(POST_OTHER)
        assertEquals(true to 39, r.pair()) // before any request ran
        r.idle()
        assertEquals(true to 39, r.pair())
        assertEquals(listOf("PUT $POST_OTHER"), r.server.calls.toList())
        assertTrue(r.toasts().isEmpty())
    }

    @Test
    fun `TC-LIKE-004 a post in the carousel and in the grid always shows the same like value`() = runTest {
        val r = displayRig(initialDate = YESTERDAY)
        r.show()
        val inFeatured = { r.s.featured.first { it.id == POST_OTHER } }
        val inGrid = { r.s.photos.first { it.id == POST_OTHER } }
        assertEquals(inFeatured().isLiked to inFeatured().likeCount, inGrid().isLiked to inGrid().likeCount)
        r.holder.onLikeClicked(POST_OTHER)
        assertEquals(true to 39, inFeatured().isLiked to inFeatured().likeCount)
        assertEquals(true to 39, inGrid().isLiked to inGrid().likeCount)
        r.idle()
        assertEquals(inFeatured().likeCount, inGrid().likeCount)
        // and a rollback reaches both
        r.server.failNext(POST_OTHER, fail500)
        r.holder.onLikeClicked(POST_OTHER); r.idle()
        assertEquals(inFeatured().isLiked to inFeatured().likeCount, inGrid().isLiked to inGrid().likeCount)
    }

    @Test
    fun `TC-LIKE-009 a failed like rolls back on the grid and shows the generic toast`() = runTest {
        val r = displayRig()
        r.show()
        r.server.failNext(POST_OTHER, fail500)
        r.holder.onLikeClicked(POST_OTHER); r.idle()
        assertEquals(false to 38, r.pair())
        assertEquals("like.error.generic", r.toasts().single().copyKey)
        assertEquals("좋아요를 반영하지 못했어요", Copy["like.error.generic"])
    }

    @Test
    fun `TC-LIKE-010 a 404 removes the post from grid and carousel and marks it removed`() = runTest {
        val r = displayRig(initialDate = YESTERDAY)
        r.show()
        r.server.failNext(POST_OTHER, PostFixtures.failure("like/posts-likes-put__404-not-found.json"))
        r.holder.onLikeClicked(POST_OTHER); r.idle()
        assertTrue(r.s.photos.none { it.id == POST_OTHER })
        assertTrue(r.s.featured.none { it.id == POST_OTHER })
        assertTrue(r.changes.isRemoved(POST_OTHER))
        assertTrue(r.toasts().isNotEmpty())
    }

    @Test
    fun `TC-LIKE-011 a banned member's like is rolled back with the banned toast and not resent`() = runTest {
        val r = displayRig()
        r.show()
        r.server.failNext(POST_OTHER, PostFixtures.failure("like/posts-likes-put__403-banned.json"))
        r.holder.onLikeClicked(POST_OTHER); r.idle()
        assertEquals(false to 38, r.pair())
        assertEquals("like.error.banned", r.toasts().single().copyKey)
        assertEquals("이용이 제한되어 좋아요를 누를 수 없어요.", Copy["like.error.banned"])
        assertEquals(1, r.server.calls.size)
    }

    @Test
    fun `TC-LIKE-014 a guest tapping the heart gets the login toast and no request, state unchanged`() = runTest {
        val r = displayRig(userId = null, auto = false)
        r.repo.topics.default = { kr.chalkak.core.network.ApiResult.Success(PostFixtures.topicFor(it)) }
        r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult("display/posts-list__guest-page1.json"))
        r.show()
        val before = r.photo(other)
        r.holder.onLikeClicked(POST_OTHER); r.idle()
        assertEquals(before, r.photo(other))
        assertTrue(r.server.calls.isEmpty())
        assertEquals("guest.like", r.toasts().single().copyKey)
        assertEquals("좋아요를 누르려면 로그인이 필요해요", Copy["guest.like"])
    }

    @Test
    fun `TC-LIKE-021 a list revalidation that was sent before the like cannot undo a finished like`() = runTest {
        val r = displayRig()
        r.show()
        val gate = gated(PostFixtures.pageResult("display/posts-list__recent-page1.json"))
        r.repo.posts.enqueue(q(TODAY, PostSort.RECENT), gate)
        r.holder.onTabReselected(); runCurrent() // request sent with the old like values
        r.holder.onLikeClicked(POST_OTHER); r.idle()
        assertEquals(true to 39, r.pair())
        gate.release(); advanceUntilIdle()
        assertEquals(true to 39, r.pair()) // the old answer says 38 / not liked
        assertFalse(r.s.isRefreshing)
    }

    @Test
    fun `TC-LIKE-029 a like answered while the screen is hidden is applied but shows no toast`() = runTest {
        val r = displayRig()
        r.show()
        val gate = r.server.hold(POST_OTHER)
        r.server.failNext(POST_OTHER, fail500)
        r.holder.onLikeClicked(POST_OTHER); runCurrent()
        r.holder.onScreenHidden(); runCurrent()
        gate.complete(Unit); advanceUntilIdle()
        assertEquals(false to 38, r.pair()) // rollback is in the state/cache
        assertTrue(r.toasts().isEmpty())
    }

    @Test
    fun `TC-LIKE-030 two different photos failing one after another show the same text twice with different ids`() = runTest {
        val r = displayRig()
        r.show()
        r.server.failNext(POST_OTHER, fail500)
        r.server.failNext("22222222-2222-4222-8222-222222222203", fail500)
        r.holder.onLikeClicked(POST_OTHER)
        r.holder.onLikeClicked("22222222-2222-4222-8222-222222222203")
        r.idle()
        val toasts = r.toasts()
        assertEquals(2, toasts.size)
        assertEquals(2, toasts.map { it.id }.distinct().size)
        assertTrue(toasts.all { it.copyKey == "like.error.generic" })
    }

    @Test
    fun `TC-LIKE-031 an answer of the previous account's like is ignored after the account switch`() = runTest {
        val r = displayRig()
        r.show()
        val gate = r.server.hold(POST_OTHER)
        r.server.failNext(POST_OTHER, fail500)
        r.holder.onLikeClicked(POST_OTHER); runCurrent()
        r.user.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        r.holder.onUserChanged(); r.likes.reset(); r.changes.reset()
        gate.complete(Unit); advanceUntilIdle()
        assertTrue(r.toasts().isEmpty())
        assertTrue(r.s.photos.isEmpty())
        assertNull(r.likes.state(POST_OTHER))
        // account B sees the server values only
        r.show()
        assertEquals(false to 38, r.pair())
    }

    @Test
    fun `TC-LIKE-032 the author may like their own post`() = runTest {
        val r = displayRig(likeCount = 10)
        r.show()
        assertTrue(r.photo("201").isMine)
        r.holder.onLikeClicked(POST_MINE); r.idle()
        assertEquals(listOf("PUT $POST_MINE"), r.server.calls.toList())
        assertEquals(true to 11, r.pair("201"))
        assertTrue(r.toasts().isEmpty())
    }
}
