package kr.chalkak.feature.display

import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.POST_MINE_PAST
import kr.chalkak.core.data.post.testing.POST_OTHER
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.post.testing.USER_B_ID
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import java.time.LocalDate
import java.util.TimeZone
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Loading, seeds, errors and permissions of the post detail (TC-FEED-001..013, 016, 017, 057). */
class FeedDetailTest {
    private val other = "feed/posts-detail__other.json"
    private val mineToday = "feed/posts-detail__mine-today.json"
    private val mineNoSeed = FeedEntry.FromPush(POST_MINE)
    private val otherNoSeed = FeedEntry.FromPush(POST_OTHER)

    private fun FeedRig.serve(path: String, id: String) = repo.details.always(id, PostFixtures.detailResult(path))

    @Test
    fun `TC-FEED-001 a display seed is shown at once, the heart stays disabled until the detail confirms it`() = runTest {
        val seed = PostFixtures.summary("202")
        val r = feedRig(FeedEntry.FromDisplay(seed))
        val gate = gated(PostFixtures.detailResult(other))
        r.repo.details.enqueue(POST_OTHER, gate)
        r.holder.onScreenShown(); runCurrent()
        assertEquals(FeedStatus.Content, r.s.status)
        assertFalse(r.s.confirmed)
        assertEquals(seed.originalImageUrl, r.s.content?.originalImageUrl)
        assertEquals(seed.likeCount, r.s.content?.likeCount)
        assertEquals(seed.isLiked, r.s.content?.isLiked)
        assertEquals(seed.title, r.s.content?.title)
        assertFalse(r.s.likeEnabled)
        gate.release(); advanceUntilIdle()
        assertTrue(r.s.confirmed)
        assertTrue(r.s.likeEnabled)
        assertEquals(1, r.repo.details.calls.size)
    }

    @Test
    fun `TC-FEED-001 a record entry shows the given thumbnail first and a push entry shows loading`() = runTest {
        val record = feedRig(FeedEntry.FromRecord(POST_MINE, "https://cdn.example.test/t.webp"))
        record.repo.details.enqueue(POST_MINE, gated(PostFixtures.detailResult(mineToday)))
        record.holder.onScreenShown(); runCurrent()
        assertEquals("https://cdn.example.test/t.webp", record.s.content?.thumbnailImageUrl)
        assertFalse(record.s.likeEnabled)

        val push = feedRig(mineNoSeed)
        push.repo.details.enqueue(POST_MINE, gated(PostFixtures.detailResult(mineToday)))
        push.holder.onScreenShown(); runCurrent()
        assertEquals(FeedStatus.Loading, push.s.status)
        assertNull(push.s.content)
        assertFalse(push.s.likeEnabled)
    }

    @Test
    fun `TC-FEED-003 a missing thumbnail is replaced by the original and is not an error`() = runTest {
        val id = "22222222-2222-4222-8222-222222222205"
        val r = feedRig(FeedEntry.FromPush(id))
        r.serve("feed/posts-detail__null-thumbnail.json", id)
        r.show()
        assertEquals(FeedStatus.Content, r.s.status)
        assertEquals(r.s.content?.originalImageUrl, r.s.content?.thumbnailImageUrl)
        assertNotNull(r.s.content?.thumbnailImageUrl)
    }

    @Test
    fun `TC-FEED-004 mine is decided by authorId equal to the logged-in user, not by the entry`() = runTest {
        val record = feedRig(FeedEntry.FromRecord(POST_MINE, null))
        record.serve(mineToday, POST_MINE)
        record.show()
        assertTrue(record.s.isMine)
        assertTrue(record.s.canDelete)

        // the list said "mine" but the detail's author is someone else: the response wins (D-26)
        val seed = PostFixtures.summary("202").copy(isMine = true)
        val r = feedRig(FeedEntry.FromDisplay(seed))
        val gate = gated(PostFixtures.detailResult(other))
        r.repo.details.enqueue(POST_OTHER, gate)
        r.holder.onScreenShown(); runCurrent()
        assertTrue(r.s.isMine) // provisional value from the entry
        gate.release(); advanceUntilIdle()
        assertFalse(r.s.isMine)
        assertFalse(r.s.canDelete)
        assertFalse(r.s.canEditTitle)
    }

