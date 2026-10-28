package kr.chalkak.feature.display

import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.AppConstants
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.gated
import java.time.LocalDate
import java.util.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** First load, errors, empty states, guest handling and entry of the exhibition tab (TC-DISP-001..010, 041, 048..055). */
class DisplayLoadTest {
    private val topicToday = "display/topics__open-2026-10-27.json"
    private val recentPage1 = "display/posts-list__recent-page1.json"

    @Test
    fun `TC-DISP-001 before the first answer the state is Loading and date navigation is disabled`() = runTest {
        val r = displayRig(auto = false)
        val gate = gated(PostFixtures.topicResult(topicToday))
        r.repo.topics.enqueue(TODAY, gate)
        r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult(recentPage1))
        assertEquals(DisplayStatus.Loading, r.s.status)
        r.holder.onScreenShown(); runCurrent()
        assertEquals(DisplayStatus.Loading, r.s.status)
        assertFalse(r.s.canGoPrevious)
        assertFalse(r.s.canGoNext)
        r.holder.onPreviousDate(); r.holder.onNextDate(); r.holder.onDateSelected(YESTERDAY); runCurrent()
        assertEquals(1, r.repo.topics.calls.size) // moves are ignored while the first load runs
        gate.release(); advanceUntilIdle()
        assertEquals(DisplayStatus.Content, r.s.status)
        assertTrue(r.s.canGoPrevious)
        assertFalse(r.s.canGoNext) // today: no future
    }

    @Test
    fun `TC-DISP-002 topics is asked first, its topicDate drives GET posts recent page 1, photos are mapped`() = runTest {
        val r = displayRig(auto = false)
        val gate = gated(PostFixtures.topicResult(topicToday))
        r.repo.topics.enqueue(TODAY, gate)
        r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult(recentPage1))
        r.holder.onScreenShown(); runCurrent()
        assertEquals(listOf(TODAY), r.repo.topics.calls.toList())
        assertTrue(r.repo.posts.calls.isEmpty()) // posts only after the topic answered
        gate.release(); advanceUntilIdle()
        assertEquals(listOf(q(TODAY, PostSort.RECENT, page = 1)), r.repo.posts.calls.toList())
        assertEquals(TODAY, r.s.date)
        assertEquals("가을 하늘", r.s.topic?.title)
        assertEquals(fixtureIds(recentPage1), r.s.photos.ids)
        assertEquals(PostSort.RECENT, r.s.sort)
        assertEquals(AppConstants.PAGE_SIZE, r.s.photos.size)
        val mine = r.photo("201")
        assertTrue(mine.isMine)
        assertEquals(10, mine.likeCount)
        assertEquals("비 오는 날", mine.title)
    }

    @Test
    fun `TC-DISP-002 a topics answer for another date than requested is an invalid response - error state, no posts request`() = runTest {
        val r = displayRig(auto = false)
        r.repo.topics.always(TODAY, PostFixtures.topicResult("display/topics__open-2026-10-26.json"))
        r.show()
        assertEquals(DisplayStatus.Error, r.s.status)
        assertEquals("display.error", r.s.errorCopyKey)
        assertTrue(r.s.showRetry)
        assertEquals(TODAY, r.s.date) // the requested date, not the response date
        assertTrue(r.s.photos.isEmpty())
        assertTrue(r.repo.posts.calls.isEmpty())
    }

    @Test
    fun `TC-DISP-002 a date move whose topics answer carries another date restores the shown exhibition with the error toast`() = runTest {
        val r = displayRig()
        r.show()
        val before = r.s
        r.repo.topics.enqueue(YESTERDAY, PostFixtures.topicResult(topicToday))
        r.holder.onPreviousDate(); r.idle()
        assertEquals(TODAY, r.s.date)
        assertEquals(before.photos, r.s.photos)
        assertEquals(before.topic, r.s.topic)
        assertEquals("display.error", r.toasts().single().copyKey)
        assertEquals(1, r.repo.posts.calls.size) // only the first load asked for posts
    }

    @Test
    fun `TC-DISP-005 first load failure keeps the requested date, shows the error with retry and retries the same date`() = runTest {
        val r = displayRig(auto = false)
        r.repo.topics.always(TODAY, PostFixtures.topicResult(topicToday))
        r.repo.posts.enqueue(
            q(TODAY, PostSort.RECENT),
            PostFixtures.failure("display/posts-list__500-server-error.json"),
            PostFixtures.pageResult(recentPage1),
        )
        r.show()
        assertEquals(DisplayStatus.Error, r.s.status)
        assertEquals("display.error", r.s.errorCopyKey)
        assertEquals("전시를 불러오지 못했어요", Copy[r.s.errorCopyKey!!])
        assertTrue(r.s.showRetry)
        assertEquals(TODAY, r.s.date)
        assertTrue(r.s.photos.isEmpty())
        r.holder.onRetry(); r.idle()
        assertEquals(DisplayStatus.Content, r.s.status)
        assertEquals(listOf(q(TODAY, PostSort.RECENT), q(TODAY, PostSort.RECENT)), r.repo.posts.calls.toList())
        assertEquals(listOf(TODAY, TODAY), r.repo.topics.calls.take(2))
    }

    @Test
    fun `TC-DISP-005 a connection failure shows the network message`() = runTest {
        val r = displayRig(auto = false)
        r.repo.topics.always(TODAY, PostFixtures.network())
        r.show()
        assertEquals(DisplayStatus.Error, r.s.status)
        assertEquals("common.error.network", r.s.errorCopyKey)
        assertEquals("네트워크 연결을 확인해 주세요.", Copy[r.s.errorCopyKey!!])
        assertTrue(r.s.showRetry)
        assertEquals(TODAY, r.s.date)
    }

    @Test
    fun `TC-DISP-006 no topic today on the first load is an empty state, not an error`() = runTest {
        val r = displayRig(auto = false)
        r.repo.topics.always(TODAY, PostFixtures.failure("display/topics__404-not-found.json"))
        r.show()
        assertEquals(DisplayStatus.Empty, r.s.status)
        assertNull(r.s.errorCopyKey)
        assertFalse(r.s.showRetry)
        assertEquals("이 날 올라온 사진이 없어요", Copy["display.empty"])
        assertTrue(r.repo.posts.calls.isEmpty())
        assertTrue(r.toasts().isEmpty())
    }

    @Test
    fun `TC-DISP-007 posts 404 for the topic date is empty without retry and date navigation still works`() = runTest {
        val r = displayRig()
        r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.failure("display/posts-list__404-topic-not-found.json"))
        r.show()
        assertEquals(DisplayStatus.Empty, r.s.status)
        assertFalse(r.s.showRetry)
        assertTrue(r.s.canGoPrevious)
        r.holder.onPreviousDate(); r.idle()
        assertEquals(YESTERDAY, r.s.date)
        assertEquals(DisplayStatus.Content, r.s.status)
    }

    @Test
    fun `TC-DISP-008 a 400 is a plain error with retry and is not retried by itself nor judged by message`() = runTest {
        for (fixture in listOf("display/posts-list__400-future-date.json", "display/posts-list__400-bad-query.json")) {
            val r = displayRig()
            r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.failure(fixture))
            r.show()
            r.t.advanceTimeBy(60_000)
            assertEquals(DisplayStatus.Error, r.s.status, fixture)
            assertEquals("display.error", r.s.errorCopyKey, fixture)
            assertTrue(r.s.showRetry)
            assertEquals(1, r.repo.posts.calls.size, fixture)
        }
    }

    @Test
    fun `TC-DISP-009 BEFORE_OPEN and CLOSED topics still load their posts`() = runTest {
        for (phase in listOf("BEFORE_OPEN", "CLOSED")) {
            val r = displayRig(auto = false)
            val topic = PostFixtures.topic("display/topics__before-open.json").copy(topicDate = "2026-10-27", phase = phase)
            r.repo.topics.always(TODAY, kr.chalkak.core.network.ApiResult.Success(topic))
            r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult(recentPage1))
            r.show()
            assertEquals(DisplayStatus.Content, r.s.status, phase)
            assertEquals(20, r.s.photos.size, phase)
            assertEquals(1, r.repo.posts.calls.size, phase)
        }
    }

    @Test
    fun `TC-DISP-010 a failed revalidation keeps the photos and only toasts`() = runTest {
        val r = displayRig()
        r.show()
        val before = r.s.photos
        r.repo.posts.enqueue(q(TODAY, PostSort.RECENT), PostFixtures.failure("display/posts-list__500-server-error.json"))
        r.holder.onTabReselected(); r.idle()
        assertEquals(DisplayStatus.Content, r.s.status)
        assertEquals(before, r.s.photos)
        assertFalse(r.s.isRefreshing)
        assertEquals("display.error", r.toasts().single().copyKey)
    }

    @Test
    fun `TC-DISP-041 the date label is the response topicDate text in M월 d일 regardless of the device time zone`() = runTest {
        val old = TimeZone.getDefault()
        try {
            for (zone in listOf("UTC", "America/Los_Angeles", "Asia/Seoul")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone))
                val r = displayRig(auto = false)
                r.repo.topics.always(TODAY, PostFixtures.topicResult(topicToday))
                r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult(recentPage1))
                r.show()
                assertEquals("10월 27일", r.s.dateLabel, zone)
            }
            // single digit month/day have no zero padding
            val r = displayRig(auto = false, now = "2026-09-07T03:00:00Z")
            r.repo.topics.always(LocalDate.of(2026, 9, 7), kr.chalkak.core.network.ApiResult.Success(PostFixtures.topicFor(LocalDate.of(2026, 9, 7))))
            r.repo.posts.default = { kr.chalkak.core.network.ApiResult.Success(PostFixtures.pageFor(it)) }
            r.show()
            assertEquals("9월 7일", r.s.dateLabel)
        } finally {
            TimeZone.setDefault(old)
        }
    }

    @Test
    fun `TC-DISP-048 leaving while loading cancels silently - no toast, no error - and re-entry loads again`() = runTest {
        val r = displayRig()
        val gate = gated(PostFixtures.topicResult(topicToday))
        r.repo.topics.enqueue(TODAY, gate)
        r.holder.onScreenShown(); runCurrent()
        r.holder.onScreenHidden(); runCurrent()
        gate.release(); advanceUntilIdle()
        assertEquals(DisplayStatus.Loading, r.s.status)
        assertNull(r.s.errorCopyKey)
        assertTrue(r.toasts().isEmpty())
        r.show()
        assertEquals(2, r.repo.topics.calls.size)
        assertEquals(DisplayStatus.Content, r.s.status)
    }

    @Test
    fun `TC-DISP-049 after an account switch nothing of the previous account is shown or sent`() = runTest {
        val r = displayRig(initialSort = PostSort.RANDOM)
        r.show()
        assertEquals("seed_abc123", r.s.randomSeed)
        assertTrue(r.photo("203").isLiked) // user A liked this one
        r.user.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        r.holder.onUserChanged(); r.likes.reset(); r.changes.reset()
        assertTrue(r.s.photos.isEmpty())
        assertNull(r.s.randomSeed)
        r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult("display/posts-list__guest-page1.json"))
        val callsBefore = r.repo.posts.calls.size
        r.show()
        val after = r.repo.posts.calls.drop(callsBefore)
        assertTrue(after.isNotEmpty())
        assertTrue(after.all { it.randomSeed == null })
        assertTrue(r.s.photos.none { it.isLiked })
        assertTrue(r.s.photos.none { it.isMine })
    }

    @Test
    fun `TC-DISP-053 a guest sees the list and the likes are the server values`() = runTest {
        val r = displayRig(userId = null, auto = false)
        r.repo.topics.always(TODAY, PostFixtures.topicResult(topicToday))
        r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult("display/posts-list__guest-page1.json"))
        r.show()
        assertEquals(DisplayStatus.Content, r.s.status)
        assertEquals(20, r.s.photos.size)
        assertTrue(r.s.photos.none { it.isLiked || it.isMine })
        assertTrue(r.repo.details.calls.isEmpty())
    }

    @Test
    fun `TC-DISP-054 a guest tapping a photo gets the login toast, no detail request and no navigation`() = runTest {
        val r = displayRig(userId = null, auto = false)
        r.repo.topics.always(TODAY, PostFixtures.topicResult(topicToday))
        r.repo.posts.always(q(TODAY, PostSort.RECENT), PostFixtures.pageResult("display/posts-list__guest-page1.json"))
        r.show()
        r.holder.onPhotoClicked(POST_OTHER); r.idle()
        assertEquals("guest.feed", r.toasts().single().copyKey)
        assertEquals("게시물 피드를 보려면 로그인이 필요해요", Copy["guest.feed"])
        assertTrue(r.repo.details.calls.isEmpty())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-DISP-055 tapping a photo opens the detail seeded with the list item without waiting for the detail request`() = runTest {
        val r = displayRig()
        r.show()
        r.holder.onPhotoClicked(POST_OTHER); r.idle()
        val effect = assertIs<DisplayEffect.OpenFeed>(r.effects.single())
        assertEquals(PostFixtures.summary("202"), effect.post)
        assertTrue(r.repo.details.calls.isEmpty())
        assertTrue(r.toasts().isEmpty())
    }

    @Test
    fun `TC-FEED-036 and TC-FEED-044 a removed post leaves the list at once and a late revalidation cannot bring it back`() = runTest {
        val r = displayRig()
        r.show()
        assertTrue(r.s.photos.any { it.id == POST_OTHER })
        r.changes.markRemoved(POST_OTHER); r.idle()
        assertTrue(r.s.photos.none { it.id == POST_OTHER })
        r.holder.onTabReselected(); r.idle() // the server list still contains it
        assertTrue(r.s.photos.none { it.id == POST_OTHER })
        assertEquals(19, r.s.photos.size)
    }

    @Test
    fun `TC-FEED-024 a title edited on the detail is shown in the exhibition list`() = runTest {
        val r = displayRig()
        r.show()
        r.changes.titleChanged(POST_OTHER, "새 제목"); r.idle()
        assertEquals("새 제목", r.photo("202").title)
        r.changes.titleChanged(POST_OTHER, null); r.idle()
        assertNull(r.photo("202").title)
        r.holder.onTabReselected(); r.idle()
        assertNull(r.photo("202").title)
    }

    @Test
    fun `TC-DISP-056 a screen opened with a date (upload success, record) loads that date's exhibition first`() = runTest {
        val r = displayRig(initialDate = YESTERDAY)
        r.show()
        assertEquals(YESTERDAY, r.s.date)
        assertEquals(listOf(YESTERDAY), r.repo.topics.calls.toList())
        assertNotEquals(TODAY, r.s.date)
    }

    // ---- analytics (D-22, TC-ANL-005/017/018/021/022) ---------------------------------------------------------

    @Test
    fun `TC-ANL-005 and TC-ANL-018 showing the exhibition sends screen_view display once, even if shown again without leaving`() = runTest {
        val r = displayRig()
        r.show()
        r.holder.onScreenShown(); r.holder.onScreenShown(); r.idle()
        assertEquals(listOf("display"), r.analytics.screens.toList())
        assertTrue("display" in AppConstants.ANALYTICS_SCREEN_NAMES)
    }

    @Test
    fun `TC-ANL-017 coming back to the exhibition sends screen_view display again`() = runTest {
        val r = displayRig()
        r.show()
        r.holder.onScreenHidden()
        r.show()
        assertEquals(listOf("display", "display"), r.analytics.screens.toList())
    }

    @Test
    fun `TC-ANL-021 and TC-ANL-022 a failing tracker does not disturb the screen, guests send the same event`() = runTest {
        val failing = displayRig(analytics = RecordingAnalytics(failure = IllegalStateException("tracker down")))
        failing.show()
        assertEquals(DisplayStatus.Content, failing.s.status)

        val guest = displayRig(userId = null)
        guest.show()
        assertEquals(listOf("display"), guest.analytics.screens.toList())
    }
}
