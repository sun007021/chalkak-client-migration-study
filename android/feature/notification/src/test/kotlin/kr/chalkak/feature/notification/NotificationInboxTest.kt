package kr.chalkak.feature.notification

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.common.testing.FakeClock
import kr.chalkak.core.common.testing.withDevice
import kr.chalkak.core.data.notification.NotificationPage
import kr.chalkak.core.data.notification.NotificationType
import kr.chalkak.core.data.notification.testing.FakeNotificationRepository
import kr.chalkak.core.data.notification.testing.NotificationFixtureModels
import kr.chalkak.core.data.notification.testing.httpFail
import kr.chalkak.core.data.notification.testing.invalidResponseFail
import kr.chalkak.core.data.notification.testing.offlineFail
import kr.chalkak.core.network.ApiResult
import kr.chalkak.core.network.ErrorCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val PAGE1 = "notification/notifications__page1.json"
private const val PAGE2 = "notification/notifications__page2-last.json"
private const val OVERLAP = "notification/notifications__overlap-page2.json"
private const val SRC = "22222222-2222-4222-8222-222222222201"

private fun nid(n: Int) = "33333333-3333-4333-8333-3333333333" + n.toString().padStart(2, '0')

class NotificationInboxStateHolderTest {
    private class Rig(
        val holder: NotificationInboxStateHolder,
        val repo: FakeNotificationRepository,
        val unread: RecordingUnread,
        val analytics: RecordingAnalytics,
        val effects: MutableList<InboxEffect>,
    ) {
        val state get() = holder.state.value
        val ids get() = state.rows.map { it.id }
        val toasts get() = effects.filterIsInstance<InboxEffect.Toast>().map { it.copyKey }
        val navigations get() = effects.filterIsInstance<InboxEffect.Navigate>()
    }

    private fun TestScope.rig(vararg pages: ApiResult<NotificationPage>): Rig {
        val repo = FakeNotificationRepository()
        repo.listResults += pages
        val unread = RecordingUnread()
        val analytics = RecordingAnalytics()
        val holder = NotificationInboxStateHolder(holderScope(), repo, NotificationTapHandler(repo, unread), analytics, FakeClock())
        return Rig(holder, repo, unread, analytics, collectAll(holder.effects))
    }

    private fun page(path: String) = NotificationFixtureModels.success(path)

    /** Opens the inbox and lets the first load finish. */
    private fun TestScope.opened(vararg pages: ApiResult<NotificationPage>): Rig {
        val r = rig(*pages)
        r.holder.onShown()
        advanceUntilIdle()
        return r
    }

    // ---- first load and its states ---------------------------------------------------------------

    @Test
    fun `TC-NOTI-001 opening the inbox sends screen_view notifications once and loads page 1`() = runTest {
        val r = opened(page(PAGE1))
        assertEquals(listOf("notifications"), r.analytics.screens.toList())
        assertEquals(listOf(1), r.repo.listCalls.toList())
        assertEquals(InboxPhase.Content, r.state.phase)
    }

    @Test
    fun `TC-NOTI-004 before the first answer the phase is Loading and nothing is shown`() = runTest {
        val r = rig(page(PAGE1))
        r.repo.listGates += CompletableDeferred<Unit>()
        assertEquals(InboxPhase.Loading, r.state.phase)
        r.holder.onShown()
        runCurrent()
        assertEquals(InboxPhase.Loading, r.state.phase)
        assertTrue(r.state.rows.isEmpty())
        assertEquals("알림을 불러오는 중이에요", Copy[NotiCopyKeys.INBOX_LOADING])
    }

    @Test
    fun `TC-NOTI-001 rows come in server order, the order of the response`() = runTest {
        val r = opened(page(PAGE1))
        assertEquals((1..20).map { nid(it) }, r.ids)
        assertTrue(r.state.hasNext)
        assertEquals(1, r.state.currentPage)
    }

    @Test
    fun `TC-NOTI-005 an empty answer is the Empty phase`() = runTest {
        val r = opened(page("notification/notifications__empty.json"))
        assertEquals(InboxPhase.Empty, r.state.phase)
        assertTrue(r.state.rows.isEmpty())
        assertEquals("아직 알림이 없어요", Copy[NotiCopyKeys.INBOX_EMPTY_TITLE])
        assertEquals("승인이나 반려 소식이 생기면 여기에 모아둘게요", Copy[NotiCopyKeys.INBOX_EMPTY_BODY])
    }