    @Test
    fun `TC-FEED-005 a guest who reaches the detail directly and gets 401 is sent to login`() = runTest {
        val r = feedRig(otherNoSeed, userId = null)
        r.repo.details.always(POST_OTHER, PostFixtures.failure("feed/posts-detail__401-unauthorized.json"))
        r.show()
        assertEquals(listOf<FeedEffect>(FeedEffect.LoginRequired), r.effects.toList())
        assertFalse(r.s.likeEnabled)
    }

    @Test
    fun `TC-FEED-006 when refresh ends in re-authentication required the user goes to login`() = runTest {
        val r = feedRig(otherNoSeed)
        r.repo.details.always(POST_OTHER, ApiResult.Failure(ApiError.Http(401, ErrorCode.REAUTHENTICATION_REQUIRED)))
        r.show()
        assertEquals(listOf<FeedEffect>(FeedEffect.LoginRequired), r.effects.toList())
    }

    @Test
    fun `TC-FEED-007 a 404 detail shows not-found and takes a seeded post out of the lists`() = runTest {
        val r = feedRig(FeedEntry.FromDisplay(PostFixtures.summary("202")))
        r.repo.details.always(POST_OTHER, PostFixtures.failure("feed/posts-detail__404-not-found.json"))
        r.show()
        assertEquals(FeedStatus.NotFound, r.s.status)
        assertEquals("feed.error.not-found", r.s.errorCopyKey)
        assertEquals("게시물을 찾을 수 없어요", Copy["feed.error.not-found"])
        assertTrue(r.changes.isRemoved(POST_OTHER))

        val push = feedRig(otherNoSeed)
        push.repo.details.always(POST_OTHER, PostFixtures.failure("feed/posts-detail__404-not-found.json"))
        push.show()
        assertEquals(FeedStatus.NotFound, push.s.status)
    }

    @Test
    fun `TC-FEED-008 400 and 500 are the generic load error with retry, a lost connection says network`() = runTest {
        for (fixture in listOf("feed/posts-detail__400-invalid-id.json", "feed/posts-detail__500-server-error.json")) {
            val r = feedRig(otherNoSeed)
            r.repo.details.enqueue(POST_OTHER, PostFixtures.failure(fixture), PostFixtures.detailResult(other))
            r.show()
            assertEquals(FeedStatus.Error, r.s.status, fixture)
            assertEquals("feed.error.load", r.s.errorCopyKey, fixture)
            assertEquals("게시물을 불러오지 못했어요", Copy["feed.error.load"])
            r.holder.onRetry(); r.idle()
            assertEquals(FeedStatus.Content, r.s.status, fixture)
            assertEquals(2, r.repo.details.calls.size)
        }
        val net = feedRig(otherNoSeed)
        net.repo.details.always(POST_OTHER, PostFixtures.network())
        net.show()
        assertEquals(FeedStatus.Error, net.s.status)
        assertEquals("common.error.network", net.s.errorCopyKey)
    }

    @Test
    fun `TC-FEED-009 a contract violation is its own message - an error screen, or a toast when a seed is visible`() = runTest {
        val bad = ApiResult.Failure(ApiError.InvalidResponse("likeCount is not a number"))
        val noSeed = feedRig(otherNoSeed)
        noSeed.repo.details.always(POST_OTHER, bad)
        noSeed.show()
        assertEquals(FeedStatus.Error, noSeed.s.status)
        assertEquals("feed.error.invalid", noSeed.s.errorCopyKey)
        assertEquals("게시물 정보를 불러오지 못했어요", Copy["feed.error.invalid"])

        val seeded = feedRig(FeedEntry.FromDisplay(PostFixtures.summary("202")))
        seeded.repo.details.always(POST_OTHER, bad)
        seeded.show()
        assertEquals(FeedStatus.Content, seeded.s.status)
        assertEquals("feed.error.invalid", seeded.toasts().single().copyKey)
    }

