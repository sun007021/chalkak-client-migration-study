package com.stonefive.chalkak.ui.main

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.RecordingUploadGate
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.hasNode
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.postId
import com.stonefive.chalkak.testing.todayFailure
import com.stonefive.chalkak.testing.todayFixture
import kotlinx.coroutines.CompletableDeferred
import com.stonefive.chalkak.testing.TODAY
import com.stonefive.chalkak.testing.YESTERDAY
import com.stonefive.chalkak.testing.popularQuery
import com.stonefive.chalkak.testing.recentQuery
import java.time.LocalDate
import kr.chalkak.core.common.DateFormats
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.data.post.testing.gated
import kr.chalkak.core.data.post.PostSort
import kr.chalkak.core.data.post.testing.POST_MINE
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.feature.display.FeedEntry
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import kr.chalkak.feature.upload.UploadGateEffect
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * [MainHost]: real NavigationController + real HomeStateHolder + real LikeController over fixture-backed fakes.
 * Tab content other than home is a placeholder tagged with its screen root id; only presence is checked.
 */
@RunWith(RobolectricTestRunner::class)
class MainHostTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private var rig = MainRig()

    @After
    fun tearDown() = rig.close()

    /** [ready] = a tag that proves home has loaded (default: the approved hero photo for members, the Empty hero for guests). */
    private fun launch(mode: AccessMode = AccessMode.Member, ready: String? = null, setup: MainRig.() -> Unit = {}) {
        rig.close()
        rig = MainRig(mode).apply(setup)
        rig.launch(rule, copy)
        rule.awaitTag(ready ?: if (mode == AccessMode.Member) "home.hero-photo" else "home.hero-empty")
    }

    private fun node(tag: String) = rule.onNodeWithTag(tag)

    private fun tap(tag: String) {
        node(tag).performClick()
        rule.waitForIdle()
    }

    private fun scrollTo(tag: String) {
        node("home.scroll").performScrollToNode(hasTestTag(tag))
        rule.waitForIdle()
    }

    private fun systemBack() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }

    private fun assertToast(text: String) {
        rule.awaitTag("toast.message")
        node("toast.message").assertTextEquals(text)
    }

    private fun assertSelectedTab(selected: Tab) {
        mapOf(
            Tab.Home to "bottom-bar.tab-home", Tab.Display to "bottom-bar.tab-display",
            Tab.Record to "bottom-bar.tab-record", Tab.Settings to "bottom-bar.tab-settings",
        ).forEach { (tab, t) -> if (tab == selected) node(t).assertIsSelected() else node(t).assertIsNotSelected() }
    }

    private fun visible(tag: String): Boolean =
        rule.hasNode(tag) && runCatching { node(tag).assertIsDisplayed() }.isSuccess

    // ---- tabs ------------------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-NAV-003 메인에 처음 들어오면 홈이 선택되어 있고 홈 화면과 하단바가 함께 보인다`() {
        launch()
        node("home.root").assertExists()
        node("bottom-bar.root").assertIsDisplayed()
        assertSelectedTab(Tab.Home)
    }

    @Test
    fun `TC-NAV-004 전시 기록 설정 탭을 차례로 누르면 각 화면이 열리고 선택 표시가 따라오며 하단바는 계속 보인다`() {
        launch()
        listOf(
            Tab.Display to "display.root", Tab.Record to "record.root", Tab.Settings to "settings.root",
        ).forEach { (tab, root) ->
            tap("bottom-bar.tab-${tab.analyticsName}")
            node(root).assertExists()
            node("home.root").assertDoesNotExist()
            node("bottom-bar.root").assertIsDisplayed()
            assertSelectedTab(tab)
        }
        tap("bottom-bar.tab-home")
        node("home.root").assertExists()
        node("settings.root").assertDoesNotExist()
        assertSelectedTab(Tab.Home)
    }

    @Test
    fun `TC-NAV-004 탭 전환의 screen_view는 컨트롤러만 보내고 화면 호스트는 보내지 않는다`() {
        launch()
        assertEquals(listOf("home"), rig.analytics.screens.toList())
        tap("bottom-bar.tab-display")
        assertEquals(listOf("home", "display"), rig.analytics.screens.toList())
        tap("bottom-bar.tab-display") // re-selection: no new screen_view either
        assertEquals(listOf("home", "display"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-NAV-008 전시 탭을 다시 누르면 전시 화면이 다시 확인하고 화면과 선택은 그대로이다`() {
        launch()
        tap("bottom-bar.tab-display")
        rule.awaitTag("display.grid")
        val first = rig.posts.posts.calls.size
        tap("bottom-bar.tab-display")
        rule.waitUntil(2_000) { rig.posts.posts.calls.size > first }
        node("display.root").assertExists()
        assertSelectedTab(Tab.Display)
        assertEquals(1, rig.displayRequests.size, "re-selecting keeps the holder")
    }

    @Test
    fun `TC-NAV-008 설정 탭을 다시 눌러도 화면은 그대로이고 전시는 다시 확인하지 않는다`() {
        launch()
        tap("bottom-bar.tab-settings")
        val screens = rig.analytics.screens.toList()
        tap("bottom-bar.tab-settings")
        node("settings.root").assertExists()
        assertSelectedTab(Tab.Settings)
        assertEquals(screens, rig.analytics.screens.toList())
        assertTrue(rig.displayRequests.isEmpty())
        assertTrue(rig.posts.posts.calls.isEmpty())
    }

    @Test
    fun `TC-NAV-009 홈을 아래로 스크롤한 뒤 홈 탭을 다시 누르면 맨 위로 돌아온다`() {
        launch()
        assertTrue(visible("home.topic-date"))
        scrollTo("home.popular-section")
        assertTrue(!visible("home.topic-date"), "scrolled away from the top")
        tap("bottom-bar.tab-home")
        rule.awaitTag("home.topic-date")
        assertTrue(visible("home.topic-date"), "back at the top")
        assertSelectedTab(Tab.Home)
    }

    // ---- upload button / gate -------------------------------------------------------------------------------------------------

    @Test
    fun `TC-NAV-005 업로드 버튼은 선택 탭을 바꾸지 않고 게이트를 한 번 부르며 통과하면 업로드 화면이 열리고 하단바가 사라진다`() {
        launch()
        tap("bottom-bar.upload-button")
        rule.awaitTag("upload.root")
        assertEquals(1, rig.gate.calls)
        assertEquals(Route.PhotoUpload, rig.nav.top)
        node("bottom-bar.root").assertDoesNotExist()
        systemBack()
        node("home.root").assertExists()
        assertSelectedTab(Tab.Home)
    }

    @Test
    fun `TC-NAV-005 설정 탭에서 업로드를 열었다 닫으면 설정 탭으로 돌아온다`() {
        launch()
        tap("bottom-bar.tab-settings")
        tap("bottom-bar.upload-button")
        assertSelectedTabAfterUploadOpens()
        systemBack()
        node("settings.root").assertExists()
        assertSelectedTab(Tab.Settings)
    }

    private fun assertSelectedTabAfterUploadOpens() {
        rule.awaitTag("upload.root")
        assertEquals(Tab.Settings, rig.nav.selectedTab, "the upload button never changes the selected tab")
    }

    @Test
    fun `TC-NAV-005 게이트가 열지 않기로 하면 업로드 화면 없이 안내 토스트를 보이고 현재 화면과 하단바가 그대로다`() {
        launch { gate.result = UploadGateEffect.Toast(1, "upload.gate.already-posted") }
        tap("bottom-bar.upload-button")
        assertEquals(1, rig.gate.calls)
        assertToast(copy["upload.gate.already-posted"])
        node("upload.root").assertDoesNotExist()
        node("bottom-bar.root").assertIsDisplayed()
        assertSelectedTab(Tab.Home)
    }

    @Test
    fun `TC-NAV-005 게이트가 던져도 확인 실패 토스트를 보이고 다음 탭에서 게이트를 다시 부를 수 있다`() {
        launch()
        rig.gate.result = UploadGateEffect.Toast(1, "upload.gate.check-failed")
        tap("bottom-bar.upload-button")
        assertToast(copy["upload.gate.check-failed"])
        rig.gate.result = RecordingUploadGate.Open
        tap("bottom-bar.upload-button")
        rule.awaitTag("upload.root")
        assertEquals(2, rig.gate.calls)
    }

    @Test
    fun `TC-NAV-007 게이트 확인 중 업로드 버튼을 연타해도 게이트는 한 번이고 업로드 화면도 하나만 열린다`() {
        val hold = CompletableDeferred<Unit>()
        launch { gate.hold = hold }
        repeat(3) { tap("bottom-bar.upload-button") }
        assertEquals(1, rig.gate.calls)
        hold.complete(Unit)
        rule.awaitTag("upload.root")
        assertEquals(1, rig.nav.stack.count { it == Route.PhotoUpload })
        systemBack()
        node("upload.root").assertDoesNotExist()
        node("home.root").assertExists()
    }

    @Test
    fun `TC-HOME-003 오늘 사진이 없을 때 히어로 업로드 버튼은 같은 업로드 게이트를 한 번 연다`() {
        launch(ready = "home.hero-upload-button") { fakes.todayFixture("not-posted") }
        tap("home.hero-upload-button")
        rule.awaitTag("upload.root")
        assertEquals(1, rig.gate.calls)
    }

    @Test
    fun `TC-HOME-008 정지 회원이 히어로 업로드를 누르면 정지 안내 토스트이고 게이트와 today 재요청이 없다`() {
        launch(ready = "home.hero-upload-button") { fakes.todayFailure("403-banned") }
        tap("home.hero-upload-button")
        assertToast(copy["home.hero.banned"])
        assertEquals(0, rig.gate.calls)
        assertEquals(1, rig.fakes.home.todayCalls.size, "no second GET /posts/today")
    }

    // ---- guest restrictions (D-05): toast + no network ----------------------------------------------------------------------------

    @Test
    fun `TC-NAV-016 게스트가 기록 탭을 누르면 토스트만 뜨고 탭은 그대로이며 기록 화면은 열리지 않는다`() {
        launch(AccessMode.Guest)
        tap("bottom-bar.tab-record")
        assertToast(copy["nav.guest.record"])
        assertSelectedTab(Tab.Home)
        node("record.root").assertDoesNotExist()
        node("home.root").assertExists()
        assertEquals(listOf("home"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-NAV-017 게스트가 업로드 버튼을 누르면 토스트가 뜨고 게이트도 업로드 화면도 없다`() {
        launch(AccessMode.Guest)
        tap("bottom-bar.upload-button")
        assertToast(copy["nav.guest.upload"])
        assertEquals(0, rig.gate.calls)
        node("upload.root").assertDoesNotExist()
    }

    @Test
    fun `TC-NAV-017 게스트 히어로를 누르면 업로드 안내 토스트이고 게이트는 없다`() {
        launch(AccessMode.Guest)
        tap("home.hero-upload-button")
        assertToast(copy["home.guest.upload"])
        assertEquals(0, rig.gate.calls)
    }

    @Test
    fun `TC-NAV-018 게스트가 랭킹 사진을 누르면 피드 안내 토스트이고 이동도 상세 요청도 없다`() {
        launch(AccessMode.Guest)
        scrollTo("home.ranking-item-${postId("261")}")
        tap("home.ranking-item-${postId("261")}")
        assertToast(copy["nav.guest.feed"])
        node("feed.root").assertDoesNotExist()
        assertTrue(rig.posts.details.calls.isEmpty())
    }

    @Test
    fun `TC-NAV-018 게스트가 오늘 인기 사진을 눌러도 같은 안내 토스트다`() {
        launch(AccessMode.Guest)
        scrollTo("home.popular-item-${postId("202")}")
        tap("home.popular-item-${postId("202")}")
        assertToast(copy["nav.guest.feed"])
        node("feed.root").assertDoesNotExist()
    }

    @Test
    fun `TC-NAV-019 게스트가 좋아요를 누르면 토스트가 뜨고 개수와 상태가 그대로이며 요청이 없다`() {
        launch(AccessMode.Guest)
        scrollTo("home.popular-like-button-${postId("202")}")
        tap("home.popular-like-button-${postId("202")}")
        assertToast(copy["nav.guest.like"])
        node("home.popular-like-button-${postId("202")}").assertIsNotSelected()
        node("home.popular-like-count-${postId("202")}").assertTextEquals("38")
        assertTrue(rig.posts.likeCalls.isEmpty())
    }

    @Test
    fun `TC-NAV-020 게스트가 알림 벨을 누르면 토스트가 뜨고 알림 화면도 알림 API도 없다`() {
        launch(AccessMode.Guest)
        tap("home.notification-button")
        assertToast(copy["nav.guest.notification"])
        node("notifications.root").assertDoesNotExist()
        assertEquals(0, rig.fakes.home.unreadCalls.size)
    }

    // ---- stacked screens / back --------------------------------------------------------------------------------------------------

    @Test
    fun `TC-NAV-012 랭킹 사진으로 게시물 상세를 열면 하단바가 사라지고 뒤로 가면 다시 보인다`() {
        launch()
        scrollTo("home.ranking-item-${postId("261")}")
        tap("home.ranking-item-${postId("261")}")
        rule.awaitTag("feed.root")
        node("bottom-bar.root").assertDoesNotExist()
        assertEquals(Route.Feed(postId("261"), FeedSource.Display), rig.nav.top)
        systemBack()
        node("feed.root").assertDoesNotExist()
        node("bottom-bar.root").assertIsDisplayed()
        assertSelectedTab(Tab.Home)
    }

    @Test
    fun `TC-NAV-030 알림 벨을 누르면 알림 화면이 열리고 하단바가 사라지며 뒤로 가면 홈이다`() {
        launch()
        tap("home.notification-button")
        rule.awaitTag("notifications.root")
        node("bottom-bar.root").assertDoesNotExist()
        systemBack()
        node("notifications.root").assertDoesNotExist()
        node("home.root").assertExists()
        node("bottom-bar.root").assertIsDisplayed()
    }

    @Test
    fun `TC-NAV-031 알림 벨을 연타해도 알림 화면은 하나만 쌓여 뒤로 한 번에 홈이다`() {
        launch()
        // The first tap opens the screen and the bell leaves the tree, so the repeated taps are the same user-tap request the host
        // would forward from a fast triple tap (the old body clicked a node that no longer exists).
        node("home.notification-button").performClick()
        rule.waitForIdle()
        repeat(2) { rule.runOnUiThread { rig.nav.open(Route.Notifications) } }
        rule.waitForIdle()
        assertEquals(1, rig.nav.stack.count { it == Route.Notifications })
        systemBack()
        node("home.root").assertExists()
    }

    @Test
    fun `TC-NAV-036 배너를 누르면 배너 웹이 열리고 하단바가 사라지며 뒤로 가면 홈이고 issue screen_view는 한 번이다`() {
        launch()
        scrollTo("home.issue-item-44444444-4444-4444-8444-444444444401")
        tap("home.issue-item-44444444-4444-4444-8444-444444444401")
        rule.awaitTag("issue.root")
        node("bottom-bar.root").assertDoesNotExist()
        assertEquals(1, rig.analytics.screens.count { it == "issue" })
        node("issue.back-button").performClick()
        rule.waitForIdle()
        node("issue.root").assertDoesNotExist()
        node("home.root").assertExists()
        node("bottom-bar.root").assertIsDisplayed()
    }

    @Test
    fun `TC-NAV-043 홈 전시 설정 순으로 이동한 뒤 시스템 뒤로는 홈이고 홈에서 한 번 더 누르면 앱 종료를 요청한다`() {
        launch()
        tap("bottom-bar.tab-display")
        tap("bottom-bar.tab-settings")
        systemBack()
        node("home.root").assertExists()
        assertSelectedTab(Tab.Home)
        assertEquals(0, rig.exits)
        systemBack()
        assertEquals(1, rig.exits)
    }

    // ---- likes wired to the shared LikeController -----------------------------------------------------------------------------------

    @Test
    fun `TC-LIKE-005 홈에서 좋아요를 누르면 서버 응답 전에 선택 상태와 개수가 바뀐다`() {
        launch()
        val gate = rig.likeServer.hold(postId("202"))
        scrollTo("home.popular-like-button-${postId("202")}")
        tap("home.popular-like-button-${postId("202")}")
        node("home.popular-like-button-${postId("202")}").assertIsSelected()
        node("home.popular-like-count-${postId("202")}").assertTextEquals("39")
        gate.complete(Unit)
        rule.waitForIdle()
        assertEquals(listOf("PUT ${postId("202")}"), rig.likeServer.calls.toList())
    }

    @Test
    fun `TC-LIKE-009 홈 좋아요가 실패하면 이전 상태로 되돌리고 좋아요 실패 토스트를 띄운다`() {
        launch {
            likeServer.failNext(postId("202"), PostFixtures.failure("like/posts-likes-put__500-server-error.json"))
        }
        scrollTo("home.popular-like-button-${postId("202")}")
        tap("home.popular-like-button-${postId("202")}")
        assertToast(copy["like.error.generic"])
        node("home.popular-like-button-${postId("202")}").assertIsNotSelected()
        node("home.popular-like-count-${postId("202")}").assertTextEquals("38")
    }

    @Test
    fun `TC-LIKE-010 홈 좋아요가 404이면 롤백 토스트와 함께 그 사진이 홈 목록에서 빠진다`() {
        launch {
            likeServer.failNext(postId("202"), PostFixtures.failure("like/posts-likes-put__404-not-found.json"))
        }
        scrollTo("home.popular-like-button-${postId("202")}")
        tap("home.popular-like-button-${postId("202")}")
        assertToast(copy["like.error.generic"])
        rule.waitForIdle()
        node("home.popular-item-${postId("202")}").assertDoesNotExist()
        assertTrue(rig.changes.isRemoved(postId("202")))
        node("home.popular-item-${postId("203")}").assertExists()
    }

    // ---- hero photo ------------------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-HOME-006 승인된 히어로 사진을 누르면 게시물 상세가 열린다`() {
        launch()
        tap("home.hero-photo")
        rule.awaitTag("feed.root")
        assertEquals(postId("201"), (rig.nav.top as Route.Feed).postId)
    }

    // ---- display tab / feed wiring (A4) ----------------------------------------------------------------------------------------------

    private val firstToday get() = PostFixtures.pageFor(recentQuery()).posts.first()

    /** `setup` for [launch]: the detail answer for the user's own approved post (the home hero). */
    private val ownPost: MainRig.() -> Unit = {
        posts.details.always(POST_MINE, PostFixtures.detailResult("feed/posts-detail__mine-today.json"))
    }

    @Test
    fun `전시 탭은 실제 전시 화면을 보여 주고 목록을 불러온다`() {
        launch()
        tap("bottom-bar.tab-display")
        rule.awaitTag("display.grid")
        node("display.root").assertIsDisplayed()
        node("bottom-bar.root").assertIsDisplayed()
        assertEquals(listOf<Pair<LocalDate?, PostSort?>>(null to null), rig.displayRequests.toList())
        assertTrue(rig.posts.posts.calls.contains(recentQuery()))
        assertEquals(listOf("home", "display"), rig.analytics.screens.toList())
        assertEquals(listOf("display"), rig.postAnalytics.screens.toList())
    }

    @Test
    fun `전시 목록의 사진을 누르면 그 항목을 시드로 게시물 상세가 열리고 하단바가 사라진다`() {
        launch()
        tap("bottom-bar.tab-display")
        rule.awaitTag("display.grid")
        val post = firstToday
        tap("display.item-${post.id}")
        rule.awaitTag("feed.root")
        node("bottom-bar.root").assertDoesNotExist()
        assertEquals(Route.Feed(post.id, FeedSource.Display), rig.nav.top)
        assertEquals(listOf<FeedEntry>(FeedEntry.FromDisplay(post)), rig.feedEntries.toList())
        systemBack()
        node("feed.root").assertDoesNotExist()
        node("display.root").assertIsDisplayed()
        assertSelectedTab(Tab.Display)
    }

    @Test
    fun `홈 랭킹 사진을 누르면 홈 항목을 시드로 게시물 상세가 열린다`() {
        launch()
        scrollTo("home.ranking-item-${postId("261")}")
        tap("home.ranking-item-${postId("261")}")
        rule.awaitTag("feed.root")
        val entry = rig.feedEntries.single()
        assertTrue(entry is FeedEntry.FromDisplay && entry.post.id == postId("261"), "seeded from the home card: $entry")
        assertEquals(Route.Feed(postId("261"), FeedSource.Display), rig.nav.top)
    }

    @Test
    fun `홈 히어로로 연 게시물 상세는 시드 없이 ID로 불러온다`() {
        launch(setup = ownPost)
        tap("home.hero-photo")
        rule.awaitTag("feed.root")
        assertEquals(listOf<FeedEntry>(FeedEntry.FromPush(postId("201"))), rig.feedEntries.toList())
        rule.waitUntil(2_000) { rig.posts.details.calls.isNotEmpty() }
        assertEquals(postId("201"), rig.posts.details.calls.first())
    }

    @Test
    fun `게스트가 전시 목록의 사진을 누르면 안내 토스트이고 상세는 열리지 않는다`() {
        launch(AccessMode.Guest)
        tap("bottom-bar.tab-display")
        rule.awaitTag("display.grid")
        tap("display.item-${firstToday.id}")
        assertToast(copy["nav.guest.feed"])
        node("feed.root").assertDoesNotExist()
        assertTrue(rig.feedEntries.isEmpty())
        assertTrue(rig.posts.details.calls.isEmpty())
    }

    @Test
    fun `내 게시물을 삭제하면 상세가 닫히고 삭제 토스트가 뜨며 목록에서 사라진다`() {
        launch(setup = ownPost)
        rig.posts.deletes.enqueue(POST_MINE, ApiResult.Success(Unit))
        tap("home.hero-photo")
        rule.awaitTag("feed.delete-button")
        tap("feed.delete-button")
        tap("feed.delete-confirm-button")
        rule.waitUntil(2_000) { !rule.hasNode("feed.root") }
        assertEquals(1, rig.posts.deletes.calls.size)
        assertToast(copy["nav.post-deleted"])
        assertEquals(Route.TabRoot(Tab.Home), rig.nav.top)
        node("bottom-bar.root").assertIsDisplayed()
        assertTrue(rig.changes.isRemoved(POST_MINE))
    }

    @Test
    fun `삭제 요청이 진행 중일 때 시스템 뒤로 가기는 상세를 닫지 않는다`() {
        launch(setup = ownPost)
        val gate = gated<ApiResult<Unit>>(ApiResult.Success(Unit))
        rig.posts.deletes.enqueue(POST_MINE, gate)
        tap("home.hero-photo")
        rule.awaitTag("feed.delete-button")
        tap("feed.delete-button")
        tap("feed.delete-confirm-button")
        rule.awaitTag("feed.deleting")
        systemBack()
        node("feed.root").assertIsDisplayed()
        gate.release()
        rule.waitUntil(2_000) { !rule.hasNode("feed.root") }
        assertToast(copy["nav.post-deleted"])
    }

    @Test
    fun `홈의 더보기는 그 날짜를 인기순으로 연 전시를 보여 준다`() {
        launch()
        scrollTo("home.ranking-more-link")
        tap("home.ranking-more-link")
        rule.awaitTag("display.grid")
        assertSelectedTab(Tab.Display)
        assertEquals(listOf<Pair<LocalDate?, PostSort?>>(YESTERDAY to PostSort.POPULAR), rig.displayRequests.toList())
        node("display.date-label").assertTextEquals(DateFormats.monthDay(YESTERDAY))
        assertTrue(rig.posts.posts.calls.contains(popularQuery(YESTERDAY)))
    }

    @Test
    fun `홈에서 더보기를 두 번 누르면 매번 요청한 날짜로 새로 연다`() {
        launch()
        scrollTo("home.ranking-more-link")
        tap("home.ranking-more-link")
        rule.awaitTag("display.grid")
        tap("bottom-bar.tab-home")
        scrollTo("home.popular-more-link")
        tap("home.popular-more-link")
        rule.awaitTag("display.grid")
        assertEquals(
            listOf<Pair<LocalDate?, PostSort?>>(YESTERDAY to PostSort.POPULAR, TODAY to PostSort.POPULAR),
            rig.displayRequests.toList(),
        )
        node("display.date-label").assertTextEquals(DateFormats.monthDay(TODAY))
    }

    @Test
    fun `업로드 성공 확인이 요청한 날짜를 전시가 한 번 받아 그 날짜를 연다`() {
        launch()
        rule.runOnUiThread {
            rig.nav.open(Route.PhotoUpload)
            rig.nav.onUploadSubmitted(YESTERDAY)
            rig.nav.onUploadSuccessConfirmed()
        }
        rule.awaitTag("display.grid")
        assertSelectedTab(Tab.Display)
        node("display.date-label").assertTextEquals(DateFormats.monthDay(YESTERDAY))
        assertEquals(null, rig.nav.displayDateRequest, "the request is consumed once the display applied it")
        assertTrue(rig.posts.posts.calls.contains(popularQuery(YESTERDAY)))
    }

    @Test
    fun `다른 화면이 위에 쌓였다 돌아와도 같은 상세 홀더가 이어지고 닫으면 다음에는 새 홀더이다`() {
        launch(setup = ownPost)
        tap("home.hero-photo")
        rule.awaitTag("feed.root")
        rule.runOnUiThread { rig.nav.open(Route.Notifications) }
        rule.waitForIdle()
        node("feed.root").assertDoesNotExist()
        node("notifications.root").assertExists()
        systemBack()
        rule.awaitTag("feed.root")
        assertEquals(1, rig.feedEntries.size, "the covered feed keeps its holder")

        systemBack()
        node("feed.root").assertDoesNotExist()
        tap("home.hero-photo")
        rule.awaitTag("feed.root")
        assertEquals(2, rig.feedEntries.size, "a popped feed is finished; opening again builds a new holder")
    }
}
