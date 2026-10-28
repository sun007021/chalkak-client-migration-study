package com.stonefive.chalkak.ui.main

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.stonefive.chalkak.testing.MainRig
import com.stonefive.chalkak.testing.RECORD_OCT
import com.stonefive.chalkak.testing.RECORD_POST_OCT_20
import com.stonefive.chalkak.testing.awaitTag
import com.stonefive.chalkak.testing.hasNode
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.recordThumb
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kr.chalkak.core.data.post.testing.POST_MINE_PAST
import kr.chalkak.core.data.post.testing.PostFixtures
import kr.chalkak.core.data.record.testing.RecordFixtureModels
import kr.chalkak.core.network.ApiResult
import kr.chalkak.feature.display.FeedEntry
import kr.chalkak.feature.navigation.AccessMode
import kr.chalkak.feature.navigation.FeedSource
import kr.chalkak.feature.navigation.Route
import kr.chalkak.feature.navigation.Tab
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * [MainHost] with the record tab (A7): the real `RecordStateHolder` over `shared/fixtures/record` replaces the placeholder
 * (`MainDependencies.newRecordHolder` is set by `MainRig`). Navigation is the real controller's; `screen_view` is its alone.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h1400dp")
class MainHostRecordTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val copy = loadCopy()
    private var rig = MainRig()

    @After
    fun tearDown() = rig.close()

    private fun launch(mode: AccessMode = AccessMode.Member, setup: MainRig.() -> Unit = {}) {
        rig.close()
        rig = MainRig(mode).apply(setup)
        rig.launch(rule, copy)
        rule.awaitTag(if (mode == AccessMode.Member) "home.hero-photo" else "home.hero-empty")
    }

    private fun node(tag: String) = rule.onNodeWithTag(tag)

    private fun tap(tag: String) {
        node(tag).performClick()
        rule.waitForIdle()
    }

    private fun openRecord() {
        tap("bottom-bar.tab-record")
        rule.awaitTag("record.calendar-grid")
    }

    private fun systemBack() {
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
    }

    private fun assertToast(text: String) {
        rule.awaitTag("toast.message")
        node("toast.message").assertTextEquals(text)
    }

    private val ownPastPost: MainRig.() -> Unit = {
        posts.details.always(POST_MINE_PAST, PostFixtures.detailResult("feed/posts-detail__mine-past.json"))
    }

    // ---- 탭 ----------------------------------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-001 기록 탭은 실제 기록 화면을 보여 주고 월 목록과 현재 달 달력을 불러온다`() {
        launch()
        openRecord()
        node("record.root").assertIsDisplayed()
        node("bottom-bar.root").assertIsDisplayed()
        node("bottom-bar.tab-record").assertIsSelected()
        node("record.month-label").assertTextEquals("2026년 10월")
        node("record.day-2026-10-31").assertIsSelected()
        assertEquals(1, rig.recordRepo.monthsCalls.size)
        assertEquals(listOf(RECORD_OCT), rig.recordRepo.calendarCalls.toList())
        assertTrue(RECORD_OCT in rig.recordRepo.calendarCalls)
    }

    @Test
    fun `TC-REC-042 기록 화면의 screen_view는 컨트롤러가 한 번만 보낸다`() {
        launch()
        openRecord()
        assertEquals(listOf("home", "record"), rig.analytics.screens.toList())
        assertTrue(rig.postAnalytics.screens.none { it == "record" })
    }

    @Test
    fun `TC-REC-033 게스트가 기록 탭을 누르면 안내 토스트만 뜨고 화면도 요청도 없다`() {
        launch(AccessMode.Guest)
        tap("bottom-bar.tab-record")
        assertToast(copy["nav.guest.record"])
        node("record.root").assertDoesNotExist()
        assertEquals(Route.TabRoot(Tab.Home), rig.nav.top)
        assertEquals(0, rig.recordRepo.totalCalls)
        node("home.root").assertIsDisplayed()
    }

    @Test
    fun `TC-REC-022 다른 탭에 다녀오면 보던 날짜를 유지하고 다시 확인한다`() {
        launch()
        openRecord()
        tap("record.day-2026-10-27")
        node("record.day-2026-10-27").assertIsSelected()

        tap("bottom-bar.tab-home")
        node("record.root").assertDoesNotExist()
        tap("bottom-bar.tab-record")
        rule.awaitTag("record.calendar-grid")

        node("record.day-2026-10-27").assertIsSelected()
        node("record.month-label").assertTextEquals("2026년 10월")
        assertEquals(2, rig.recordRepo.calendarCalls.count { it == RECORD_OCT })
        assertEquals(listOf("home", "record", "home", "record"), rig.analytics.screens.toList())
    }

    @Test
    fun `TC-REC-043 새 사진을 올린 뒤 기록 탭으로 가면 오늘 칸에 새 사진이 나타난다`() {
        launch {
            recordRepo.calendarHandler = { ApiResult.Success(RecordFixtureModels.calendar("record/posts-calendar__2026-10-after-delete.json")) }
        }
        openRecord()
        assertEquals(0, rule.onAllNodesWithTag("record.day-photo-2026-10-27", useUnmergedTree = true).fetchSemanticsNodes().size)

        tap("bottom-bar.tab-home")
        rig.recordRepo.calendarHandler = { ApiResult.Success(RecordFixtureModels.calendarFor(it)) }
        tap("bottom-bar.tab-record")
        rule.awaitTag("record.calendar-grid")
        rule.waitUntil(2_000) {
            rule.onAllNodesWithTag("record.day-photo-2026-10-27", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
    }

    // ---- 홈에서 들어오기 (TC-REC-025) -----------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-025 홈 주간 기록의 날짜를 누르면 기록 탭이 그 날짜를 선택해 열린다`() {
        launch()
        node("home.scroll").performScrollToNode(hasTestTag("home.week-day-2026-10-27"))
        rule.waitForIdle()
        tap("home.week-day-2026-10-27")
        rule.awaitTag("record.calendar-grid")

        assertEquals(Route.TabRoot(Tab.Record), rig.nav.top)
        node("record.day-2026-10-27").assertIsSelected() // not the newest record (10/31)
        node("record.pending-badge").assertExists()
        assertEquals(listOf("home", "record"), rig.analytics.screens.toList())
    }

    // ---- 피드·전시로 나가기 (TC-REC-034, TC-NAV-034) --------------------------------------------------------------------------------

    @Test
    fun `TC-REC-034 피드에서 보기는 썸네일 시드로 내 게시물 상세를 열고 뒤로 가면 기록으로 돌아온다`() {
        launch(setup = ownPastPost)
        openRecord()
        tap("record.day-2026-10-20")
        tap("record.view-feed-button")
        rule.awaitTag("feed.root")

        assertEquals(Route.Feed(RECORD_POST_OCT_20, FeedSource.ById), rig.nav.top)
        assertEquals(listOf<FeedEntry>(FeedEntry.FromRecord(RECORD_POST_OCT_20, recordThumb(RECORD_POST_OCT_20))), rig.feedEntries.toList())
        node("bottom-bar.root").assertDoesNotExist()
        assertEquals(listOf("home", "record", "feed"), rig.analytics.screens.toList())

        systemBack()
        node("feed.root").assertDoesNotExist()
        node("record.calendar-grid").assertIsDisplayed()
        node("record.day-2026-10-20").assertIsSelected()
        node("bottom-bar.tab-record").assertIsSelected()
        assertEquals(listOf("home", "record", "feed", "record"), rig.analytics.screens.toList())
        assertEquals(2, rig.recordRepo.calendarCalls.count { it == RECORD_OCT }) // coming back revalidates (REQ-REC-036)
    }

    @Test
    fun `TC-REC-034 전시 보러가기는 그 사진의 주제 날짜 전시를 열고 뒤로 가면 기록으로 돌아와 탭 이동이 계속된다`() {
        launch()
        openRecord()
        tap("record.day-2026-10-20")
        tap("record.view-display-button")
        rule.awaitTag("display.root")

        assertEquals(Route.TabRoot(Tab.Display), rig.nav.top)
        assertEquals(LocalDate.of(2026, 10, 20), rig.displayRequests.last().first)
        node("bottom-bar.root").assertIsDisplayed()

        systemBack()
        rule.awaitTag("record.calendar-grid")
        node("display.root").assertDoesNotExist()
        node("record.day-2026-10-20").assertIsSelected()
        assertEquals(Route.TabRoot(Tab.Record), rig.nav.top)

        tap("bottom-bar.tab-home")
        node("home.root").assertIsDisplayed()
        tap("bottom-bar.tab-settings")
        node("settings.root").assertIsDisplayed()
    }

    @Test
    fun `TC-REC-024 상세에서 삭제하고 돌아오면 기록의 그 날짜 칸이 비고 삭제 토스트가 뜬다`() {
        launch(setup = ownPastPost)
        rig.posts.deletes.enqueue(POST_MINE_PAST, ApiResult.Success(Unit))
        openRecord()
        tap("record.day-2026-10-20")
        tap("record.view-feed-button")
        rule.awaitTag("feed.delete-button")
        tap("feed.delete-button")
        tap("feed.delete-confirm-button")
        rule.waitUntil(2_000) { !rule.hasNode("feed.root") }

        assertToast(copy["nav.post-deleted"])
        rule.awaitTag("record.calendar-grid")
        assertTrue(rig.changes.isRemoved(POST_MINE_PAST))
        assertEquals(0, rule.onAllNodesWithTag("record.day-photo-2026-10-20", useUnmergedTree = true).fetchSemanticsNodes().size)
        // The stale revalidation answer still lists the deleted post: it must stay hidden (REQ-REC-027).
        node("record.day-2026-10-27").assertExists()
    }

    // ---- 토스트 연결 (TC-REC-038/032) -------------------------------------------------------------------------------------------------

    @Test
    fun `TC-REC-038 이미지로 저장하면 저장 성공 토스트가 토스트 층에 한 번 뜬다`() {
        launch()
        openRecord()
        tap("record.save-image-button")
        assertToast(copy["record.save.ok"])
        assertEquals(listOf("chalkak-calendar-2026-10.png"), rig.recordSaver.fileNames.toList())
        assertEquals(1, rig.shownToasts.count { it == copy["record.save.ok"] })
    }

    @Test
    fun `TC-REC-032 서버 오류면 기록 탭에 오류 화면이 뜨고 하단바는 그대로다`() {
        launch {
            recordRepo.calendarHandler = { RecordFixtureModels.failure("record/posts-calendar__500-server-error.json") }
        }
        tap("bottom-bar.tab-record")
        rule.awaitTag("record.error-state")
        node("record.error-message").assertTextEquals(copy["record.err.other"])
        node("bottom-bar.root").assertIsDisplayed()
        node("record.calendar-grid").assertDoesNotExist()
        rule.onAllNodesWithTag("record.retry-button").assertCountEquals(1)
    }
}
