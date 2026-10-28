package kr.chalkak.feature.notification

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.notification.NotificationDetail
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
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val ID2 = "33333333-3333-4333-8333-333333333302"
private const val ID1 = "33333333-3333-4333-8333-333333333301"
private const val ID5 = "33333333-3333-4333-8333-333333333305"

class NotificationDetailStateHolderTest {
    private class Rig(
        val holder: NotificationDetailStateHolder,
        val repo: FakeNotificationRepository,
        val unread: RecordingUnread,
        val analytics: RecordingAnalytics,
        val effects: MutableList<DetailEffect>,
    ) {
        val state get() = holder.state.value
    }

    private fun TestScope.rig(vararg results: ApiResult<NotificationDetail>): Rig {
        val repo = FakeNotificationRepository()
        repo.detailResults += results
        val unread = RecordingUnread()
        val analytics = RecordingAnalytics()
        val holder = NotificationDetailStateHolder(holderScope(), repo, analytics, unread)
        return Rig(holder, repo, unread, analytics, collectAll(holder.effects))
    }

    private fun detail(path: String) = ApiResult.Success(NotificationFixtureModels.detail(path))

    private fun TestScope.opened(id: String, vararg results: ApiResult<NotificationDetail>): Rig {
        val r = rig(*results)
        r.holder.onShown(id)
        advanceUntilIdle()
        return r
    }

    @Test
    fun `TC-NOTI-042 a rejected detail shows the original photo, the reason section and the to-inbox button, and no re-upload button`() = runTest {
        val r = opened(ID2, detail("notification/notification-detail__rejected.json"))
        assertEquals(DetailPhase.Content, r.state.phase)
        assertEquals("사진이 반려되었어요", r.state.detail?.title)
        assertTrue(r.state.showOriginalPhoto)
        assertTrue(r.state.showRejectionReason)
        assertTrue(r.state.showToInboxButton)
        assertEquals("알림 상세", Copy[NotiCopyKeys.DETAIL_TITLE])
        assertEquals("반려 사유", Copy[NotiCopyKeys.DETAIL_REASON])
        assertEquals("알림함으로", Copy[NotiCopyKeys.DETAIL_TO_INBOX])
    }

    @Test
    fun `TC-NOTI-042 a rejected detail with null photo and null reason hides both areas but keeps the button`() = runTest {
        val bare = NotificationFixtureModels.detail("notification/notification-detail__rejected.json").copy(originalImageUrl = null, rejectionReason = null)
        val r = opened(ID2, ApiResult.Success(bare))
        assertFalse(r.state.showOriginalPhoto)
        assertFalse(r.state.showRejectionReason)
        assertTrue(r.state.showToInboxButton)
    }

    @Test
    fun `TC-NOTI-044 a notice detail shows title and body only`() = runTest {
        val r = opened(ID5, detail("notification/notification-detail__notice.json"))
        assertEquals(DetailPhase.Content, r.state.phase)
        assertEquals("서비스 점검 안내", r.state.detail?.title)
        assertFalse(r.state.showOriginalPhoto)
        assertFalse(r.state.showRejectionReason)
        assertFalse(r.state.showToInboxButton)
    }

    @Test
    fun `TC-NOTI-047 an approved detail shows the photo when there is one and still works without`() = runTest {
        val withPhoto = opened(ID1, detail("notification/notification-detail__approved.json"))
        assertTrue(withPhoto.state.showOriginalPhoto)
        assertFalse(withPhoto.state.showRejectionReason)
        assertFalse(withPhoto.state.showToInboxButton)
        val approved = NotificationFixtureModels.detail("notification/notification-detail__approved.json").copy(originalImageUrl = null)
        val without = opened(ID1, ApiResult.Success(approved))
        assertEquals(DetailPhase.Content, without.state.phase)
        assertFalse(without.state.showOriginalPhoto)
    }