    @Test
    fun `TC-NOTI-006 a server error without content is the Error phase and retry asks again`() = runTest {
        val r = opened(httpFail(500, ErrorCode.INTERNAL_ERROR))
        assertEquals(InboxPhase.Error, r.state.phase)
        assertEquals(NotiCopyKeys.INBOX_ERROR, r.state.errorCopyKey)
        assertEquals("알림을 불러오지 못했어요", Copy[NotiCopyKeys.INBOX_ERROR])
        r.repo.listResults += page(PAGE1)
        val gate = CompletableDeferred<Unit>()
        r.repo.listGates += gate
        r.holder.onRetry()
        runCurrent()
        assertEquals(InboxPhase.Loading, r.state.phase)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf(1, 1), r.repo.listCalls.toList())
        assertEquals(InboxPhase.Content, r.state.phase)
        assertNull(r.state.errorCopyKey)
    }

    @Test
    fun `TC-NOTI-007 a connection failure without content shows the network message`() = runTest {
        val r = opened(offlineFail())
        assertEquals(InboxPhase.Error, r.state.phase)
        assertEquals(NotiCopyKeys.NETWORK, r.state.errorCopyKey)
        assertEquals("네트워크 연결을 확인해 주세요.", Copy[NotiCopyKeys.NETWORK])
    }

    @Test
    fun `TC-NOTI-008 an unusable response shows the generic error and does not crash`() = runTest {
        val r = opened(invalidResponseFail())
        assertEquals(InboxPhase.Error, r.state.phase)
        assertEquals(NotiCopyKeys.INBOX_ERROR, r.state.errorCopyKey)
    }

    @Test
    fun `TC-NOTI-009 a 401 that survived the refresh and a REAUTHENTICATION_REQUIRED both open the login screen without a message`() = runTest {
        for (code in listOf(ErrorCode.UNAUTHORIZED, ErrorCode.REAUTHENTICATION_REQUIRED)) {
            val r = opened(httpFail(401, code))
            assertEquals(listOf<InboxEffect>(InboxEffect.RequireLogin), r.effects.toList(), code.name)
        }
    }

    // ---- rows ------------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-011 a row shows server title and body, the thumbnail only when present, and an unread mark from readAt`() = runTest {
        val r = opened(page(PAGE1))
        val unread = r.state.rows.first { it.id == nid(1) }
        assertEquals("사진이 승인되었어요", unread.title)
        assertEquals("오늘의 사진이 전시에 올라갔어요.", unread.body)
        assertTrue(unread.unread)
        assertNull(unread.readAt)
        assertEquals(NotificationType.POST_APPROVED, unread.type)
        val read = r.state.rows.first { it.id == nid(6) }
        assertFalse(read.unread)
        assertTrue(read.readAt != null)
        val withoutThumb = opened(page("notification/notifications__topic-reminder.json"))
        assertTrue(withoutThumb.state.rows.all { it.thumbnailImageUrl == null })
    }

    @Test
    fun `TC-NOTI-012 times are KST M월 d일 HH mm across the day boundary, with and without fraction digits`() = runTest {
        val r = opened(page("notification/notifications__kst-boundary.json"))
        assertEquals(listOf("10월 27일 00:00", "10월 26일 23:59", "10월 27일 00:00"), r.state.rows.map { it.timeText })
    }

    private fun loadTimes(): List<String> {
        var times = emptyList<String>()
        runTest {
            val r = opened(page("notification/notifications__kst-boundary.json"))
            times = r.state.rows.map { it.timeText }
        }
        return times
    }

    @Test
    fun `TC-NOTI-013 the same createdAt shows the same text whatever the device time zone is`() {
        val expected = listOf("10월 27일 00:00", "10월 26일 23:59", "10월 27일 00:00")
        for (zone in listOf("UTC", "America/Los_Angeles", "Asia/Seoul")) {
            assertEquals(expected, withDevice(zoneId = zone) { loadTimes() }, zone)
        }
    }

    @Test
    fun `TC-NOTI-014 a 12 hour or Arabic or Thai device locale still gives 24 hour ASCII digits`() {
        val expected = listOf("10월 27일 00:00", "10월 26일 23:59", "10월 27일 00:00")
        for (tag in listOf("ar-SA", "th-TH-u-nu-thai", "en-US", "ar-EG-u-nu-arab")) {
            assertEquals(expected, withDevice(languageTag = tag) { loadTimes() }, tag)
        }
    }

    @Test
    fun `TC-NOTI-023 the client shows every row the server sent, 30 day old or not`() = runTest {
        val r = opened(page("notification/notifications__30day-boundary.json"))
        assertEquals(listOf(nid(1), nid(2)), r.ids)
    }

    // ---- paging ------------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-015 scrolling near the end asks for page 2 once, even when the scroll keeps firing`() = runTest {
        val r = opened(page(PAGE1))
        r.repo.listResults += page(PAGE2)
        r.repo.listGates += CompletableDeferred<Unit>()
        r.holder.onScrolledTo(10)
        runCurrent()
        assertEquals(listOf(1), r.repo.listCalls.toList(), "index 10 of 20 is not near the end")
        r.holder.onScrolledTo(16)
        r.holder.onScrolledTo(17)
        r.holder.onScrolledTo(19)
        runCurrent()
        assertEquals(listOf(1, 2), r.repo.listCalls.toList())
        assertTrue(r.state.loadingMore)
    }

    @Test
    fun `TC-NOTI-015 page 2 is appended after page 1 and the page counter moves on`() = runTest {
        val r = opened(page(PAGE1), page(PAGE2))
        r.holder.onScrolledTo(19)
        advanceUntilIdle()
        assertEquals((1..25).map { nid(it) }, r.ids)
        assertEquals(2, r.state.currentPage)
        assertFalse(r.state.hasNext)
        assertFalse(r.state.loadingMore)
    }

    @Test
    fun `TC-NOTI-016 without hasNext scrolling to the end sends no further request`() = runTest {
        val r = opened(page(PAGE1), page(PAGE2))
        r.holder.onScrolledTo(19)
        advanceUntilIdle()
        r.holder.onScrolledTo(24)
        r.holder.onScrolledTo(22)
        advanceUntilIdle()
        assertEquals(listOf(1, 2), r.repo.listCalls.toList())
    }

    @Test
    fun `TC-NOTI-016 a single page answer with hasNext false never asks for more`() = runTest {
        val r = opened(page("notification/notifications__kst-boundary.json"))
        r.holder.onScrolledTo(2)
        advanceUntilIdle()
        assertEquals(listOf(1), r.repo.listCalls.toList())
    }

    @Test
    fun `TC-NOTI-017 ids repeated on the next page are dropped and the order is kept`() = runTest {
        val r = opened(page(PAGE1), page(OVERLAP))
        r.holder.onScrolledTo(19)
        advanceUntilIdle()
        assertEquals(23, r.ids.size)
        assertEquals(r.ids.size, r.ids.toSet().size)
        assertEquals((1..20).map { nid(it) } + listOf(nid(26), nid(27), nid(28)), r.ids)
    }

    @Test
    fun `TC-NOTI-018 a failed next page keeps rows and page, toasts, and the same page is asked again on the next scroll`() = runTest {
        val r = opened(page(PAGE1), offlineFail(), page(PAGE2))
        r.holder.onScrolledTo(19)
        advanceUntilIdle()
        assertEquals(listOf(NotiCopyKeys.INBOX_MORE_ERROR), r.toasts)
        assertEquals("다음 알림을 불러오지 못했어요. 다시 시도해 주세요.", Copy[NotiCopyKeys.INBOX_MORE_ERROR])
        assertEquals(20, r.state.rows.size)
        assertEquals(1, r.state.currentPage)
        assertTrue(r.state.hasNext)
        assertFalse(r.state.loadingMore)
        assertEquals(InboxPhase.Content, r.state.phase)
        r.holder.onScrolledTo(19)
        advanceUntilIdle()
        assertEquals(listOf(1, 2, 2), r.repo.listCalls.toList())
        assertEquals(25, r.state.rows.size)
    }

    // ---- refresh ------------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-019 pull to refresh replaces the list and goes back to page 1`() = runTest {
        val r = opened(page(PAGE1), page(PAGE2), page("notification/notifications__30day-boundary.json"))
        r.holder.onScrolledTo(19)
        advanceUntilIdle()
        assertEquals(2, r.state.currentPage)
        val gate = CompletableDeferred<Unit>()
        r.repo.listGates += gate
        r.holder.onPullToRefresh()
        runCurrent()
        assertTrue(r.state.refreshing)
        assertEquals(25, r.state.rows.size, "content stays while refreshing")
        gate.complete(Unit)
        advanceUntilIdle()
        assertFalse(r.state.refreshing)
        assertEquals(listOf(nid(1), nid(2)), r.ids)
        assertEquals(1, r.state.currentPage)
        assertEquals(listOf(1, 2, 1), r.repo.listCalls.toList())
    }

    @Test
    fun `TC-NOTI-020 a failed refresh keeps the rows and shows only the refresh toast`() = runTest {
        val r = opened(page(PAGE1), httpFail(500, ErrorCode.INTERNAL_ERROR))
        r.holder.onPullToRefresh()
        advanceUntilIdle()
        assertEquals(20, r.state.rows.size)
        assertEquals(InboxPhase.Content, r.state.phase)
        assertFalse(r.state.refreshing)
        assertEquals(listOf(NotiCopyKeys.INBOX_REFRESH_ERROR), r.toasts)
        assertEquals("알림을 새로고침하지 못했어요. 다시 시도해 주세요.", Copy[NotiCopyKeys.INBOX_REFRESH_ERROR])
    }

    @Test
    fun `TC-NOTI-021 when two refreshes overlap, the late answer of the older one is dropped and paging follows the newest`() = runTest {
        val r = opened(page(PAGE1))
        val older = CompletableDeferred<Unit>()
        val newer = CompletableDeferred<Unit>()
        r.repo.listGates += older
        r.repo.listGates += newer
        r.repo.listResults += page(PAGE2)
        r.repo.listResults += page("notification/notifications__30day-boundary.json")
        r.holder.onPullToRefresh()
        runCurrent()
        r.holder.onPullToRefresh()
        runCurrent()
        newer.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf(nid(1), nid(2)), r.ids)
        older.complete(Unit)
        advanceUntilIdle()
        assertEquals(listOf(nid(1), nid(2)), r.ids)
        assertTrue(r.toasts.isEmpty())
        assertFalse(r.state.refreshing)
        assertEquals(1, r.state.currentPage)
    }

    @Test
    fun `TC-NOTI-022 leaving the screen while loading shows no error and no toast when the answer arrives`() = runTest {
        val r = rig(offlineFail())
        val gate = CompletableDeferred<Unit>()
        r.repo.listGates += gate
        r.holder.onShown()
        runCurrent()
        r.holder.onScreenGone()
        gate.complete(Unit)
        advanceUntilIdle()
        assertNotEquals(InboxPhase.Error, r.state.phase)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-NOTI-036 coming back to the inbox silently reloads page 1, keeps old rows on failure and shows no toast`() = runTest {
        val r = opened(page(PAGE1), offlineFail())
        r.holder.onShown()
        runCurrent()
        assertEquals(20, r.state.rows.size)
        advanceUntilIdle()
        assertEquals(listOf(1, 1), r.repo.listCalls.toList())
        assertEquals(20, r.state.rows.size)
        assertEquals(InboxPhase.Content, r.state.phase)
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-NOTI-036 coming back after reading elsewhere shows the new read state`() = runTest {
        val readNow = NotificationFixtureModels.page(PAGE1).let { p ->
            p.copy(items = p.items.map { if (it.id == nid(1)) it.copy(readAt = java.time.Instant.parse("2026-10-27T02:00:00Z")) else it })
        }
        val r = opened(page(PAGE1), ApiResult.Success(readNow))
        assertTrue(r.state.rows.first { it.id == nid(1) }.unread)
        r.holder.onShown()
        advanceUntilIdle()
        assertFalse(r.state.rows.first { it.id == nid(1) }.unread)
    }

    // ---- row taps ------------------------------------------------------------------------------------

    @Test
    fun `TC-NOTI-027 tapping a POST_APPROVED row reads it, then opens my post`() = runTest {
        val r = opened(page(PAGE1))
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        assertEquals(listOf(nid(1)), r.repo.readCalls.toList())
        val nav = r.navigations.single()
        assertEquals(NavCommand(NotificationDestination.PostDetail(SRC, openAiFeedbackSheet = false), NavMode.Push), nav.command)
    }

    @Test
    fun `TC-NOTI-028 AI result rows open the post with the AI sheet flag`() = runTest {
        val r = opened(page(PAGE1))
        r.holder.onRowClicked(nid(3))
        r.holder.onRowClicked(nid(4))
        advanceUntilIdle()
        assertEquals(
            listOf<NotificationDestination>(NotificationDestination.PostDetail(SRC, true), NotificationDestination.PostDetail(SRC, true)),
            r.navigations.map { it.command.destination },
        )
    }

    @Test
    fun `TC-NOTI-030 a NOTICE row opens the detail of the row id`() = runTest {
        val r = opened(page(PAGE1))
        r.holder.onRowClicked(nid(5))
        advanceUntilIdle()
        assertEquals(listOf(nid(5)), r.repo.readCalls.toList())
        assertEquals(NotificationDestination.NotificationDetail(nid(5)), r.navigations.single().command.destination)
    }

    @Test
    fun `TC-NOTI-031 a POST_REJECTED row opens the notification detail after the read`() = runTest {
        val r = opened(page(PAGE1))
        r.holder.onRowClicked(nid(2))
        advanceUntilIdle()
        assertEquals(NotificationDestination.NotificationDetail(nid(2)), r.navigations.single().command.destination)
    }

    @Test
    fun `TC-NOTI-024 tapping an unknown type row stays in the inbox, reads nothing and shows no error`() = runTest {
        val r = opened(page("notification/notifications__unknown-type.json"))
        assertEquals(1, r.state.rows.size)
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        assertTrue(r.repo.readCalls.isEmpty())
        assertTrue(r.effects.isEmpty())
        assertNull(r.state.busyRowId)
    }

    @Test
    fun `TC-NOTI-025 tapping a TOPIC or REMINDER row goes home and sends no read`() = runTest {
        val r = opened(page("notification/notifications__topic-reminder.json"))
        r.holder.onRowClicked(nid(31))
        advanceUntilIdle()
        r.holder.onRowClicked(nid(32))
        advanceUntilIdle()
        assertTrue(r.repo.readCalls.isEmpty())
        assertEquals(2, r.navigations.size)
        assertTrue(r.navigations.all { it.command.destination is NotificationDestination.Home })
    }

    @Test
    fun `TC-NOTI-026 a POST_APPROVED row without source fields does nothing, not even an error`() = runTest {
        val r = opened(page("notification/notifications__null-source.json"))
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        assertTrue(r.repo.readCalls.isEmpty())
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-NOTI-029 an AI row with a bad source goes nowhere`() = runTest {
        val r = opened(page("notification/notifications__bad-ai-source.json"))
        r.holder.onRowClicked(nid(3))
        r.holder.onRowClicked(nid(8))
        advanceUntilIdle()
        assertTrue(r.repo.readCalls.isEmpty())
        assertTrue(r.navigations.isEmpty())
    }

    @Test
    fun `TC-NOTI-032 a network failure on read toasts, still navigates and leaves the row unread`() = runTest {
        val r = opened(page(PAGE1))
        r.repo.readResults += offlineFail()
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        assertEquals(listOf(NotiCopyKeys.READ_ERROR_NETWORK), r.toasts)
        assertEquals(1, r.navigations.size)
        assertTrue(r.state.rows.first { it.id == nid(1) }.unread)
        assertEquals(0, r.unread.calls)
    }

    @Test
    fun `TC-NOTI-033 a 404 on read toasts gone, reloads the list and unread and does not navigate`() = runTest {
        val r = opened(page(PAGE1), page("notification/notifications__30day-boundary.json"))
        r.repo.readResults += httpFail(404)
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        assertEquals(listOf(NotiCopyKeys.GONE), r.toasts)
        assertTrue(r.navigations.isEmpty())
        assertEquals(listOf(1, 1), r.repo.listCalls.toList())
        assertEquals(listOf(nid(1), nid(2)), r.ids)
        assertEquals(1, r.unread.calls)
        assertNull(r.state.busyRowId)
    }

    @Test
    fun `TC-NOTI-034 500, 403 and 400 on read behave like a 404`() = runTest {
        for ((status, code) in listOf(500 to ErrorCode.INTERNAL_ERROR, 403 to ErrorCode.FORBIDDEN, 400 to ErrorCode.BUSINESS_ERROR)) {
            val r = opened(page(PAGE1), page(PAGE1))
            r.repo.readResults += httpFail(status, code)
            r.holder.onRowClicked(nid(1))
            advanceUntilIdle()
            assertEquals(listOf(NotiCopyKeys.GONE), r.toasts, "status $status")
            assertTrue(r.navigations.isEmpty(), "status $status")
            assertEquals(2, r.repo.listCalls.size, "status $status")
        }
    }

    @Test
    fun `TC-NOTI-035 a 401 on read that ends at login does not navigate`() = runTest {
        for (code in listOf(ErrorCode.UNAUTHORIZED, ErrorCode.REAUTHENTICATION_REQUIRED)) {
            val r = opened(page(PAGE1))
            r.repo.readResults += httpFail(401, code)
            r.holder.onRowClicked(nid(1))
            advanceUntilIdle()
            assertEquals(listOf<InboxEffect>(InboxEffect.RequireLogin), r.effects.toList(), code.name)
        }
    }

    @Test
    fun `TC-NOTI-036 after a successful read that row turns read, the others stay, and unread is re-checked`() = runTest {
        val r = opened(page(PAGE1))
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        val rows = r.state.rows.associateBy { it.id }
        assertFalse(rows.getValue(nid(1)).unread)
        assertTrue(rows.getValue(nid(2)).unread)
        assertEquals(1, r.unread.calls)
    }

    @Test
    fun `TC-NOTI-037 tapping an already read row keeps its first readAt, sends the idempotent read and navigates`() = runTest {
        val r = opened(page(PAGE1))
        val before = r.state.rows.first { it.id == nid(6) }
        assertFalse(before.unread)
        r.holder.onRowClicked(nid(6))
        advanceUntilIdle()
        assertEquals(listOf(nid(6)), r.repo.readCalls.toList())
        assertEquals(before.readAt, r.state.rows.first { it.id == nid(6) }.readAt)
        assertEquals(1, r.navigations.size)
    }

    @Test
    fun `TC-NOTI-038 hammering the same row sends one read and navigates once`() = runTest {
        val r = opened(page(PAGE1))
        val gate = CompletableDeferred<Unit>()
        r.repo.readGates += gate
        repeat(5) { r.holder.onRowClicked(nid(1)) }
        runCurrent()
        assertEquals(nid(1), r.state.busyRowId)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(1, r.repo.readCalls.size)
        assertEquals(1, r.navigations.size)
        assertNull(r.state.busyRowId)
    }

    @Test
    fun `TC-NOTI-039 leaving the screen during the read means no navigation and no error`() = runTest {
        val r = opened(page(PAGE1))
        val gate = CompletableDeferred<Unit>()
        r.repo.readGates += gate
        r.holder.onRowClicked(nid(1))
        runCurrent()
        r.holder.onScreenGone()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.effects.isEmpty())
    }

    @Test
    fun `TC-NOTI-040 a logout during the read drops the answer, the old rows and any navigation`() = runTest {
        val r = opened(page(PAGE1))
        val gate = CompletableDeferred<Unit>()
        r.repo.readGates += gate
        r.holder.onRowClicked(nid(1))
        runCurrent()
        r.holder.onSessionEnded()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.effects.isEmpty())
        assertTrue(r.state.rows.isEmpty())
        assertEquals(0, r.unread.calls)
    }

    @Test
    fun `TC-NOTI-053 an inbox answer that arrives after the session ended is not shown`() = runTest {
        val r = rig(page(PAGE1))
        val gate = CompletableDeferred<Unit>()
        r.repo.listGates += gate
        r.holder.onShown()
        runCurrent()
        r.holder.onSessionEnded()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.state.rows.isEmpty())
    }

    @Test
    fun `TC-NOTI-041 loading and showing the list never sends a read request`() = runTest {
        val r = opened(page(PAGE1), page(PAGE2))
        r.holder.onScrolledTo(19)
        r.holder.onPullToRefresh()
        advanceUntilIdle()
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-NOTI-033 the effect of a tap carries a unique id per toast so an identical toast re-triggers`() = runTest {
        val r = opened(page(PAGE1), page(PAGE1), page(PAGE1))
        r.repo.readResults += httpFail(404)
        r.repo.readResults += httpFail(404)
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        r.holder.onRowClicked(nid(1))
        advanceUntilIdle()
        val ids = r.effects.filterIsInstance<InboxEffect.Toast>().map { it.id }
        assertEquals(2, ids.size)
        assertNotEquals(ids[0], ids[1])
        assertIs<InboxEffect.Toast>(r.effects.first())
    }
}
