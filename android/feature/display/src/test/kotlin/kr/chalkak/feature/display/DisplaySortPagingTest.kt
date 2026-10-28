package kr.chalkak.feature.display

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Sort tabs, archive mode, random seed, paging and cache rules of the exhibition (TC-DISP-011..027, 042..047). */
class DisplaySortPagingTest {
    private val recent1 = "display/posts-list__recent-page1.json"
    private val recent2 = "display/posts-list__recent-page2.json"
    private val popular1 = "display/posts-list__popular-page1.json"
    private val random1 = "display/posts-list__random-page1-seed.json"
    private val random2 = "display/posts-list__random-page2.json"
    private val seed = "seed_abc123"

    // ---- sort tabs ----------------------------------------------------------------------------------------

    @Test
    fun `TC-DISP-011 today shows three sort tabs, default is recent and each selection requests its lower-case sort`() = runTest {
        val r = displayRig()
        r.show()
        assertEquals(listOf(PostSort.RECENT, PostSort.POPULAR, PostSort.RANDOM), r.s.sortOptions)
        assertEquals(PostSort.RECENT, r.s.sort)
        assertEquals("display.header.desc-latest", r.s.descriptionKey)
        assertEquals("같은 주제에서 다른 시선을 느껴보세요", Copy[r.s.descriptionKey])
        assertEquals(listOf("최신순", "인기순", "랜덤순"), listOf("display.sort.recent", "display.sort.popular", "display.sort.random").map { Copy[it] })
        r.holder.onSortSelected(PostSort.POPULAR); r.idle()
        assertEquals(q(TODAY, PostSort.POPULAR), r.repo.posts.calls.last())
        assertEquals(PostSort.POPULAR, r.s.sort)
        r.holder.onSortSelected(PostSort.RANDOM); r.idle()
        assertEquals(q(TODAY, PostSort.RANDOM), r.repo.posts.calls.last())
        assertEquals(PostSort.RANDOM, r.s.sort)
    }

    @Test
    fun `TC-DISP-012 changing the sort keeps the old photos while loading, replaces them on arrival, and a seen sort comes from cache`() = runTest {
        val r = displayRig()
        r.show()
        val recentIds = r.s.photos.ids
        assertEquals(fixtureIds(recent1), recentIds)
        val gate = gated(PostFixtures.pageResult(popular1))
        r.repo.posts.enqueue(q(TODAY, PostSort.POPULAR), gate)
        r.holder.onSortSelected(PostSort.POPULAR); runCurrent()
        assertEquals(DisplayStatus.Content, r.s.status)
        assertEquals(recentIds, r.s.photos.ids) // old photos stay
        assertTrue(r.s.isRefreshing)
        gate.release(); advanceUntilIdle()
        assertEquals(fixtureIds(popular1), r.s.photos.ids)
        assertFalse(r.s.isRefreshing)
        // back to a seen sort: the cached list is there before any response
        val regate = gated(PostFixtures.pageResult(recent1))
        r.repo.posts.enqueue(q(TODAY, PostSort.RECENT), regate)
        r.holder.onSortSelected(PostSort.RECENT)
        assertEquals(recentIds, r.s.photos.ids)
        regate.release(); advanceUntilIdle()
        assertEquals(recentIds, r.s.photos.ids)
    }

    @Test
    fun `TC-DISP-013 a past date is an archive - popular only, no sort tabs, top 5 as carousel and the archive description`() = runTest {
        val r = displayRig(initialDate = YESTERDAY, auto = false)
        r.repo.topics.always(YESTERDAY, PostFixtures.topicResult("display/topics__open-2026-10-26.json"))
        r.repo.posts.always(q(YESTERDAY, PostSort.POPULAR), PostFixtures.pageResult(popular1))
        r.show()
        assertTrue(r.s.isArchive)
        assertTrue(r.s.sortOptions.isEmpty())
        assertEquals(listOf(q(YESTERDAY, PostSort.POPULAR)), r.repo.posts.calls.toList())
        assertEquals(fixtureIds(popular1).take(5), r.s.featured.ids)
        assertEquals(fixtureIds(popular1), r.s.photos.ids)
        assertEquals("display.header.desc-archive", r.s.descriptionKey)
        assertEquals("가장 사람들이 좋아했던 사진들이에요", Copy[r.s.descriptionKey])
        assertEquals("단풍", r.s.topic?.title)
    }

