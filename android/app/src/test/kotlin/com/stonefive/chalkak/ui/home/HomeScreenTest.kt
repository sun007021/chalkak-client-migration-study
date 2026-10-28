package com.stonefive.chalkak.ui.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import com.stonefive.chalkak.testing.DAY_27
import com.stonefive.chalkak.testing.HomeFakes
import com.stonefive.chalkak.testing.RecordingImage
import com.stonefive.chalkak.testing.TestApp
import com.stonefive.chalkak.testing.assertShowsAll
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.loadedHomeState
import com.stonefive.chalkak.testing.postId
import com.stonefive.chalkak.testing.todayFailure
import com.stonefive.chalkak.testing.todayFixture
import kotlinx.coroutines.CompletableDeferred
import kr.chalkak.core.common.WeekCalendar
import kr.chalkak.core.data.home.HomePost
import kr.chalkak.core.data.home.httpsUrlOrNull
import kr.chalkak.core.data.home.testing.HomeFixtureModels
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.home.HeroState
import kr.chalkak.feature.home.HomeUiState
import kr.chalkak.feature.home.IssueState
import kr.chalkak.feature.home.RankingKind
import kr.chalkak.feature.home.Section
import kr.chalkak.feature.home.TopicHeader
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Stateless [HomeScreen]: states produced by the real `HomeStateHolder` over the shared fixtures (see `loadedHomeState`) are
 * rendered and the callbacks are observed. The tall display keeps every section composed, so presence/absence is about state,
 * not about scrolling.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h6000dp")
class HomeScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val copy = loadCopy()
    private val image = RecordingImage()
    private val calls = mutableListOf<String>()
    private val tappedPosts = mutableListOf<HomePost>()

    private fun callbacks() = HomeCallbacks(
        onNotificationClick = { calls += "bell" },
        onHeroClick = { calls += "hero" },
        onHeroRetry = { calls += "hero-retry" },
        onWeekDayClick = { calls += "day:$it" },
        onWeekMoreClick = { calls += "week-more" },
        onWeekRetry = { calls += "week-retry" },
        onRankingPostClick = { tappedPosts += it },
        onRankingMoreClick = { calls += "more:$it" },
        onRankingRetry = { calls += "ranking-retry:$it" },
        onLikeClick = { calls += "like:${it.id}" },
        onBannerClick = { calls += "banner:${it.id}" },
        onIssueRetry = { calls += "issue-retry" },
        onRefresh = { calls += "refresh" },
    )

    private fun show(state: HomeUiState) = rule.setContent {
        TestApp(copy) { HomeScreen(state = state, callbacks = callbacks(), image = image.slot) }
    }

    private fun tag(tag: String) = rule.onNodeWithTag(tag)

    private fun assertAbsent(vararg tags: String) = tags.forEach { rule.onNodeWithTag(it).assertDoesNotExist() }

    private fun heroTags() = listOf(
        "home.hero-loading", "home.hero-no-open-topic", "home.hero-empty", "home.hero-upload-button", "home.hero-processing",
        "home.hero-photo", "home.hero-pending-badge", "home.hero-error", "home.hero-retry-button",
    )

    private fun assertOnlyHero(vararg present: String) = heroTags().forEach { t ->
        if (t in present) tag(t).assertIsDisplayed() else tag(t).assertDoesNotExist()
    }

    private val topicTitle = HomeFixtureModels.topic("home/topics__open-2026-10-27.json").title

    // ---- hero ---------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-001 응답 전 히어로는 불러오는 중 문구이고 다른 섹션은 히어로를 기다리지 않고 그려진다`() {
        val state = loadedHomeState { home.todayHandler = { CompletableDeferred<Unit>().await(); error("never") } }
        assertIs<HeroState.Loading>(state.hero)
        show(state)
        assertOnlyHero("home.hero-loading")
        tag("home.hero-loading").assertTextEquals(copy["home.topic.loading"])
        tag("home.week-section").assertIsDisplayed()
        tag("home.ranking-section").assertIsDisplayed()
        tag("home.popular-section").assertIsDisplayed()
        tag("home.issue-section").assertIsDisplayed()
    }

    @Test
    fun `TC-HOME-002 참여할 주제가 없으면 안내 문구만 보이고 다시 시도와 업로드 버튼은 없다`() {
        val state = loadedHomeState { todayFailure("404-no-open-topic") }
        show(state)
        assertOnlyHero("home.hero-no-open-topic")
        tag("home.hero-no-open-topic").assertTextEquals(copy["home.hero.no-open-topic"])
    }

    private fun assertEmptyHero(state: HomeUiState) {
        show(state)
        assertOnlyHero("home.hero-empty", "home.hero-upload-button")
        val title = (state.topic as TopicHeader.Ready).title
        tag("home.hero-empty").assertShowsAll(copy.format("home.hero.empty", "주제" to title))
        tag("home.hero-upload-button").performClick()
        assertEquals(listOf("hero"), calls)
    }

    @Test
    fun `TC-HOME-003 오늘 사진을 올리지 않았으면 주제가 들어간 문구와 업로드 진입 버튼이 보인다`() {
        val state = loadedHomeState { todayFixture("not-posted") }
        assertEquals(HeroState.Empty(), state.hero)
        assertEmptyHero(state)
    }

    @Test
    fun `TC-HOME-004 검수 전 업로드 직후에는 처리 중 문구이고 주간 기록에 사진이 없어도 유지된다`() {
        val state = loadedHomeState {
            todayFixture("posted-validating")
            home.calendarHandler = { HomeFixtureModels.ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-empty.json")) }
        }
        show(state)
        assertOnlyHero("home.hero-processing")
        tag("home.hero-processing").assertTextEquals(copy["home.hero.processing"])
    }

    @Test
    fun `TC-HOME-005 검수 대기 히어로는 주간 기록의 같은 게시물 썸네일에 검수 대기 배지를 붙인다`() {
        val state = loadedHomeState {
            todayFixture("posted-pending")
            home.calendarHandler = { HomeFixtureModels.ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-week-pending.json")) }
        }
        val photo = assertIs<HeroState.Photo>(state.hero)
        show(state)
        assertOnlyHero("home.hero-photo", "home.hero-pending-badge")
        tag("home.hero-pending-badge").assertTextEquals(copy["home.hero.pending-badge"])
        assertTrue(photo.thumbnailUrl in image.urls, "hero image comes from the calendar entry: ${photo.thumbnailUrl} in ${image.urls}")
    }

    @Test
    fun `TC-HOME-006 승인된 히어로는 배지 없는 사진이고 누르면 히어로 탭 콜백이 불린다`() {
        val state = loadedHomeState { todayFixture("posted-approved") }
        show(state)
        assertOnlyHero("home.hero-photo")
        tag("home.hero-photo").performClick()
        assertEquals(listOf("hero"), calls)
    }

    @Test
    fun `TC-HOME-007 주간 기록이 실패해도 히어로는 오류가 되지 않고 대체 이미지로 사진 자리만 그린다`() {
        val state = loadedHomeState {
            todayFixture("posted-approved")
            home.calendarHandler = { HomeFixtureModels.failure("home/posts-calendar__500-server-error.json") }
        }
        assertIs<Section.Error>(state.week)
        show(state)
        assertOnlyHero("home.hero-photo")
        tag("home.week-error").assertTextEquals(copy["home.weekly.error"])
        assertTrue(null in image.urls, "no thumbnail url -> the image slot is asked for the fallback")
    }

    @Test
    fun `TC-HOME-008 정지 회원의 히어로는 Empty와 같은 모양이고 눌림은 홀더로 전달된다`() {
        val state = loadedHomeState { todayFailure("403-banned") }
        assertEquals(HeroState.Empty(banned = true), state.hero)
        assertEmptyHero(state)
    }

    @Test
    fun `TC-HOME-009 서버 오류 히어로는 오류 문구와 다시 시도를 보이고 다시 시도는 콜백을 한 번 부른다`() {
        val state = loadedHomeState { todayFailure("500-server-error") }
        show(state)
        assertOnlyHero("home.hero-error", "home.hero-retry-button")
        tag("home.hero-error").assertTextEquals(copy["home.hero.error"])
        tag("home.hero-retry-button").assertTextEquals(copy["home.hero.retry"])
        tag("home.hero-retry-button").performClick()
        assertEquals(listOf("hero-retry"), calls)
    }

    @Test
    fun `TC-HOME-010 반려되어 isPosted가 false로 돌아오면 Empty이고 오류 문구가 뜨지 않는다`() {
        val state = loadedHomeState { todayFixture("not-posted-after-reject") }
        assertEmptyHero(state)
        assertAbsent("home.hero-error", "home.hero-retry-button")
    }

    // ---- topic header ---------------------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-053 주제 머리글은 KST 날짜 라벨과 주제 제목을 보인다`() {
        val state = loadedHomeState()
        show(state)
        val expectedLabel = copy["home.topic.header"].replace("{M월 d일}", "${DAY_27.monthValue}월 ${DAY_27.dayOfMonth}일")
        tag("home.topic-date").assertTextEquals(expectedLabel)
        tag("home.topic-title").assertTextEquals(topicTitle)
    }

    @Test
    fun `TC-HOME-018 오늘 주제가 404이면 준비 안 됨 문구와 오늘 인기 빈 상태이고 오류 문구와 구분된다`() {
        val previous = HomeFakes().home.topicHandler
        val state = loadedHomeState {
            home.topicHandler = { date ->
                if (date == DAY_27) HomeFixtureModels.failure("home/topics__404-not-found.json") else previous(date)
            }
        }
        assertIs<TopicHeader.NotReady>(state.topic)
        show(state)
        tag("home.topic-title").assertTextEquals(copy["home.topic.not-ready"])
        tag("home.popular-empty").assertTextEquals(copy["home.ranking.empty"])
        assertAbsent("home.popular-error", "home.popular-retry-button")
    }

    @Test
    fun `TC-HOME-018 주제 조회가 실패하면 오류 문구이고 준비 안 됨 문구가 아니다`() {
        val state = loadedHomeState { home.topicHandler = { HomeFixtureModels.failure("home/posts-today__500-server-error.json") } }
        assertIs<TopicHeader.Error>(state.topic)
        show(state)
        tag("home.topic-title").assertTextEquals(copy["home.topic.error"])
    }

    // ---- popular / ranking ------------------------------------------------------------------------------------------------

    private fun popularFixture(name: String) = HomeFixtureModels.posts("home/posts-list__$name.json")

    @Test
    fun `TC-HOME-019 오늘 인기 사진이 0개이면 빈 상태 문구만 보인다`() {
        val state = loadedHomeState { home.postsHandler = { HomeFixtureModels.ok(popularFixture("popular-0")) } }
        show(state)
        tag("home.popular-section").assertShowsAll(copy["home.ranking.today-title"])
        tag("home.popular-empty").assertTextEquals(copy["home.ranking.empty"])
    }

    @Test
    fun `TC-HOME-019 오늘 인기 사진이 1개이면 한 장만 그려지고 빈 상태는 없다`() {
        val posts = popularFixture("popular-1")
        val state = loadedHomeState { home.postsHandler = { HomeFixtureModels.ok(posts) } }
        show(state)
        tag("home.popular-item-${posts.single().id}").assertIsDisplayed()
        assertAbsent("home.popular-empty", "home.popular-error")
    }

    @Test
    fun `TC-HOME-019 오늘 인기 사진이 3개이면 있는 만큼만 그려진다`() {
        val posts = popularFixture("popular-3")
        val state = loadedHomeState { home.postsHandler = { HomeFixtureModels.ok(posts) } }
        show(state)
        posts.forEach { tag("home.popular-item-${it.id}").assertIsDisplayed() }
        assertAbsent("home.popular-empty")
    }

    @Test
    fun `TC-HOME-019 오늘 인기 사진은 최대 5장이다`() {
        val state = loadedHomeState()
        show(state)
        listOf("202", "203", "204", "205", "206").forEach { tag("home.popular-item-${postId(it)}").assertIsDisplayed() }
        assertAbsent("home.popular-item-${postId("207")}", "home.popular-item-${postId("208")}")
    }

    @Test
    fun `TC-HOME-021 랭킹 사진을 누르면 목록의 게시물 값이 그대로 전달되어 상세가 시드로 쓸 수 있다`() {
        val state = loadedHomeState()
        show(state)
        tag("home.ranking-item-${postId("261")}").performClick()
        tag("home.popular-item-${postId("203")}").performClick()
        val ranked = (state.yesterday as Section.Ready).value.first { it.id == postId("261") }
        val popular = (state.popular as Section.Ready).value.first { it.id == postId("203") }
        assertEquals(listOf(ranked, popular), tappedPosts)
        assertTrue(tappedPosts[1].isLiked && tappedPosts[1].likeCount == 37, "image and like values travel with the tap")
    }

    @Test
    fun `TC-HOME-021 더보기 링크는 어제 랭킹과 오늘 인기를 구분해 알린다`() {
        show(loadedHomeState())
        tag("home.ranking-more-link").performClick()
        tag("home.popular-more-link").performClick()
        assertEquals(listOf("more:${RankingKind.Yesterday}", "more:${RankingKind.Today}"), calls)
    }

    @Test
    fun `TC-HOME-021 좋아요 버튼은 selected와 개수를 별도 요소로 노출하고 누르면 해당 게시물을 알린다`() {
        show(loadedHomeState())
        tag("home.popular-like-button-${postId("203")}").assertIsSelected()
        tag("home.popular-like-button-${postId("202")}").assertIsNotSelected()
        tag("home.popular-like-count-${postId("202")}").assertTextEquals("38")
        tag("home.popular-like-count-${postId("203")}").assertTextEquals("37")
        tag("home.popular-like-button-${postId("202")}").performClick()
        assertEquals(listOf("like:${postId("202")}"), calls)
    }

    // ---- week ----------------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-024 이번 주는 일요일 25일부터 토요일 31일까지 7칸이고 칸마다 요일 헤더를 보인다`() {
        show(loadedHomeState())
        val days = (0..6).map { LocalDate.of(2026, 10, 25).plusDays(it.toLong()) }
        days.forEachIndexed { i, date ->
            tag("home.week-day-$date").assertShowsAll(WeekCalendar.weekdayHeaders[i], date.dayOfMonth.toString())
        }
        assertAbsent("home.week-day-2026-10-24", "home.week-day-2026-11-01")
        tag("home.week-section").assertShowsAll(copy["home.weekly.title"], copy["home.weekly.more"])
    }

    @Test
    fun `TC-HOME-030 기록이 있는 날만 사진이 있고 N 슬래시 7은 기록이 있는 날 수다`() {
        val state = loadedHomeState()
        val withEntry = (state.week as Section.Ready).value.filter { it.entry != null }.map { it.date }
        show(state)
        (0..6).map { LocalDate.of(2026, 10, 25).plusDays(it.toLong()) }.forEach { date ->
            if (date in withEntry) tag("home.week-photo-$date").assertIsDisplayed() else tag("home.week-photo-$date").assertDoesNotExist()
        }
        tag("home.week-count").assertTextEquals("${withEntry.size}/7")
    }

    @Test
    fun `TC-HOME-030 검수 대기 칸에는 대기 라벨이 붙고 기록이 있는 칸만 눌림이 전달된다`() {
        val state = loadedHomeState {
            home.calendarHandler = { HomeFixtureModels.ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-week-pending.json")) }
        }
        show(state)
        tag("home.week-day-2026-10-27").assertShowsAll(copy["home.weekly.pending"])
        tag("home.week-day-2026-10-26").performClick()
        tag("home.week-day-2026-10-27").performClick()
        assertEquals(listOf("day:2026-10-26", "day:2026-10-27"), calls)
    }

    @Test
    fun `TC-HOME-030 주간 기록이 비면 사진이 없고 0 슬래시 7이다`() {
        val state = loadedHomeState {
            home.calendarHandler = { HomeFixtureModels.ok(HomeFixtureModels.calendar("home/posts-calendar__2026-10-empty.json")) }
        }
        show(state)
        tag("home.week-count").assertTextEquals("0/7")
        (0..6).forEach { tag("home.week-photo-${LocalDate.of(2026, 10, 25).plusDays(it.toLong())}").assertDoesNotExist() }
    }

    // ---- refresh / bell / ai card ----------------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-035 새로고침 중에는 기존 콘텐츠를 유지한 채 인디케이터를 보이고 끝나면 사라진다`() {
        val state = loadedHomeState()
        show(state.copy(refreshing = true))
        tag("home.refresh-indicator").assertIsDisplayed()
        tag("home.hero-photo").assertIsDisplayed()
        tag("home.week-section").assertIsDisplayed()
        tag("home.popular-section").assertIsDisplayed()
    }

    @Test
    fun `TC-HOME-035 새로고침 중이 아니면 인디케이터가 트리에 없다`() {
        show(loadedHomeState())
        tag("home.hero-photo").assertIsDisplayed()
        assertAbsent("home.refresh-indicator")
    }

    @Test
    fun `TC-HOME-035 아래로 당기면 새로고침 콜백이 한 번 불린다`() {
        show(loadedHomeState())
        tag("home.scroll").performTouchInput { swipeDown() }
        rule.waitForIdle()
        assertEquals(listOf("refresh"), calls)
    }

    @Test
    fun `TC-HOME-048 알림 버튼을 누르면 알림 콜백이 불린다`() {
        show(loadedHomeState())
        tag("home.notification-button").performClick()
        assertEquals(listOf("bell"), calls)
    }

    @Test
    fun `TC-HOME-050 미읽음이 있으면 점이 존재하고 없으면 트리에 존재하지 않는다`() {
        val unread = loadedHomeState { home.unreadHandler = { HomeFixtureModels.ok(HomeFixtureModels.hasUnread("home/notifications-unread-status__true.json")) } }
        assertTrue(unread.hasUnread)
        show(unread)
        tag("home.notification-unread-dot").assertIsDisplayed()
    }

    @Test
    fun `TC-HOME-050 미읽음이 없으면 점이 존재하지 않는다`() {
        val read = loadedHomeState { home.unreadHandler = { HomeFixtureModels.ok(HomeFixtureModels.hasUnread("home/notifications-unread-status__false.json")) } }
        show(read)
        tag("home.notification-button").assertIsDisplayed()
        assertAbsent("home.notification-unread-dot")
    }

    @Test
    fun `TC-HOME-054 오늘 승인된 내 사진이면 AI 카드가 있다`() {
        val state = loadedHomeState { todayFixture("posted-approved") }
        assertTrue(state.aiCardVisible)
        show(state)
        tag("home.ai-card").assertIsDisplayed()
    }

    @Test
    fun `TC-HOME-054 검수 대기 처리 중 Empty NoOpenTopic 게스트에서는 AI 카드가 없다`() {
        val states = listOf(
            loadedHomeState { todayFixture("posted-pending") },
            loadedHomeState { todayFixture("posted-validating") },
            loadedHomeState { todayFixture("not-posted") },
            loadedHomeState { todayFailure("404-no-open-topic") },
            loadedHomeState(HomeMode.Guest),
        )
        states.forEach { assertTrue(!it.aiCardVisible) }
        var current by mutableStateOf(states.first())
        rule.setContent { TestApp(copy) { HomeScreen(current, callbacks(), image = image.slot) } }
        states.forEach {
            current = it
            rule.waitForIdle()
            tag("home.root").assertExists()
            assertAbsent("home.ai-card")
        }
    }

    // ---- full id coverage -----------------------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-057 모든 섹션이 채워진 홈에는 testids 표의 홈 식별자가 존재한다`() {
        show(loadedHomeState())
        listOf(
            "home.root", "home.scroll", "home.notification-button", "home.topic-date", "home.topic-title",
            "home.hero-photo", "home.week-section", "home.week-count", "home.week-day-2026-10-25", "home.week-photo-2026-10-27",
            "home.ranking-section", "home.ranking-more-link", "home.ranking-item-${postId("261")}",
            "home.ranking-like-button-${postId("261")}", "home.ranking-like-count-${postId("261")}",
            "home.popular-section", "home.popular-more-link", "home.popular-item-${postId("202")}",
            "home.popular-like-button-${postId("202")}", "home.popular-like-count-${postId("202")}",
            "home.ai-card", "home.issue-section", "home.issue-item-44444444-4444-4444-8444-444444444401",
        ).forEach { tag(it).assertExists() }
    }

    @Test
    fun `TC-HOME-057 실패 상태의 홈에는 오류와 다시 시도 식별자가 존재하고 눌림이 전달된다`() {
        val state = loadedHomeState {
            todayFailure("500-server-error")
            home.calendarHandler = { HomeFixtureModels.failure("home/posts-calendar__500-server-error.json") }
            home.postsHandler = { HomeFixtureModels.failure("home/posts-list__500-server-error.json") }
            banners.handler = { HomeFixtureModels.failure("banner/banners__500-server-error.json") }
        }
        show(state)
        listOf(
            "home.hero-error", "home.hero-retry-button", "home.week-error", "home.week-retry-button",
            "home.ranking-error", "home.ranking-retry-button", "home.popular-error", "home.popular-retry-button",
            "home.issue-error", "home.issue-retry-button",
        ).forEach { tag(it).assertExists() }
        tag("home.week-retry-button").performClick()
        tag("home.ranking-retry-button").performClick()
        tag("home.popular-retry-button").performClick()
        tag("home.issue-retry-button").performClick()
        assertEquals(
            listOf("week-retry", "ranking-retry:${RankingKind.Yesterday}", "ranking-retry:${RankingKind.Today}", "issue-retry"),
            calls,
        )
    }

    // ---- ISSUE banners --------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-BANR-029 배너 항목은 제목과 부제목을 읽을 수 있게 그리고 누르면 그 배너를 알린다`() {
        val state = loadedHomeState()
        val banner = (state.issue as IssueState.Ready).banners.first()
        show(state)
        tag("home.issue-section").assertShowsAll(copy["home.banner.title"])
        tag("home.issue-item-${banner.id}").assertShowsAll(banner.title, banner.subtitle)
        tag("home.issue-item-${banner.id}").performClick()
        assertEquals(listOf("banner:${banner.id}"), calls)
    }

    @Test
    fun `TC-BANR-007 썸네일 주소가 잘못된 배너도 유지되고 썸네일 자리만 대체 이미지를 요청한다`() {
        // The fixture helper does not run the repository mapping; apply the domain rule (unusable thumbnail url -> null) like the real repository does.
        val state = loadedHomeState {
            banners.handler = {
                val page = HomeFixtureModels.bannerPage("banner/banners__bad-thumbnail.json")
                HomeFixtureModels.ok(page.copy(banners = page.banners.map { b -> b.copy(thumbnailUrl = b.thumbnailUrl?.let(::httpsUrlOrNull)) }))
            }
        }
        val banners = (state.issue as IssueState.Ready).banners
        assertEquals(3, banners.size)
        val broken = banners.single { it.thumbnailUrl == null }
        show(state)
        banners.forEach { tag("home.issue-item-${it.id}").assertShowsAll(it.title, it.subtitle) }
        assertTrue(null in image.urls, "the broken one asks the image slot for the fallback: ${image.urls}")
        assertEquals("이슈 2", broken.title)
    }

    @Test
    fun `TC-BANR-010 배너가 비어 있으면 ISSUE 섹션이 트리에 없고 다른 섹션은 그대로다`() {
        val state = loadedHomeState { banners.handler = { HomeFixtureModels.ok(HomeFixtureModels.bannerPage("banner/banners__empty.json")) } }
        assertEquals(IssueState.Hidden, state.issue)
        show(state)
        assertAbsent("home.issue-section", "home.issue-error", "home.issue-retry-button")
        tag("home.hero-photo").assertIsDisplayed()
        tag("home.popular-section").assertIsDisplayed()
    }

    @Test
    fun `TC-BANR-010 최초 배너 조회가 실패하면 섹션은 없고 오류와 다시 시도만 보이며 다른 섹션은 그대로다`() {
        val state = loadedHomeState { banners.handler = { HomeFixtureModels.failure("banner/banners__500-server-error.json") } }
        assertEquals(IssueState.Error, state.issue)
        show(state)
        assertAbsent("home.issue-section")
        tag("home.issue-error").assertTextEquals(copy["home.banner.error"])
        tag("home.issue-retry-button").assertExists()
        tag("home.hero-photo").assertIsDisplayed()
        tag("home.week-section").assertIsDisplayed()
    }
}
