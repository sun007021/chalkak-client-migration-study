package kr.chalkak.feature.home

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.auth.HomeMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** ISSUE section: loading, hiding, paging (TC-BANR-008..016) and the banner tap. */
class HomeBannerListTest {
    private val page1 = HomeFixtureModels.bannerPage("banner/banners__page1-10.json")
    private val page2 = HomeFixtureModels.bannerPage("banner/banners__page2-last.json")
    private val failure500 = HomeFixtureModels.failure("banner/banners__500-server-error.json")

    private fun Rig.issue() = assertIs<IssueState.Ready>(s.issue)
    private fun Rig.ids() = issue().banners.map { it.id }

    // ---- first load ---------------------------------------------------------------------------------

    @Test
    fun `TC-BANR-008 a cancelled request leaves the ISSUE section unchanged and shows nothing`() = runTest {
        val r = rig()
        r.banners.handler = { ApiResult.Failure(ApiError.Cancelled) }
        show(r)
        assertIs<TopicHeader.Ready>(r.s.topic)
        assertFalse(r.s.issue is IssueState.Error)
        assertTrue(r.toasts.isEmpty())
    }

    @Test
    fun `TC-BANR-008 leaving the screen while the first page is loading does not produce an ISSUE error`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.banners.handler = { gate.await(); failure500 }
        r.holder.onShown(); runCurrent()
        r.holder.onScreenGone(); runCurrent()
        gate.complete(Unit); advanceUntilIdle()
        assertFalse(r.s.issue is IssueState.Error)
        assertTrue(r.toasts.isEmpty())