    @Test
    fun `TC-DISP-014 the sort chosen for today is restored when coming back from a past date`() = runTest {
        val r = displayRig()
        r.show()
        r.holder.onSortSelected(PostSort.RANDOM); r.idle()
        r.holder.onPreviousDate(); r.idle()
        assertEquals(YESTERDAY, r.s.date)
        assertTrue(r.s.sortOptions.isEmpty())
        r.holder.onNextDate(); r.idle()
        assertEquals(TODAY, r.s.date)
        assertEquals(PostSort.RANDOM, r.s.sort)
        assertEquals(listOf(PostSort.RECENT, PostSort.POPULAR, PostSort.RANDOM), r.s.sortOptions)
        assertEquals(PostSort.RANDOM, r.repo.posts.calls.last().sort)
    }

    @Test
    fun `TC-DISP-043 an archive with fewer than five photos uses what it has and does not break`() = runTest {
        val r = displayRig(initialDate = YESTERDAY, auto = false)
        r.repo.topics.always(YESTERDAY, PostFixtures.topicResult("display/topics__open-2026-10-26.json"))
        r.repo.posts.always(q(YESTERDAY, PostSort.POPULAR), PostFixtures.pageResult("display/posts-list__popular-3.json"))
        r.show()
        assertEquals(DisplayStatus.Content, r.s.status)
        assertEquals(3, r.s.featured.size)
        assertEquals(fixtureIds("display/posts-list__popular-3.json"), r.s.featured.ids)
        assertFalse(r.s.hasNext)
    }

    @Test
    fun `TC-DISP-042 revalidating the same archive keeps the carousel page, another date resets it`() = runTest {
        val r = displayRig(initialDate = YESTERDAY)
        r.show()
        r.holder.onFeaturedPageChanged(3)
        assertEquals(3, r.s.featuredPage)
        r.holder.onTabReselected(); r.idle()
        assertEquals(3, r.s.featuredPage)
        r.holder.onPreviousDate(); r.idle()
        assertEquals(0, r.s.featuredPage)
    }

    // ---- random seed ----------------------------------------------------------------------------------------

