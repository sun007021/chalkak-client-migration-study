package kr.chalkak.feature.home

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.data.home.ModerationStatus
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.core.network.ApiError
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.NetworkKind
import kr.chalkak.feature.auth.HomeMode
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** Parallel load, refresh / resume, cancellation, generations, KST midnight and account switch. */
class HomeLifecycleTest {
    private val offline = ApiResult.Failure(ApiError.Network(NetworkKind.OFFLINE))

    private fun TestScope.rigAt(iso: String) = rig(HomeMode.Member, FakeClock().apply { set(iso) })

    private fun Rig.heroPhotoStatus() = assertIs<HeroState.Photo>(s.hero).status

    // ---- parallel load ------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-034 every request group starts at once and a slow topic does not hold back the other sections`() = runTest {
        val r = rig()
        val slowTopic = CompletableDeferred<Unit>()
        val default = r.home.topicHandler
        r.home.topicHandler = { d -> if (d == T27) slowTopic.await(); default(d) }
        r.holder.onShown(); runCurrent()

        assertEquals(1, r.home.todayCalls.size)
        assertTrue(r.home.calendarCalls.isNotEmpty())
        assertEquals(1, r.home.unreadCalls.size)
        assertEquals(listOf(1), r.banners.pageCalls.toList())
        assertEquals(setOf(T27, T26), r.home.topicCalls.toSet())

        assertIs<HeroState.Photo>(r.s.hero)
        assertIs<Section.Ready<*>>(r.s.week)
        assertIs<Section.Ready<*>>(r.s.yesterday)
        assertIs<IssueState.Ready>(r.s.issue)
        assertEquals(TopicHeader.Loading, r.s.topic)
        assertEquals(Section.Loading, r.s.popular)