    @Test
    fun `TC-NOTI-045 a 404 shows the gone state with no old data, toasts, and refreshes inbox and unread`() = runTest {
        val r = opened("33333333-3333-4333-8333-333333333399", httpFail(404))
        assertEquals(DetailPhase.Gone, r.state.phase)
        assertNull(r.state.detail)
        assertEquals(listOf(NotiCopyKeys.GONE), r.effects.filterIsInstance<DetailEffect.Toast>().map { it.copyKey })
        assertTrue(DetailEffect.InvalidateInbox in r.effects)
        assertEquals(1, r.unread.calls)
    }

    @Test
    fun `TC-NOTI-046 a 500 or a network failure is a retryable Error and retry asks again`() = runTest {
        val r = opened(ID2, httpFail(500, ErrorCode.INTERNAL_ERROR), detail("notification/notification-detail__rejected.json"))
        assertEquals(DetailPhase.Error, r.state.phase)
        assertEquals(NotiCopyKeys.DETAIL_ERROR, r.state.errorCopyKey)
        val gate = CompletableDeferred<Unit>()
        r.repo.detailGates += gate
        r.holder.onRetry()
        runCurrent()
        assertEquals(DetailPhase.Loading, r.state.phase)
        gate.complete(Unit)
        advanceUntilIdle()
        assertEquals(DetailPhase.Content, r.state.phase)
        assertEquals(listOf(ID2, ID2), r.repo.detailCalls.toList())
    }

    @Test
    fun `TC-NOTI-046 a connection failure shows the network message and an unusable body the generic one`() = runTest {
        val offline = opened(ID2, offlineFail())
        assertEquals(DetailPhase.Error, offline.state.phase)
        assertEquals(NotiCopyKeys.NETWORK, offline.state.errorCopyKey)
        val broken = opened(ID2, invalidResponseFail())
        assertEquals(NotiCopyKeys.DETAIL_ERROR, broken.state.errorCopyKey)
        assertEquals("알림을 불러오지 못했어요", Copy[NotiCopyKeys.DETAIL_ERROR])
    }

    @Test
    fun `TC-NOTI-041 opening a detail never sends a read request`() = runTest {
        val r = opened(ID2, detail("notification/notification-detail__rejected.json"))
        assertTrue(r.repo.readCalls.isEmpty())
        r.holder.onRetry()
        advanceUntilIdle()
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-NOTI-048 the detail screen sends screen_view notification_detail once per entry`() = runTest {
        val r = opened(ID2, detail("notification/notification-detail__rejected.json"))
        assertEquals(listOf("notification_detail"), r.analytics.screens.toList())
        r.holder.onRetry()
        advanceUntilIdle()
        assertEquals(1, r.analytics.screens.size, "a retry is not a new entry")
    }

    @Test
    fun `TC-NOTI-042 the to-inbox button opens the inbox, or just closes the detail when the inbox is below`() = runTest {
        val r = opened(ID2, detail("notification/notification-detail__rejected.json"))
        r.holder.onToInboxClicked(inboxIsBelow = false)
        r.holder.onToInboxClicked(inboxIsBelow = true)
        assertEquals(listOf<DetailEffect>(DetailEffect.OpenInbox, DetailEffect.Close), r.effects.toList())
    }

    @Test
    fun `TC-NOTI-009 a 401 on the detail that ends at login opens the login screen without a message`() = runTest {
        for (code in listOf(ErrorCode.UNAUTHORIZED, ErrorCode.REAUTHENTICATION_REQUIRED)) {
            val r = opened(ID2, httpFail(401, code))
            assertEquals(listOf<DetailEffect>(DetailEffect.RequireLogin), r.effects.toList(), code.name)
        }
    }

    @Test
    fun `TC-NOTI-022 leaving the detail while it loads shows no error and no toast`() = runTest {
        val r = rig(offlineFail())
        val gate = CompletableDeferred<Unit>()
        r.repo.detailGates += gate
        r.holder.onShown(ID2)
        runCurrent()
        r.holder.onScreenGone()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(r.effects.isEmpty())
        assertTrue(r.state.phase != DetailPhase.Error)
    }
}
