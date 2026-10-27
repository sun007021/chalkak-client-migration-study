package kr.chalkak.feature.home

import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.feature.auth.HomeMode
import java.time.LocalDate
import java.time.YearMonth
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Ranking (yesterday / today popular) and "이번 주 기록". */
class HomeSectionsTest {
    private val top8 = HomeFixtureModels.posts("home/posts-list__popular-8.json")
    private val top3 = HomeFixtureModels.posts("home/posts-list__popular-3.json")

    private fun Rig.popular(): List<HomePost> = assertIs<Section.Ready<List<HomePost>>>(s.popular).value
    private fun Rig.yesterday(): List<HomePost> = assertIs<Section.Ready<List<HomePost>>>(s.yesterday).value
    private fun Rig.week(): List<WeekDay> = assertIs<Section.Ready<List<WeekDay>>>(s.week).value

    private fun TestScope.rigAt(iso: String, mode: HomeMode = HomeMode.Member) = rig(mode, FakeClock().apply { set(iso) })

    // ---- ranking ------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-015 today popular asks the KST date topic, then its topicDate, and shows the first 5 in server order`() = runTest {
        val r = rig()
        show(r)
        assertTrue(T27 in r.home.topicCalls)
        assertEquals(T27, r.home.postsCalls.first { it == T27 })
        assertEquals(top8.take(5).map { it.id }, r.popular().map { it.id })
    }

    @Test
    fun `TC-HOME-016 yesterday ranking uses the KST yesterday topic and shows up to 5 (3 here)`() = runTest {
        val r = rig()
        show(r)
        assertEquals(setOf(T27, T26), r.home.topicCalls.toSet())
        assertTrue(T26 in r.home.postsCalls)
        assertEquals(top3.map { it.id }, r.yesterday().map { it.id })
    }

    @Test
    fun `TC-HOME-017 yesterday without a topic only empties the yesterday section`() = runTest {
        val r = rig()
        val default = r.home.topicHandler
        r.home.topicHandler = { d -> if (d == T26) HomeFixtureModels.failure("home/topics__404-not-found.json") else default(d) }
        show(r)
        assertEquals(emptyList(), r.yesterday())
        assertEquals(5, r.popular().size)
        assertIs<HeroState.Photo>(r.s.hero)
        assertIs<Section.Ready<*>>(r.s.week)
        assertEquals("아직 올라온 사진이 없어요", Copy["home.ranking.empty"])
    }

    @Test
    fun `TC-HOME-018 no topic today is a ready empty state and not an error, distinct from a failure`() = runTest {
        val r = rig()
        val default = r.home.topicHandler
        r.home.topicHandler = { d -> if (d == T27) HomeFixtureModels.failure("home/topics__404-not-found.json") else default(d) }
        show(r)
        assertEquals(TopicHeader.NotReady, r.s.topic)
        assertEquals(emptyList(), r.popular())
        assertTrue(T27 !in r.home.postsCalls)
        assertEquals(3, r.yesterday().size)
        assertEquals("오늘의 주제가 아직 준비되지 않았어요", Copy["home.topic.not-ready"])
    }

    @Test
    fun `TC-HOME-018 a topic failure other than 404 is the Error header`() = runTest {
        val r = rig()
        val default = r.home.topicHandler
        r.home.topicHandler = { d -> if (d == T27) HomeFixtureModels.failure("home/posts-today__500-server-error.json") else default(d) }
        show(r)
        assertEquals(TopicHeader.Error, r.s.topic)
        assertEquals("오늘의 주제를 불러오지 못했어요", Copy["home.topic.error"])
        assertIs<Section.Error>(r.s.popular)
    }

    @Test
    fun `TC-HOME-019 zero, one and four popular photos are shown as they are`() = runTest {
        val r0 = rig()
        r0.home.postsHandler = { ok(HomeFixtureModels.posts("home/posts-list__popular-0.json")) }
        show(r0)
        assertEquals(0, r0.popular().size)

        val r1 = rig()
        r1.home.postsHandler = { ok(HomeFixtureModels.posts("home/posts-list__popular-1.json")) }
        show(r1)
        assertEquals(1, r1.popular().size)

        val r4 = rig()
        r4.home.postsHandler = { ok(top8.take(4)) }
        show(r4)
        assertEquals(4, r4.popular().size)
    }

    @Test
    fun `TC-HOME-020 a failing ranking request errors only that section`() = runTest {
        val r = rig()
        val default = r.home.postsHandler
        r.home.postsHandler = { d -> if (d == T27) HomeFixtureModels.failure("home/posts-list__500-server-error.json") else default(d) }
        show(r)
        assertEquals(Section.Error(network = false), r.s.popular)
        assertEquals("{섹션 제목} 사진을 불러오지 못했어요", Copy["home.ranking.error"])
        assertEquals(3, r.yesterday().size)
        assertIs<HeroState.Photo>(r.s.hero)
        assertIs<Section.Ready<*>>(r.s.week)
        assertIs<IssueState.Ready>(r.s.issue)
    }

    @Test
    fun `TC-HOME-021 tapping a ranking photo opens the feed seeded with that list item`() = runTest {
        val r = rig()
        show(r)
        val post = r.popular()[2]
        r.holder.onRankingPostClicked(post); advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenFeed(post.id, seed = post)), r.nonToastEffects)
    }

    @Test
    fun `TC-HOME-023 the more link opens the display tab on that section's date`() = runTest {
        val r = rig()
        show(r)
        r.holder.onRankingMoreClicked(RankingKind.Today)
        r.holder.onRankingMoreClicked(RankingKind.Yesterday)
        advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenDisplay(T27), HomeEffect.OpenDisplay(T26)), r.nonToastEffects)
    }

    // ---- week ---------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-024 on Tuesday 10-27 the week is Sunday 10-25 through Saturday 10-31 with 일월화수목금토 headers`() = runTest {
        val r = rig()
        show(r)
        assertEquals((25..31).map { LocalDate.of(2026, 10, it) }, r.week().map { it.date })
        assertEquals(listOf("일", "월", "화", "수", "목", "금", "토"), r.week().map { it.weekdayLabel })
    }

    @Test
    fun `TC-HOME-025 on Sunday the week starts today and on Saturday it started six days ago`() = runTest {
        val sunday = rigAt("2026-11-01T03:00:00Z")
        show(sunday)
        assertEquals(LocalDate.of(2026, 11, 1), sunday.week().first().date)
        assertEquals(LocalDate.of(2026, 11, 7), sunday.week().last().date)

        val saturday = rigAt("2026-10-31T03:00:00Z")
        show(saturday)
        assertEquals(LocalDate.of(2026, 10, 25), saturday.week().first().date)
        assertEquals(LocalDate.of(2026, 10, 31), saturday.week().last().date)
    }

    @Test
    fun `TC-HOME-026 a week over a month boundary requests both months and merges them`() = runTest {
        val r = rigAt("2026-09-30T03:00:00Z")
        show(r)
        assertEquals(LocalDate.of(2026, 9, 27), r.week().first().date)
        assertEquals(LocalDate.of(2026, 10, 3), r.week().last().date)
        assertEquals(setOf(YearMonth.of(2026, 9), YearMonth.of(2026, 10)), r.home.calendarCalls.toSet())
        val withEntry = r.week().filter { it.entry != null }.map { it.date }
        assertEquals(listOf(LocalDate.of(2026, 9, 29), LocalDate.of(2026, 9, 30)), withEntry)
    }

    @Test
    fun `TC-HOME-027 a year-end week 12-27 to 1-02 requests December and January in the right cell order`() = runTest {
        val r = rigAt("2026-12-31T03:00:00Z")
        show(r)
        val dates = r.week().map { it.date }
        assertEquals(LocalDate.of(2026, 12, 27), dates.first())
        assertEquals(LocalDate.of(2027, 1, 2), dates.last())
        assertEquals(7, dates.size)
        assertEquals(dates.sorted(), dates)
        assertEquals(setOf(YearMonth.of(2026, 12), YearMonth.of(2027, 1)), r.home.calendarCalls.toSet())
        for (entry in HomeFixtureModels.calendar("home/posts-calendar__2026-12-week.json")) {
            assertEquals(entry, r.week().first { it.date == entry.topicDate }.entry)
        }
    }

    @Test
    fun `TC-HOME-028 in a leap year the week of 2028-02-29 is 2-27 to 3-04 and both months are requested`() = runTest {
        val r = rigAt("2028-02-29T03:00:00Z")
        show(r)
        assertEquals(listOf(27, 28, 29), r.week().take(3).map { it.date.dayOfMonth })
        assertEquals(LocalDate.of(2028, 3, 4), r.week().last().date)
        assertEquals(setOf(YearMonth.of(2028, 2), YearMonth.of(2028, 3)), r.home.calendarCalls.toSet())
    }

    @Test
    fun `TC-HOME-029 at KST midnight 2026-10-26T15-00Z today is Tuesday 10-27 on a UTC and a Los Angeles device`() {
        for (zone in listOf("UTC", "America/Los_Angeles")) {
            withDevice(zoneId = zone) {
                runTest {
                    val r = rigAt("2026-10-26T15:00:00Z")
                    show(r)
                    assertEquals(T27, r.s.loadedDate, zone)
                    assertTrue(T27 in r.home.topicCalls, zone)
                    assertEquals(T27, r.week().first { it.weekdayLabel == "화" }.date, zone)
                    assertEquals("10월 27일 · 오늘의 주제", assertIs<TopicHeader.Ready>(r.s.topic).dateLabel, zone)
                }
            }
        }
    }

    @Test
    fun `TC-HOME-030 cells show a record only for PENDING or APPROVED days and the rest stay empty`() = runTest {
        val r = rig()
        r.home.calendarHandler = { ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-week-pending.json")) }
        show(r)
        val byDate = r.week().associateBy { it.date }
        assertEquals(kr.chalkak.core.data.home.ModerationStatus.PENDING, byDate.getValue(T27).entry?.status)
        assertEquals(kr.chalkak.core.data.home.ModerationStatus.APPROVED, byDate.getValue(T26).entry?.status)
        assertNull(byDate.getValue(LocalDate.of(2026, 10, 29)).entry)
    }

    @Test
    fun `TC-HOME-030 days before the first topic date are requested and shown as empty cells`() = runTest {
        val r = rigAt("2026-09-18T03:00:00Z")
        show(r)
        assertEquals(LocalDate.of(2026, 9, 13), r.week().first().date)
        assertTrue(r.week().all { it.entry == null })
        assertEquals(setOf(YearMonth.of(2026, 9)), r.home.calendarCalls.toSet())
    }

    @Test
    fun `TC-HOME-031 tapping a cell with a record opens the record tab on that date, an empty cell does nothing`() = runTest {
        val r = rigAt("2026-09-30T03:00:00Z")
        show(r)
        r.holder.onWeekDayClicked(LocalDate.of(2026, 9, 29))
        r.holder.onWeekDayClicked(LocalDate.of(2026, 10, 1))
        advanceUntilIdle()
        assertEquals(listOf<HomeEffect>(HomeEffect.OpenRecord(LocalDate.of(2026, 9, 29))), r.nonToastEffects)
    }

    @Test
    fun `TC-HOME-032 a failing calendar errors only the week section and a retry reloads just that section`() = runTest {
        val r = rig()
        var n = 0
        val default = r.home.calendarHandler
        r.home.calendarHandler = { m -> if (++n == 1) HomeFixtureModels.failure("home/posts-calendar__500-server-error.json") else default(m) }
        show(r)
        assertEquals(Section.Error(network = false), r.s.week)
        assertEquals("기록을 불러오지 못했어요", Copy["home.weekly.error"])
        assertIs<Section.Ready<*>>(r.s.popular)
        val topicCalls = r.home.topicCalls.size

        r.holder.onRetryWeek(); advanceUntilIdle()
        assertIs<Section.Ready<*>>(r.s.week)
        assertEquals(topicCalls, r.home.topicCalls.size)
        assertEquals(1, r.home.todayCalls.size)
    }

    @Test
    fun `TC-HOME-033 when one of two months fails the section is an error and the retry asks both months again`() = runTest {
        val r = rigAt("2026-09-30T03:00:00Z")
        var failOctober = true
        val default = r.home.calendarHandler
        r.home.calendarHandler = { m ->
            if (m == YearMonth.of(2026, 10) && failOctober) HomeFixtureModels.failure("home/posts-calendar__500-server-error.json") else default(m)
        }
        show(r)
        assertEquals(Section.Error(network = false), r.s.week)

        failOctober = false
        r.holder.onRetryWeek(); advanceUntilIdle()
        assertEquals(2, r.home.calendarCalls.count { it == YearMonth.of(2026, 9) })
        assertEquals(2, r.home.calendarCalls.count { it == YearMonth.of(2026, 10) })
        assertEquals(2, r.week().count { it.entry != null })
    }
}