    @Test
    fun `TC-FEED-010 a failed refresh keeps the visible content and only toasts`() = runTest {
        val r = feedRig(FeedEntry.FromDisplay(PostFixtures.summary("202")))
        r.repo.details.enqueue(POST_OTHER, PostFixtures.failure("feed/posts-detail__500-server-error.json"))
        r.show()
        assertEquals(FeedStatus.Content, r.s.status)
        assertEquals("feed.error.load", r.toasts().single().copyKey)
        assertEquals("은행잎", r.s.content?.title)
        assertFalse(r.s.confirmed)

        val confirmed = feedRig(FeedEntry.FromDisplay(PostFixtures.summary("202")))
        confirmed.serve(other, POST_OTHER)
        confirmed.show()
        confirmed.repo.details.enqueue(POST_OTHER, PostFixtures.failure("feed/posts-detail__500-server-error.json"))
        confirmed.holder.onScreenShown(); confirmed.idle()
        assertEquals(FeedStatus.Content, confirmed.s.status)
        assertEquals("은행잎", confirmed.s.content?.title)
        assertEquals("feed.error.load", confirmed.toasts().single().copyKey)
    }

    @Test
    fun `TC-FEED-011 closing the screen while loading cancels silently and ignores the late answer`() = runTest {
        val r = feedRig(otherNoSeed)
        val gate = gated(PostFixtures.detailResult(other))
        r.repo.details.enqueue(POST_OTHER, gate)
        r.holder.onScreenShown(); runCurrent()
        val before = r.s
        r.holder.onCleared(); runCurrent()
        gate.release(); advanceUntilIdle()
        assertEquals(before, r.s)
        assertEquals(FeedStatus.Loading, r.s.status)
        assertTrue(r.toasts().isEmpty())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-FEED-012 offline with a seed shows the seed, toasts the network error and blocks like, edit and delete`() = runTest {
        val seed = PostFixtures.summary("201") // my own post of today
        assertTrue(seed.isMine)
        val r = feedRig(FeedEntry.FromDisplay(seed))
        r.repo.details.always(POST_MINE, PostFixtures.network())
        r.show()
        assertEquals(FeedStatus.Content, r.s.status)
        assertEquals(seed.title, r.s.content?.title)
        assertEquals("common.error.network", r.toasts().single().copyKey)
        assertFalse(r.s.likeEnabled)
        assertFalse(r.s.canEditTitle)
        assertFalse(r.s.canDelete)
        r.holder.onLikeClicked(); r.holder.onEditClicked(); r.holder.onDeleteClicked(); r.holder.onDeleteConfirmed(); r.idle()
        assertTrue(r.repo.likeCalls.isEmpty())
        assertNull(r.s.edit)
        assertFalse(r.s.deleteConfirmVisible)
        assertTrue(r.repo.deletes.calls.isEmpty())
    }

    @Test
    fun `TC-FEED-013 the date label, untitled text, alt text key and signature come from the detail`() = runTest {
        val old = TimeZone.getDefault()
        try {
            for (zone in listOf("UTC", "America/Los_Angeles", "Asia/Seoul")) {
                TimeZone.setDefault(TimeZone.getTimeZone(zone))
                val r = feedRig(mineNoSeed)
                r.serve(mineToday, POST_MINE)
                r.show()
                val c = assertNotNull(r.s.content)
                assertEquals("10월 27일의 주제", c.dateLabel, zone)
                assertEquals("비 오는 날", c.displayTitle)
                assertEquals("feed.photo-alt", c.photoAltCopyKey)
                assertEquals("https://cdn.example.test/signatures/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/original.png", c.signatureImageUrl)
            }
        } finally {
            TimeZone.setDefault(old)
        }
        val untitled = "22222222-2222-4222-8222-222222222204"
        val r = feedRig(FeedEntry.FromPush(untitled))
        r.serve("feed/posts-detail__no-title.json", untitled)
        r.show()
        assertEquals("무제", Copy["feed.title-none"])
        assertEquals("무제", r.s.content?.displayTitle)
        assertEquals("feed.photo-alt-none", r.s.content?.photoAltCopyKey)
        assertEquals("무제 작품 이미지", Copy["feed.photo-alt-none"])
    }

    @Test
    fun `TC-FEED-016 the edit button is for my posts of today only and a hidden button sends no request`() = runTest {
        val mine = feedRig(mineNoSeed)
        mine.serve(mineToday, POST_MINE)
        mine.show()
        assertTrue(mine.s.canEditTitle)
        assertTrue(mine.holder.canEditTitle())

        val others = feedRig(otherNoSeed)
        others.serve(other, POST_OTHER)
        others.show()
        assertFalse(others.s.canEditTitle)
        others.holder.onEditClicked(); others.idle()
        assertNull(others.s.edit)
        assertTrue(others.repo.sentTitles.isEmpty())

        val past = feedRig(FeedEntry.FromPush(POST_MINE_PAST))
        past.serve("feed/posts-detail__mine-past.json", POST_MINE_PAST)
        past.show()
        assertTrue(past.s.isMine)
        assertTrue(past.s.canDelete) // delete stays available for my posts
        assertFalse(past.s.canEditTitle)
        past.holder.onEditClicked(); past.holder.onSaveClicked(); past.idle()
        assertNull(past.s.edit)
        assertTrue(past.repo.sentTitles.isEmpty())
    }

    @Test
    fun `TC-FEED-017 the edit button follows KST midnight even while the screen stays open`() = runTest {
        val r = feedRig(mineNoSeed, now = "2026-10-27T14:59:59.999Z")
        r.serve(mineToday, POST_MINE)
        r.show()
        assertTrue(r.s.canEditTitle)
        assertTrue(r.holder.canEditTitle())
        r.clock.set("2026-10-27T15:00:00.000Z") // 00:00:00.000 KST on the 28th
        assertFalse(r.holder.canEditTitle())
        r.holder.onEditClicked(); r.idle()
        assertNull(r.s.edit)
        assertEquals(LocalDate.of(2026, 10, 27), r.s.content?.topicDate)
    }

    @Test
    fun `TC-FEED-057 after an account switch the old detail, removed ids and edit judgement are gone`() = runTest {
        val r = feedRig(mineNoSeed)
        r.serve(mineToday, POST_MINE)
        r.show()
        r.changes.markRemoved("22222222-2222-4222-8222-222222222299")
        assertTrue(r.s.canEditTitle)
        r.user.id = USER_B_ID
        r.holder.onUserChanged(); r.likes.reset(); r.idle()
        assertNull(r.s.content)
        assertFalse(r.s.canEditTitle)
        assertFalse(r.s.isMine)
        assertFalse(r.changes.isRemoved("22222222-2222-4222-8222-222222222299"))
        r.show() // user B opens the same detail: not their post
        assertFalse(r.s.isMine)
        assertFalse(r.s.canEditTitle)
        assertFalse(r.s.canDelete)
    }

    // ---- analytics (D-22, TC-ANL-007/017/018/021/022) ---------------------------------------------------------

    @Test
    fun `TC-ANL-007 the detail sends screen_view feed whatever the entry, once per visit`() = runTest {
        val entries = listOf(
            FeedEntry.FromDisplay(PostFixtures.summary("202")),
            FeedEntry.FromRecord(POST_MINE, null),
            FeedEntry.FromPush(POST_MINE),
        )
        for (entry in entries) {
            val r = feedRig(entry)
            r.repo.details.always(entry.postId, PostFixtures.detailResult(if (entry.postId == POST_OTHER) other else mineToday))
            r.show()
            r.holder.onScreenShown(); r.idle() // a re-draw, not a new visit
            assertEquals(listOf("feed"), r.analytics.screens.toList(), entry.toString())
        }
    }

    @Test
    fun `TC-ANL-017 coming back to the detail sends screen_view feed again`() = runTest {
        val r = feedRig(mineNoSeed)
        r.serve(mineToday, POST_MINE)
        r.show()
        r.holder.onScreenHidden()
        r.show()
        assertEquals(listOf("feed", "feed"), r.analytics.screens.toList())
    }

    @Test
    fun `TC-ANL-021 and TC-ANL-022 a failing tracker does not disturb the detail, guests send the same event`() = runTest {
        val failing = feedRig(mineNoSeed, analytics = RecordingAnalytics(failure = IllegalStateException("tracker down")))
        failing.serve(mineToday, POST_MINE)
        failing.show()
        assertEquals(FeedStatus.Content, failing.s.status)

        val guest = feedRig(otherNoSeed, userId = null)
        guest.serve(other, POST_OTHER)
        guest.show()
        assertEquals(listOf("feed"), guest.analytics.screens.toList())
    }
}