    @Test
    fun `TC-DISP-015 the first random page is requested without a seed and the response seed is stored`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.show()
        assertEquals(listOf(q(TODAY, PostSort.RANDOM)), r.repo.posts.calls.toList())
        assertNull(r.repo.posts.calls.single().randomSeed)
        assertEquals(seed, r.s.randomSeed)
    }

    @Test
    fun `TC-DISP-016 page 2 of random goes out with the stored seed`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.show()
        r.holder.onReachedEnd(); r.idle()
        assertEquals(q(TODAY, PostSort.RANDOM, page = 2, seed = seed), r.repo.posts.calls.last())
        assertEquals(fixtureIds(random1) + fixtureIds(random2), r.s.photos.ids)
    }

    @Test
    fun `TC-DISP-017 revalidating random page 1 sends the stored seed and keeps the already loaded later pages`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.show()
        r.holder.onReachedEnd(); r.idle()
        val before = r.s.photos.ids
        assertEquals(27, before.size)
        r.holder.onTabReselected(); r.idle()
        assertEquals(q(TODAY, PostSort.RANDOM, page = 1, seed = seed), r.repo.posts.calls.last())
        assertEquals(before, r.s.photos.ids)
        assertEquals(seed, r.s.randomSeed)
    }

    @Test
    fun `TC-DISP-018 leaving random drops the seed and later queries never carry one`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.show()
        assertEquals(seed, r.s.randomSeed)
        r.holder.onSortSelected(PostSort.RECENT); r.idle()
        assertNull(r.s.randomSeed)
        r.holder.onSortSelected(PostSort.POPULAR); r.idle()
        assertNull(r.s.randomSeed)
        assertTrue(r.repo.posts.calls.filter { it.sort != PostSort.RANDOM }.all { it.randomSeed == null })
        r.holder.onSortSelected(PostSort.RANDOM); r.idle()
        assertNull(r.repo.posts.calls.last { it.sort == PostSort.RANDOM }.randomSeed)
    }

    @Test
    fun `TC-DISP-019 a random answer without a seed never triggers a page 2 request`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.repo.posts.always(q(TODAY, PostSort.RANDOM), PostFixtures.pageResult("display/posts-list__random-no-seed.json"))
        r.show()
        val calls = r.repo.posts.calls.size
        r.holder.onReachedEnd(); r.holder.onReachedEnd(); r.idle()
        assertEquals(calls, r.repo.posts.calls.size)
        assertEquals(DisplayStatus.Content, r.s.status)
        assertNull(r.s.randomSeed)
        assertFalse(r.s.isPaging)
        assertTrue(r.toasts().isEmpty())
    }

    @Test
    fun `TC-DISP-020 ids repeated across random pages are shown once`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.repo.posts.always(q(TODAY, PostSort.RANDOM, 2, seed), PostFixtures.pageResult("display/posts-list__random-page2-overlap.json"))
        r.show()
        r.holder.onReachedEnd(); r.idle()
        assertEquals(25, r.s.photos.size) // 20 + 7 - 2 duplicates
        assertEquals(r.s.photos.ids.distinct(), r.s.photos.ids)
    }

    @Test
    fun `TC-DISP-021 changing the date never reuses the seed of the previous date`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.show()
        assertEquals(seed, r.s.randomSeed)
        r.holder.onPreviousDate(); r.idle()
        assertNull(r.s.randomSeed)
        assertEquals(q(YESTERDAY, PostSort.POPULAR), r.repo.posts.calls.last())
        assertTrue(r.repo.posts.calls.filter { it.date() == YESTERDAY }.all { it.randomSeed == null })
    }

    @Test
    fun `TC-DISP-045 coming back from the feed revalidates random with the same seed and the next page uses it too`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.show()
        r.holder.onScreenHidden(); r.idle()
        r.holder.onScreenShown(); r.idle()
        assertEquals(q(TODAY, PostSort.RANDOM, page = 1, seed = seed), r.repo.posts.calls.last())
        assertEquals(seed, r.s.randomSeed)
        r.holder.onReachedEnd(); r.idle()
        assertEquals(q(TODAY, PostSort.RANDOM, page = 2, seed = seed), r.repo.posts.calls.last())
        assertEquals(27, r.s.photos.size)
    }

    // ---- paging ----------------------------------------------------------------------------------------------

    @Test
    fun `TC-DISP-022 reaching the end asks for the next page exactly once and appends it`() = runTest {
        val r = displayRig()
        r.show()
        val gate = gated(PostFixtures.pageResult(recent2))
        r.repo.posts.enqueue(q(TODAY, PostSort.RECENT, 2), gate)
        r.holder.onReachedEnd(); r.holder.onReachedEnd(); r.holder.onReachedEnd(); runCurrent()
        assertEquals(1, r.repo.posts.calls.count { it.page == 2 })
        assertTrue(r.s.isPaging)
        gate.release(); advanceUntilIdle()
        assertEquals(27, r.s.photos.size)
        assertEquals(fixtureIds(recent1) + fixtureIds(recent2), r.s.photos.ids)
        assertFalse(r.s.isPaging)
    }

    @Test
    fun `TC-DISP-023 at the last page nothing is requested and an empty out-of-range page is not an error`() = runTest {
        val r = displayRig()
        r.show()
        r.holder.onReachedEnd(); r.idle()
        assertFalse(r.s.hasNext)
        val calls = r.repo.posts.calls.size
        r.holder.onReachedEnd(); r.idle()
        assertEquals(calls, r.repo.posts.calls.size)

        val e = displayRig()
        e.repo.posts.always(q(TODAY, PostSort.RECENT, 2), PostFixtures.pageResult("display/posts-list__page99-empty.json"))
        e.show()
        e.holder.onReachedEnd(); e.idle()
        assertEquals(DisplayStatus.Content, e.s.status)
        assertEquals(20, e.s.photos.size)
        assertFalse(e.s.hasNext)
        assertFalse(e.s.isPaging)
        assertTrue(e.toasts().isEmpty())
    }

    @Test
    fun `TC-DISP-024 no next page is requested while the first page is being revalidated`() = runTest {
        val r = displayRig()
        r.show()
        val gate = gated(PostFixtures.pageResult(recent1))
        r.repo.posts.enqueue(q(TODAY, PostSort.RECENT, 1), gate)
        r.holder.onTabReselected(); runCurrent()
        assertTrue(r.s.isRefreshing)
        r.holder.onReachedEnd(); runCurrent()
        assertEquals(0, r.repo.posts.calls.count { it.page == 2 })
        gate.release(); advanceUntilIdle()
    }

    @Test
    fun `TC-DISP-025 revalidating page 1 keeps the cached next pages`() = runTest {
        val r = displayRig()
        r.show()
        r.holder.onReachedEnd(); r.idle()
        assertEquals(27, r.s.photos.size)
        r.holder.onTabReselected(); r.idle()
        assertEquals(fixtureIds(recent1) + fixtureIds(recent2), r.s.photos.ids)
        assertFalse(r.s.hasNext)
    }

    @Test
    fun `TC-DISP-026 a failed next page toasts, keeps the photos and the same page is requested again at the next end`() = runTest {
        val r = displayRig()
        r.show()
        r.repo.posts.enqueue(q(TODAY, PostSort.RECENT, 2), PostFixtures.failure("display/posts-list__500-server-error.json"))
        r.holder.onReachedEnd(); r.idle()
        assertEquals(20, r.s.photos.size)
        assertEquals(DisplayStatus.Content, r.s.status)
        assertEquals("display.error", r.toasts().single().copyKey)
        assertFalse(r.s.isPaging)
        r.holder.onReachedEnd(); r.idle()
        assertEquals(listOf(2, 2), r.repo.posts.calls.filter { it.page == 2 }.map { it.page })
        assertEquals(27, r.s.photos.size)
    }

    @Test
    fun `TC-DISP-027 an item shifted onto the next page by a new post is shown once`() = runTest {
        val r = displayRig()
        r.repo.posts.always(q(TODAY, PostSort.RECENT, 2), PostFixtures.pageResult("display/posts-list__recent-page2-overlap.json"))
        r.show()
        r.holder.onReachedEnd(); r.idle()
        assertEquals(26, r.s.photos.size) // 20 + 7 - 1 duplicate
        assertEquals(r.s.photos.ids.distinct(), r.s.photos.ids)
    }

    // ---- cache, revalidation, stale ------------------------------------------------------------------------------

    @Test
    fun `TC-DISP-044 re-selecting the tab keeps the exhibition while refreshing and swaps in the new values`() = runTest {
        val r = displayRig()
        r.show()
        val old = r.s.photos
        val fresh = PostFixtures.page(recent1).let { p -> p.copy(posts = p.posts.map { it.copy(likeCount = it.likeCount + 100) }) }
        val gate = gated(kr.chalkak.core.network.ApiResult.Success(fresh))
        r.repo.posts.enqueue(q(TODAY, PostSort.RECENT), gate)
        r.holder.onTabReselected(); runCurrent()
        assertTrue(r.s.isRefreshing)
        assertEquals(old, r.s.photos)
        gate.release(); advanceUntilIdle()
        assertFalse(r.s.isRefreshing)
        assertEquals(old.map { it.likeCount + 100 }, r.s.photos.map { it.likeCount })
    }

    @Test
    fun `TC-DISP-047 a slow answer of a previous sort never covers the newer sort and stays in its cache`() = runTest {
        val r = displayRig()
        r.show()
        val slow = gated(PostFixtures.pageResult(popular1))
        r.repo.posts.enqueue(q(TODAY, PostSort.POPULAR), slow)
        r.holder.onSortSelected(PostSort.POPULAR); runCurrent()
        r.holder.onSortSelected(PostSort.RANDOM); advanceUntilIdle()
        assertEquals(PostSort.RANDOM, r.s.sort)
        assertEquals(fixtureIds(random1), r.s.photos.ids)
        slow.release(); advanceUntilIdle()
        assertEquals(PostSort.RANDOM, r.s.sort)
        assertEquals(fixtureIds(random1), r.s.photos.ids)
        // the late answer is in the (date, sort) cache: selecting popular shows it at once
        r.repo.posts.enqueue(q(TODAY, PostSort.POPULAR), gated(PostFixtures.pageResult(popular1)))
        r.holder.onSortSelected(PostSort.POPULAR)
        assertEquals(fixtureIds(popular1), r.s.photos.ids)
        assertNotEquals(fixtureIds(random1), r.s.photos.ids)
    }

    private fun kr.chalkak.core.data.post.PostsQuery.date() = topicDate
}
