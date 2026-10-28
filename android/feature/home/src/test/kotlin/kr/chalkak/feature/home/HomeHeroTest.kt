package kr.chalkak.feature.home

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.home.TodayPost
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.auth.HomeMode
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** Hero (D-06), topic header, guest gating and notification entry. */
class HomeHeroTest {
    private val approved = "home/posts-calendar__2026-10-week-approved.json"

    // ---- loading / states ---------------------------------------------------------------------------

    @Test
    fun `TC-HOME-001 hero stays Loading until posts today answers while the other sections load on their own`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.home.todayHandler = { gate.await(); ok(todayFx("posted-approved")) }
        r.holder.onShown(); runCurrent()

        assertEquals(HeroState.Loading, r.s.hero)
        assertIs<TopicHeader.Ready>(r.s.topic)
        assertIs<Section.Ready<*>>(r.s.popular)
        assertIs<Section.Ready<*>>(r.s.yesterday)
        assertIs<Section.Ready<*>>(r.s.week)
        assertIs<IssueState.Ready>(r.s.issue)

        gate.complete(Unit); runCurrent()
        assertIs<HeroState.Photo>(r.s.hero)
    }

    @Test
    fun `TC-HOME-002 today 404 is NoOpenTopic and not Error`() = runTest {
        val r = rig()
        r.home.todayHandler = { HomeFixtureModels.failure("home/posts-today__404-no-open-topic.json") }
        show(r)
        assertEquals(HeroState.NoOpenTopic, r.s.hero)
        assertEquals(1, r.home.todayCalls.size)
        assertEquals("지금은 참여할 수 있는 주제가 없어요", Copy["home.hero.no-open-topic"])
    }

    @Test
    fun `TC-HOME-002 tapping a NoOpenTopic hero neither opens upload nor shows a toast`() = runTest {
        val r = rig()
        r.home.todayHandler = { HomeFixtureModels.failure("home/posts-today__404-no-open-topic.json") }
        show(r)
        assertEquals(HeroState.NoOpenTopic, r.s.hero)
        r.holder.onHeroClicked(); advanceUntilIdle()
        assertTrue(r.nonToastEffects.isEmpty() && r.toasts.isEmpty())
    }

    @Test
    fun `TC-HOME-003 not posted is Empty, the topic title is available and tapping opens the upload gate`() = runTest {
        val r = rig()
        r.home.todayHandler = { ok(todayFx("not-posted")) }
        show(r)
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        assertEquals("가을 하늘", assertIs<TopicHeader.Ready>(r.s.topic).title)
        r.holder.onHeroClicked(); advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenUpload), r.nonToastEffects)
        assertEquals("\"{주제}\" 사진을 공유하지 않았어요", Copy["home.hero.empty"])
    }

    @Test
    fun `TC-HOME-004 VALIDATING is Processing even when the calendar has no such post`() = runTest {
        val r = rig()
        r.home.todayHandler = { ok(todayFx("posted-validating")) }
        r.home.calendarHandler = { ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-empty.json")) }
        show(r)
        assertEquals(HeroState.Processing, r.s.hero)
    }

    @Test
    fun `TC-HOME-005 PENDING shows the thumbnail of the same postId from the calendar with the pending badge`() = runTest {
        val r = rig()
        val calendar = HomeFixtureModels.calendar("home/posts-calendar__2026-10-week-pending.json")
        r.home.todayHandler = { ok(todayFx("posted-pending")) }
        r.home.calendarHandler = { ok(calendar) }
        show(r)
        val photo = assertIs<HeroState.Photo>(r.s.hero)
        assertEquals(ModerationStatus.PENDING, photo.status)
        assertTrue(photo.pendingBadge)
        assertEquals("22222222-2222-4222-8222-222222222201", photo.postId)
        assertEquals(calendar.first { it.postId == photo.postId }.thumbnailImageUrl, photo.thumbnailUrl)
    }

    @Test
    fun `TC-HOME-006 APPROVED is a photo without badge and tapping it opens the feed for that post`() = runTest {
        val r = rig()
        val calendar = HomeFixtureModels.calendar(approved)
        r.home.calendarHandler = { ok(calendar) }
        show(r)
        val photo = assertIs<HeroState.Photo>(r.s.hero)
        assertFalse(photo.pendingBadge)
        assertEquals(calendar.first { it.postId == photo.postId }.thumbnailImageUrl, photo.thumbnailUrl)
        r.holder.onHeroClicked(); advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenFeed(photo.postId)), r.nonToastEffects)
    }

    @Test
    fun `TC-HOME-007 a failing calendar keeps the hero state with a fallback thumbnail`() = runTest {
        val r = rig()
        r.home.calendarHandler = { HomeFixtureModels.failure("home/posts-calendar__500-server-error.json") }
        show(r)
        val photo = assertIs<HeroState.Photo>(r.s.hero)
        assertEquals(ModerationStatus.APPROVED, photo.status)
        assertEquals(null, photo.thumbnailUrl)
        assertIs<Section.Error>(r.s.week)
    }

    @Test
    fun `TC-HOME-007 a calendar without the same postId also keeps the hero state`() = runTest {
        val r = rig()
        r.home.calendarHandler = { ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-empty.json")) }
        show(r)
        val photo = assertIs<HeroState.Photo>(r.s.hero)
        assertEquals(null, photo.thumbnailUrl)
        assertIs<Section.Ready<*>>(r.s.week)
    }

    @Test
    fun `TC-HOME-008 banned member sees Empty, upload entry explains the ban and posts today is not asked again`() = runTest {
        val r = rig()
        r.home.todayHandler = { HomeFixtureModels.failure("home/posts-today__403-banned.json") }
        show(r)
        assertEquals(HeroState.Empty(banned = true), r.s.hero)
        r.holder.onHeroClicked(); advanceUntilIdle()
        assertEquals(listOf(HomeCopyKeys.HERO_BANNED), r.toasts)
        assertEquals("이용이 정지되어 게시물을 작성할 수 없어요.", Copy[r.toasts.single()])
        assertTrue(r.nonToastEffects.isEmpty())
        assertEquals(1, r.home.todayCalls.size)
    }

    @Test
    fun `TC-HOME-009 a 500 gives Error and retry asks once more and then shows the new state`() = runTest {
        val r = rig()
        var n = 0
        r.home.todayHandler = {
            if (++n == 1) HomeFixtureModels.failure("home/posts-today__500-server-error.json") else ok(todayFx("posted-approved"))
        }
        show(r)
        assertEquals(HeroState.Error(network = false), r.s.hero)
        assertEquals("사진 상태를 불러오지 못했어요", Copy["home.hero.error"])

        r.holder.onRetryHero(); advanceUntilIdle()
        assertEquals(2, r.home.todayCalls.size)
        assertIs<HeroState.Photo>(r.s.hero)
    }

    @Test
    fun `TC-HOME-010 a rejected photo comes back as not posted and the hero is Empty without an error`() = runTest {
        val r = rig()
        r.home.todayHandler = { ok(todayFx("not-posted-after-reject")) }
        show(r)
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        r.holder.onHeroClicked(); advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenUpload), r.nonToastEffects)
    }

    @Test
    fun `TC-HOME-011 an invalid today response (unknown moderationStatus) becomes the hero Error`() = runTest {
        val r = rig()
        r.home.todayHandler = { ApiResult.Failure(ApiError.InvalidResponse("unknown moderationStatus")) }
        show(r)
        assertEquals(HeroState.Error(network = false), r.s.hero)
        assertIs<Section.Ready<*>>(r.s.popular)
    }

    // ---- guest --------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-012 a guest asks only topics, ranking and banners and sees an empty hero and an empty week`() = runTest {
        val r = rig(HomeMode.Guest)
        show(r)
        assertTrue(r.home.todayCalls.isEmpty())
        assertTrue(r.home.calendarCalls.isEmpty())
        assertTrue(r.home.unreadCalls.isEmpty())
        assertEquals(setOf(T27, T26), r.home.topicCalls.toSet())
        assertEquals(listOf(1), r.banners.pageCalls.toList())
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        val week = assertIs<Section.Ready<List<WeekDay>>>(r.s.week).value
        assertEquals(7, week.size)
        assertTrue(week.all { it.entry == null })
        assertIs<Section.Ready<*>>(r.s.popular)
        assertIs<IssueState.Ready>(r.s.issue)
    }

    @Test
    fun `TC-HOME-013 a guest tapping the hero gets the login toast and no request is made`() = runTest {
        val r = rig(HomeMode.Guest)
        show(r)
        val before = r.home.totalCalls
        val bannerCalls = r.banners.pageCalls.size
        r.holder.onHeroClicked(); advanceUntilIdle()
        assertEquals(listOf(HomeCopyKeys.GUEST_UPLOAD), r.toasts)
        assertEquals("게시물을 추가하려면 로그인이 필요해요", Copy[HomeCopyKeys.GUEST_UPLOAD])
        assertTrue(r.nonToastEffects.isEmpty())
        assertEquals(before, r.home.totalCalls)
        assertEquals(bannerCalls, r.banners.pageCalls.size)
    }

    @Test
    fun `TC-HOME-022 a guest tapping a ranking photo gets the feed login toast and no navigation`() = runTest {
        val r = rig(HomeMode.Guest)
        show(r)
        val post = assertIs<Section.Ready<List<HomePost>>>(r.s.popular).value.first()
        r.holder.onRankingPostClicked(post); advanceUntilIdle()
        assertEquals(listOf(HomeCopyKeys.GUEST_FEED), r.toasts)
        assertEquals("게시물 피드를 보려면 로그인이 필요해요", Copy[HomeCopyKeys.GUEST_FEED])
        assertTrue(r.nonToastEffects.isEmpty())
    }

    // ---- topic header -------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-053 the date label is the KST date whatever the device zone is`() {
        for (zone in listOf("UTC", "America/Los_Angeles", "Asia/Seoul")) {
            withDevice(zoneId = zone) {
                runTest {
                    val r = rig()
                    show(r)
                    val expected = Copy[HomeCopyKeys.TOPIC_HEADER].replace("{M월 d일}", "10월 27일")
                    assertEquals("10월 27일 · 오늘의 주제", expected)
                    assertEquals(expected, assertIs<TopicHeader.Ready>(r.s.topic).dateLabel, zone)
                }
            }
        }
    }

    // ---- AI card gate -------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-054 the AI card shows only for an APPROVED photo of today`() = runTest {
        val r = rig()
        show(r)
        assertTrue(r.s.aiCardVisible)
    }

    @Test
    fun `TC-HOME-054 PENDING, VALIDATING, Empty and NoOpenTopic heroes have no AI card`() = runTest {
        val cases = mapOf<String, suspend () -> ApiResult<TodayPost>>(
            "pending" to { ok(todayFx("posted-pending")) },
            "validating" to { ok(todayFx("posted-validating")) },
            "empty" to { ok(todayFx("not-posted")) },
            "no-open-topic" to { HomeFixtureModels.failure("home/posts-today__404-no-open-topic.json") },
        )
        for ((name, handler) in cases) {
            val r = rig()
            r.home.todayHandler = handler
            show(r)
            assertFalse(r.s.hero == HeroState.Loading, "$name hero must have loaded")
            assertFalse(r.s.aiCardVisible, name)
        }
    }

    @Test
    fun `TC-HOME-054 a guest has no AI card and an APPROVED photo of a past topic has none either`() = runTest {
        val guest = rig(HomeMode.Guest)
        show(guest)
        assertFalse(guest.s.aiCardVisible)

        val past = rig()
        past.home.todayHandler = { ok(todayFx("posted-approved").copy(topicDate = LocalDate.of(2026, 10, 26))) }
        show(past)
        assertIs<HeroState.Photo>(past.s.hero)
        assertFalse(past.s.aiCardVisible)
    }

    // ---- notification entry and unread dot ---------------------------------------------------------

    @Test
    fun `TC-HOME-048 a member tapping the bell opens the notification inbox`() = runTest {
        val r = rig()
        show(r)
        r.holder.onNotificationClicked(); advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenNotifications), r.nonToastEffects)
    }

    @Test
    fun `TC-HOME-049 a guest tapping the bell gets the login toast and no unread request is ever made`() = runTest {
        val r = rig(HomeMode.Guest)
        show(r)
        r.holder.onNotificationClicked(); r.holder.onForeground(); r.holder.onPushReceived(); r.holder.onNotificationInboxClosed()
        advanceUntilIdle()
        assertEquals(listOf(HomeCopyKeys.GUEST_NOTIFICATION), r.toasts)
        assertEquals("로그인 후 알림을 확인할 수 있어요", Copy[HomeCopyKeys.GUEST_NOTIFICATION])
        assertTrue(r.nonToastEffects.isEmpty())
        assertTrue(r.home.unreadCalls.isEmpty())
    }

    @Test
    fun `TC-HOME-050 hasUnread true shows the dot and false hides it`() = runTest {
        val r = rig()
        r.home.unreadHandler = { ok(HomeFixtureModels.hasUnread("home/notifications-unread-status__true.json")) }
        show(r)
        assertTrue(r.s.hasUnread)
        r.home.unreadHandler = { ok(HomeFixtureModels.hasUnread("home/notifications-unread-status__false.json")) }
        r.holder.onPushReceived(); advanceUntilIdle()
        assertFalse(r.s.hasUnread)
    }

    @Test
    fun `TC-HOME-051 shown, foreground, inbox closed and push each re-check unread exactly once`() = runTest {
        val r = rig()
        r.home.unreadHandler = { ok(true) }
        show(r)
        assertEquals(1, r.home.unreadCalls.size)

        r.holder.onShown(); advanceUntilIdle()
        assertEquals(2, r.home.unreadCalls.size)
        r.holder.onForeground(); advanceUntilIdle()
        assertEquals(3, r.home.unreadCalls.size)
        r.holder.onNotificationInboxClosed(); advanceUntilIdle()
        assertEquals(4, r.home.unreadCalls.size)
        r.holder.onPushReceived(); advanceUntilIdle()
        assertEquals(5, r.home.unreadCalls.size)
    }

    @Test
    fun `TC-HOME-052 a failing unread check keeps the previous dot value and shows nothing`() = runTest {
        val r = rig()
        r.home.unreadHandler = { ok(true) }
        show(r)
        r.home.unreadHandler = { HomeFixtureModels.failure("home/notifications-unread-status__500-server-error.json") }
        r.holder.onPushReceived(); advanceUntilIdle()
        assertTrue(r.s.hasUnread)
        r.home.unreadHandler = { ApiResult.Failure(ApiError.Network(kr.chalkak.core.network.NetworkKind.OFFLINE)) }
        r.holder.onPushReceived(); advanceUntilIdle()
        assertTrue(r.s.hasUnread)
        assertTrue(r.toasts.isEmpty() && r.nonToastEffects.isEmpty())
    }
}