        slowTopic.complete(Unit); runCurrent()
        assertIs<TopicHeader.Ready>(r.s.topic)
        assertIs<Section.Ready<*>>(r.s.popular)
    }

    @Test
    fun `unexpected exceptions become a section error with a diagnostic and never kill the holder`() = runTest {
        val reported = mutableListOf<Pair<String, Throwable>>()
        val r = rig(diagnostics = HomeDiagnostics { where, e -> reported += where to e })
        val defaultToday = r.home.todayHandler
        r.home.todayHandler = { error("boom") }
        r.banners.handler = { throw IllegalStateException("banner boom") }
        show(r)

        assertEquals(HeroState.Error(), r.s.hero)
        assertEquals(IssueState.Error, r.s.issue)
        assertIs<Section.Ready<*>>(r.s.week)
        assertIs<Section.Ready<*>>(r.s.popular)
        assertEquals(2, reported.size)
        assertTrue(reported.any { it.second.message == "boom" })

        r.home.todayHandler = defaultToday
        r.holder.onRetryHero(); advanceUntilIdle()
        assertIs<HeroState.Photo>(r.s.hero)
    }

    // ---- refresh ------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-035 pull to refresh keeps the content, shows the indicator and replaces it on success`() = runTest {
        val r = rig()
        show(r)
        val gate = CompletableDeferred<Unit>()
        r.home.todayHandler = { gate.await(); ok(todayFx("posted-validating")) }
        r.holder.onPullToRefresh(); runCurrent()

        assertTrue(r.s.refreshing)
        assertEquals(ModerationStatus.APPROVED, r.heroPhotoStatus())

        gate.complete(Unit); runCurrent()
        assertFalse(r.s.refreshing)
        assertEquals(HeroState.Processing, r.s.hero)
        assertTrue(r.toasts.isEmpty())
    }

    @Test
    fun `TC-HOME-035 a failed refresh keeps the content and a server error shows a toast`() = runTest {
        val r = rig()
        show(r)
        r.home.todayHandler = { HomeFixtureModels.failure("home/posts-today__500-server-error.json") }
        r.holder.onPullToRefresh(); advanceUntilIdle()

        assertFalse(r.s.refreshing)
        assertEquals(ModerationStatus.APPROVED, r.heroPhotoStatus())
        assertEquals(1, r.toasts.size)
    }

    @Test
    fun `TC-HOME-035 a refresh that fails on the connection shows the network toast and keeps the content`() = runTest {
        val r = rig()
        show(r)
        r.home.todayHandler = { offline }
        r.holder.onPullToRefresh(); advanceUntilIdle()

        assertEquals(ModerationStatus.APPROVED, r.heroPhotoStatus())
        assertEquals(listOf(HomeCopyKeys.COMMON_NETWORK), r.toasts)
        assertEquals("네트워크 연결을 확인해 주세요.", kr.chalkak.core.common.testing.Copy[HomeCopyKeys.COMMON_NETWORK])
    }

    @Test
    fun `TC-HOME-036 repeated pulls while a refresh runs send the request set only once`() = runTest {
        val r = rig()
        show(r)
        val gate = CompletableDeferred<Unit>()
        val default = r.home.todayHandler
        r.home.todayHandler = { gate.await(); default() }
        repeat(3) { r.holder.onPullToRefresh() }
        runCurrent()
        assertEquals(2, r.home.todayCalls.size)
        assertEquals(2, r.banners.pageCalls.size)

        gate.complete(Unit); advanceUntilIdle()
        r.holder.onPullToRefresh(); advanceUntilIdle()
        assertEquals(3, r.home.todayCalls.size)
    }

    @Test
    fun `TC-HOME-037 a slow older refresh cannot overwrite the state of the newer reload`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        var n = 0
        r.home.todayHandler = {
            when (++n) {
                1 -> ok(todayFx("posted-approved"))
                2 -> { gate.await(); ok(todayFx("posted-validating")) } // A: pull to refresh, slow
                else -> ok(todayFx("not-posted")) // B: reload for the new KST day
            }
        }
        show(r)
        r.holder.onPullToRefresh(); runCurrent()
        r.clock.set("2026-10-27T15:00:00Z")
        r.holder.onShown(); runCurrent()
        assertEquals(HeroState.Empty(banned = false), r.s.hero)

        gate.complete(Unit); advanceUntilIdle()
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        assertEquals(T28, r.s.loadedDate)
        assertFalse(r.s.refreshing)
    }

    @Test
    fun `TC-HOME-038 leaving the screen mid refresh drops the result without toast or error and keeps the content`() = runTest {
        val r = rig()
        show(r)
        val gate = CompletableDeferred<Unit>()
        r.home.todayHandler = { gate.await(); HomeFixtureModels.failure("home/posts-today__500-server-error.json") }
        r.holder.onPullToRefresh(); runCurrent()
        r.holder.onScreenGone(); runCurrent()
        gate.complete(Unit); advanceUntilIdle()

        assertEquals(ModerationStatus.APPROVED, r.heroPhotoStatus())
        assertFalse(r.s.refreshing)
        assertTrue(r.toasts.isEmpty())
    }

    @Test
    fun `TC-HOME-038 leaving during the first load never turns the cancelled sections into errors`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.home.todayHandler = { gate.await(); ok(todayFx("posted-approved")) }
        r.holder.onShown(); runCurrent()
        r.holder.onScreenGone(); runCurrent()
        gate.complete(Unit); advanceUntilIdle()

        assertFalse(r.s.hero is HeroState.Error)
        assertFalse(r.s.week is Section.Error || r.s.popular is Section.Error || r.s.yesterday is Section.Error)
        assertTrue(r.toasts.isEmpty())

        r.holder.onShown(); advanceUntilIdle()
        assertIs<HeroState.Photo>(r.s.hero)
        assertIs<Section.Ready<*>>(r.s.popular)
    }

    @Test
    fun `TC-HOME-039 returning to the foreground refreshes silently and replaces the content on success`() = runTest {
        val r = rig()
        show(r)
        val mark = r.states.size
        r.home.todayHandler = { ok(todayFx("posted-validating")) }
        r.holder.onForeground(); advanceUntilIdle()

        assertEquals(HeroState.Processing, r.s.hero)
        assertTrue(r.states.drop(mark).none { it.refreshing })
    }

    @Test
    fun `TC-HOME-039 a failing silent refresh keeps the previous content`() = runTest {
        val r = rig()
        show(r)
        val mark = r.states.size
        r.home.todayHandler = { HomeFixtureModels.failure("home/posts-today__500-server-error.json") }
        r.home.calendarHandler = { offline }
        r.holder.onForeground(); advanceUntilIdle()

        assertEquals(ModerationStatus.APPROVED, r.heroPhotoStatus())
        assertIs<Section.Ready<*>>(r.s.week)
        assertTrue(r.states.drop(mark).none { it.refreshing || it.hero is HeroState.Error || it.hero == HeroState.Loading })
    }

    // ---- KST midnight / week boundary --------------------------------------------------------------

    @Test
    fun `TC-HOME-040 one second before KST midnight nothing is reloaded for a new day`() = runTest {
        val r = rig()
        show(r)
        val mark = r.states.size
        r.clock.set("2026-10-27T14:59:59Z")
        r.holder.onShown(); advanceUntilIdle()

        assertEquals(T27, r.s.loadedDate)
        assertTrue(T28 !in r.home.topicCalls)
        assertEquals(YearMonth.of(2026, 10), r.home.calendarCalls.last())
        assertTrue(r.states.drop(mark).none { it.hero == HeroState.Loading || it.topic == TopicHeader.Loading })
    }

    @Test
    fun `TC-HOME-041 after KST midnight everything is reloaded for 10-28 with yesterday 10-27`() = runTest {
        val r = rig()
        show(r)
        val mark = r.states.size
        r.clock.set("2026-10-27T15:00:00Z")
        r.holder.onShown(); advanceUntilIdle()

        assertEquals(T28, r.s.loadedDate)
        assertTrue(T28 in r.home.topicCalls)
        assertEquals(2, r.home.topicCalls.count { it == T27 })
        assertEquals(2, r.home.todayCalls.size)
        val header = assertIs<TopicHeader.Ready>(r.s.topic)
        assertEquals("10월 28일 · 오늘의 주제", header.dateLabel)
        assertEquals(HomeFixtureModels.topic("home/topics__open-2026-10-28.json").title, header.title)
        assertEquals(
            HomeFixtureModels.posts("home/posts-list__popular-8.json").take(5).map { it.id },
            assertIs<Section.Ready<List<kr.chalkak.core.data.home.HomePost>>>(r.s.yesterday).value.map { it.id },
        )
        // The new day starts from Loading: the 10-27 hero is not carried over while 10-28 is being fetched.
        assertTrue(r.states.drop(mark).any { it.hero == HeroState.Loading && it.topic == TopicHeader.Loading })
    }

    @Test
    fun `TC-HOME-042 right after midnight without a new topic the hero is NoOpenTopic, today empty and yesterday stays on 10-27`() = runTest {
        val r = rig()
        show(r)
        val defaultTopic = r.home.topicHandler
        r.home.topicHandler = { d -> if (d == T28) HomeFixtureModels.failure("home/topics__404-not-found.json") else defaultTopic(d) }
        r.home.todayHandler = { HomeFixtureModels.failure("home/posts-today__404-no-open-topic.json") }
        r.clock.set("2026-10-27T15:00:00Z")
        r.holder.onShown(); advanceUntilIdle()

        assertEquals(HeroState.NoOpenTopic, r.s.hero)
        assertEquals(TopicHeader.NotReady, r.s.topic)
        assertEquals(Section.Ready(emptyList<kr.chalkak.core.data.home.HomePost>()), r.s.popular)
        assertEquals(5, assertIs<Section.Ready<List<kr.chalkak.core.data.home.HomePost>>>(r.s.yesterday).value.size)
    }

    @Test
    fun `TC-HOME-043 crossing Saturday to Sunday midnight moves the week to 11-01 to 11-07 and the calendar to November`() = runTest {
        val r = rigAt("2026-10-31T14:59:59Z")
        show(r)
        assertEquals(java.time.LocalDate.of(2026, 10, 25), assertIs<Section.Ready<List<WeekDay>>>(r.s.week).value.first().date)

        r.clock.set("2026-10-31T15:00:00Z")
        r.holder.onShown(); advanceUntilIdle()
        val week = assertIs<Section.Ready<List<WeekDay>>>(r.s.week).value
        assertEquals(java.time.LocalDate.of(2026, 11, 1), week.first().date)
        assertEquals(java.time.LocalDate.of(2026, 11, 7), week.last().date)
        assertEquals(YearMonth.of(2026, 11), r.home.calendarCalls.last())
    }

    // ---- account switch and offline ----------------------------------------------------------------

    @Test
    fun `TC-HOME-044 after an account switch the previous account's data and its late response are gone`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        var n = 0
        r.home.todayHandler = {
            when (++n) {
                1 -> ok(todayFx("posted-approved")) // account A
                2 -> { gate.await(); ok(todayFx("posted-approved")) } // A's refresh, still in flight at the switch
                else -> ok(todayFx("not-posted")) // account B
            }
        }
        show(r)
        r.holder.onPullToRefresh(); runCurrent()

        r.holder.onAccountChanged(HomeMode.Member)
        assertEquals(HeroState.Loading, r.s.hero)
        assertEquals(Section.Loading, r.s.week)
        assertEquals(null, r.s.loadedDate)
        assertFalse(r.s.hasUnread)

        runCurrent()
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        gate.complete(Unit); advanceUntilIdle()
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        assertFalse(r.s.refreshing)
    }

    @Test
    fun `TC-HOME-044 switching to a guest drops the member sections`() = runTest {
        val r = rig()
        show(r)
        val todayCalls = r.home.todayCalls.size
        r.holder.onAccountChanged(HomeMode.Guest); advanceUntilIdle()
        assertEquals(HomeMode.Guest, r.s.mode)
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        assertEquals(todayCalls, r.home.todayCalls.size)
        assertTrue(assertIs<Section.Ready<List<WeekDay>>>(r.s.week).value.all { it.entry == null })
    }

    @Test
    fun `TC-HOME-045 offline on first entry every section shows the network error and retries load them all`() = runTest {
        val r = rig()
        val topic = r.home.topicHandler
        val posts = r.home.postsHandler
        val today = r.home.todayHandler
        val calendar = r.home.calendarHandler
        val banners = r.banners.handler
        r.home.topicHandler = { offline }
        r.home.postsHandler = { offline }
        r.home.todayHandler = { offline }
        r.home.calendarHandler = { offline }
        r.banners.handler = { offline }
        show(r)

        assertEquals(HeroState.Error(network = true), r.s.hero)
        assertEquals(Section.Error(network = true), r.s.week)
        assertEquals(Section.Error(network = true), r.s.popular)
        assertEquals(Section.Error(network = true), r.s.yesterday)
        assertEquals(IssueState.Error, r.s.issue)

        r.home.topicHandler = topic
        r.home.postsHandler = posts
        r.home.todayHandler = today
        r.home.calendarHandler = calendar
        r.banners.handler = banners
        r.holder.onRetryHero(); r.holder.onRetryWeek(); r.holder.onRetryIssue()
        r.holder.onRetryRanking(RankingKind.Today); r.holder.onRetryRanking(RankingKind.Yesterday)
        advanceUntilIdle()

        assertIs<HeroState.Photo>(r.s.hero)
        assertIs<Section.Ready<*>>(r.s.week)
        assertIs<Section.Ready<*>>(r.s.popular)
        assertIs<Section.Ready<*>>(r.s.yesterday)
        assertIs<IssueState.Ready>(r.s.issue)
    }

    // ---- coming back after delete / upload ---------------------------------------------------------

    @Test
    fun `TC-HOME-046 returning to home after deleting today's post shows Empty and drops it from the week and the ranking`() = runTest {
        val r = rig()
        show(r)
        assertIs<HeroState.Photo>(r.s.hero)
        r.home.todayHandler = { ok(todayFx("not-posted")) }
        r.home.calendarHandler = { ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-empty.json")) }
        r.home.postsHandler = { ok(HomeFixtureModels.posts("home/posts-list__popular-5.json")) }
        r.holder.onShown(); advanceUntilIdle()

        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        assertTrue(assertIs<Section.Ready<List<WeekDay>>>(r.s.week).value.all { it.entry == null })
        val deletedId = "22222222-2222-4222-8222-222222222201"
        assertTrue(assertIs<Section.Ready<List<kr.chalkak.core.data.home.HomePost>>>(r.s.popular).value.none { it.id == deletedId })
    }

    @Test
    fun `TC-HOME-047 returning to home right after an upload shows Processing from a fresh posts today`() = runTest {
        val r = rig()
        r.home.todayHandler = { ok(todayFx("not-posted")) }
        show(r)
        assertEquals(HeroState.Empty(banned = false), r.s.hero)
        r.home.todayHandler = { ok(todayFx("posted-validating")) }
        r.holder.onShown(); advanceUntilIdle()
        assertEquals(HeroState.Processing, r.s.hero)
        assertEquals(2, r.home.todayCalls.size)
    }
}