        r.banners.handler = { ok(page1) }
        r.holder.onShown(); advanceUntilIdle()
        assertEquals(10, r.ids().size)
    }

    @Test
    fun `TC-BANR-009 a guest sees the ISSUE section even when the ranking fails`() = runTest {
        val r = rig(HomeMode.Guest)
        r.home.postsHandler = { HomeFixtureModels.failure("home/posts-list__500-server-error.json") }
        show(r)
        assertEquals(page1.banners.map { it.id }, r.ids())
        assertEquals(listOf(1), r.banners.pageCalls.toList())
        assertIs<Section.Error>(r.s.popular)
    }

    @Test
    fun `TC-BANR-010 a failing first banner request errors only the ISSUE section`() = runTest {
        val r = rig()
        r.banners.handler = { failure500 }
        show(r)
        assertEquals(IssueState.Error, r.s.issue)
        assertIs<HeroState.Photo>(r.s.hero)
        assertIs<Section.Ready<*>>(r.s.week)
        assertIs<Section.Ready<*>>(r.s.popular)
        assertIs<Section.Ready<*>>(r.s.yesterday)
    }

    @Test
    fun `TC-BANR-010 an empty banner list hides the ISSUE section`() = runTest {
        val r = rig()
        r.banners.handler = { ok(HomeFixtureModels.bannerPage("banner/banners__empty.json")) }
        show(r)
        assertEquals(IssueState.Hidden, r.s.issue)
        assertIs<HeroState.Photo>(r.s.hero)
    }

    @Test
    fun `TC-BANR-011 a failing refresh keeps the banners and an empty successful refresh removes them`() = runTest {
        val r = rig()
        show(r)
        val shown = r.ids()
        assertEquals(10, shown.size)

        r.banners.handler = { failure500 }
        r.holder.onPullToRefresh(); advanceUntilIdle()
        assertEquals(shown, r.ids())

        r.banners.handler = { ok(HomeFixtureModels.bannerPage("banner/banners__empty.json")) }
        r.holder.onPullToRefresh(); advanceUntilIdle()
        assertEquals(IssueState.Hidden, r.s.issue)
    }

    // ---- paging -------------------------------------------------------------------------------------

    @Test
    fun `TC-BANR-012 reaching the second to last card requests page 2 once and accumulates 10 plus 3`() = runTest {
        val r = rig()
        show(r)
        r.holder.onBannerScrolled(0)
        r.holder.onBannerScrolled(5)
        advanceUntilIdle()
        assertEquals(listOf(1), r.banners.pageCalls.toList())

        r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(listOf(1, 2), r.banners.pageCalls.toList())
        assertEquals((page1.banners + page2.banners).map { it.id }, r.ids())
        assertFalse(r.issue().hasNext)
    }

    @Test
    fun `TC-BANR-012 while page 2 is loading further scroll events send no second request`() = runTest {
        val r = rig()
        show(r)
        val gate = CompletableDeferred<Unit>()
        val default = r.banners.handler
        r.banners.handler = { p -> if (p == 2) gate.await(); default(p) }
        r.holder.onBannerScrolled(8); runCurrent()
        assertTrue(r.issue().loadingMore)
        r.holder.onBannerScrolled(9); r.holder.onBannerScrolled(8); runCurrent()
        assertEquals(listOf(1, 2), r.banners.pageCalls.toList())

        gate.complete(Unit); advanceUntilIdle()
        assertFalse(r.issue().loadingMore)
        assertEquals(13, r.ids().size)
    }

    @Test
    fun `TC-BANR-013 a failed next page keeps the list, retries the same page and drops duplicate ids`() = runTest {
        val r = rig()
        show(r)
        var n = 0
        val duplicated = page2.copy(banners = page2.banners + page1.banners.first())
        r.banners.handler = { p ->
            when {
                p == 1 -> ok(page1)
                ++n == 1 -> failure500
                else -> ok(duplicated)
            }
        }
        r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(10, r.ids().size)
        assertEquals(2, r.issue().nextPage)
        assertFalse(r.issue().loadingMore)
        assertEquals(1, r.toasts.size)

        r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(listOf(1, 2, 2), r.banners.pageCalls.toList())
        assertEquals(13, r.ids().size)
        assertEquals(r.ids().distinct(), r.ids())
    }

    @Test
    fun `TC-BANR-014 hasNext false means no further request when the end is reached`() = runTest {
        val r = rig()
        r.banners.handler = { ok(page1.copy(hasNext = false)) }
        show(r)
        r.holder.onBannerScrolled(9); r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(listOf(1), r.banners.pageCalls.toList())
    }

    @Test
    fun `TC-BANR-014 an empty extra page keeps the list and ends the paging`() = runTest {
        val r = rig()
        show(r)
        val shown = r.ids()
        r.banners.handler = { p -> if (p == 1) ok(page1) else ok(HomeFixtureModels.bannerPage("banner/banners__empty.json")) }
        r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(shown, r.ids())
        r.holder.onBannerScrolled(9); r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(listOf(1, 2), r.banners.pageCalls.toList())
    }

    @Test
    fun `TC-BANR-015 a refresh replaces the accumulated list and paging starts again at page 2`() = runTest {
        val r = rig()
        show(r)
        r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(13, r.ids().size)

        r.holder.onPullToRefresh(); advanceUntilIdle()
        assertEquals(page1.banners.map { it.id }, r.ids())
        assertEquals(2, r.issue().nextPage)
        r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(listOf(1, 2, 1, 2), r.banners.pageCalls.toList())
    }

    @Test
    fun `TC-BANR-016 a late page 2 after leaving the screen does not change the list`() = runTest {
        val r = rig()
        show(r)
        val gate = CompletableDeferred<Unit>()
        val default = r.banners.handler
        r.banners.handler = { p -> if (p == 2) gate.await(); default(p) }
        r.holder.onBannerScrolled(8); runCurrent()
        r.holder.onScreenGone(); runCurrent()
        gate.complete(Unit); advanceUntilIdle()
        assertEquals(page1.banners.map { it.id }, r.ids())
        assertTrue(r.toasts.isEmpty())
    }

    @Test
    fun `TC-BANR-016 a page 2 answer that arrives after a refresh cannot overwrite the refreshed list`() = runTest {
        val r = rig()
        show(r)
        val gate = CompletableDeferred<Unit>()
        val default = r.banners.handler
        var slowPage2: Boolean
        r.banners.handler = { p ->
            slowPage2 = p == 2 && !gate.isCompleted
            if (slowPage2) gate.await()
            default(p)
        }
        r.holder.onBannerScrolled(8); runCurrent()
        r.holder.onPullToRefresh(); runCurrent()
        gate.complete(Unit); advanceUntilIdle()

        assertEquals(page1.banners.map { it.id }, r.ids())
        assertEquals(2, r.issue().nextPage)
        r.holder.onBannerScrolled(8); advanceUntilIdle()
        assertEquals(13, r.ids().size)
    }

    // ---- tap ----------------------------------------------------------------------------------------

    @Test
    fun `TC-BANR-027 a guest tapping a banner opens the issue web view without a login prompt`() = runTest {
        val r = rig(HomeMode.Guest)
        show(r)
        val banner = r.issue().banners.first()
        r.holder.onBannerClicked(banner); advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenIssue(banner)), r.nonToastEffects)
        assertTrue(r.toasts.isEmpty())
    }

    @Test
    fun `TC-BANR-025 a banner tap sends screen_view issue once and a double tap opens a single web view`() = runTest {
        val r = rig()
        show(r)
        val banner = r.issue().banners.first()
        r.holder.onBannerClicked(banner); r.holder.onBannerClicked(banner); advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenIssue(banner)), r.nonToastEffects)
        assertEquals(listOf("issue"), r.analytics.screens.toList())
        assertTrue("issue" in AppConstants.ANALYTICS_SCREEN_NAMES)

        r.holder.onScreenGone(); r.holder.onShown(); advanceUntilIdle()
        r.holder.onBannerClicked(banner)
        assertEquals(listOf("issue", "issue"), r.analytics.screens.toList())
    }
}
