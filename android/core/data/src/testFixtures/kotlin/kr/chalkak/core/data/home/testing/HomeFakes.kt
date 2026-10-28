package kr.chalkak.core.data.home.testing

import kr.chalkak.core.data.home.BannerPage
import kr.chalkak.core.data.home.BannerRepository
import kr.chalkak.core.data.home.CalendarEntry
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.HomeRepository
import kr.chalkak.core.data.home.HomeTopic
import kr.chalkak.core.data.home.TodayPost
import kr.chalkak.core.network.ApiResult
import java.time.LocalDate
import java.time.YearMonth
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Scriptable [HomeRepository]. Each endpoint has a replaceable handler (may suspend on a CompletableDeferred gate) and a
 * call log. Defaults answer like the Tuesday 2026-10-27 fixtures: topics 10-26/27/28 exist, popular-8 for 10-27,
 * popular-3 for 10-26, empty for any other date, today = posted-approved, calendar by month, unread = false.
 */
class FakeHomeRepository : HomeRepository {
    val topicCalls = CopyOnWriteArrayList<LocalDate>()
    val postsCalls = CopyOnWriteArrayList<LocalDate>()
    val todayCalls = CopyOnWriteArrayList<Unit>()
    val calendarCalls = CopyOnWriteArrayList<YearMonth>()
    val unreadCalls = CopyOnWriteArrayList<Unit>()

    var topicHandler: suspend (LocalDate) -> ApiResult<HomeTopic> = { date ->
        when (date) {
            LocalDate.of(2026, 10, 27) -> ApiResult.Success(HomeFixtureModels.topic("home/topics__open-2026-10-27.json"))
            LocalDate.of(2026, 10, 26) -> ApiResult.Success(HomeFixtureModels.topic("home/topics__open-2026-10-26.json"))
            LocalDate.of(2026, 10, 28) -> ApiResult.Success(HomeFixtureModels.topic("home/topics__open-2026-10-28.json"))
            else -> HomeFixtureModels.failure("home/topics__404-not-found.json")
        }
    }
    var postsHandler: suspend (LocalDate) -> ApiResult<List<HomePost>> = { date ->
        when (date) {
            LocalDate.of(2026, 10, 27) -> ApiResult.Success(HomeFixtureModels.posts("home/posts-list__popular-8.json"))
            LocalDate.of(2026, 10, 26) -> ApiResult.Success(HomeFixtureModels.posts("home/posts-list__popular-3.json"))
            else -> ApiResult.Success(HomeFixtureModels.posts("home/posts-list__popular-0.json"))
        }
    }
    var todayHandler: suspend () -> ApiResult<TodayPost> = {
        ApiResult.Success(HomeFixtureModels.today("home/posts-today__posted-approved.json"))
    }
    var calendarHandler: suspend (YearMonth) -> ApiResult<List<CalendarEntry>> = { month ->
        ApiResult.Success(HomeFixtureModels.calendarFor(month))
    }
    var unreadHandler: suspend () -> ApiResult<Boolean> = { ApiResult.Success(false) }

    override suspend fun topic(date: LocalDate): ApiResult<HomeTopic> { topicCalls += date; return topicHandler(date) }
    override suspend fun popularPosts(topicDate: LocalDate): ApiResult<List<HomePost>> { postsCalls += topicDate; return postsHandler(topicDate) }
    override suspend fun today(): ApiResult<TodayPost> { todayCalls += Unit; return todayHandler() }
    override suspend fun calendar(month: YearMonth): ApiResult<List<CalendarEntry>> { calendarCalls += month; return calendarHandler(month) }
    override suspend fun unreadStatus(): ApiResult<Boolean> { unreadCalls += Unit; return unreadHandler() }

    /** Total number of requests of any kind. */
    val totalCalls: Int get() = topicCalls.size + postsCalls.size + todayCalls.size + calendarCalls.size + unreadCalls.size
}

/** Scriptable [BannerRepository]; defaults: page 1 = banners__page1-10 (hasNext), page 2 = banners__page2-last. */
class FakeBannerRepository : BannerRepository {
    val pageCalls = CopyOnWriteArrayList<Int>()

    var handler: suspend (Int) -> ApiResult<BannerPage> = { page ->
        when (page) {
            1 -> ApiResult.Success(HomeFixtureModels.bannerPage("banner/banners__page1-10.json"))
            2 -> ApiResult.Success(HomeFixtureModels.bannerPage("banner/banners__page2-last.json"))
            else -> ApiResult.Success(HomeFixtureModels.bannerPage("banner/banners__empty.json"))
        }
    }

    override suspend fun banners(page: Int): ApiResult<BannerPage> { pageCalls += page; return handler(page) }
}
