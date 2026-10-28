package kr.chalkak.feature.notification

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.feature.auth.HomeMode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Permission request flow (REQ-PUSH-001..006). The Android/spec behavior is tested: OS dialog only, no app-made dialog, no
 * `PATCH /notification-settings`. The iOS-style catalog rows TC-PUSH-002/005/006 describe that other flow (see CoverageMap).
 */
class NotificationPermissionFlowTest {
    private class Rig(val port: FakePermissionPort, val store: InMemoryPromptStore, val flow: NotificationPermissionFlow)

    private fun rig(state: OsPermissionState = OsPermissionState.NotDetermined, requested: Boolean = false): Rig {
        val port = FakePermissionPort(state)
        val store = InMemoryPromptStore(requested)
        return Rig(port, store, NotificationPermissionFlow(port, store))
    }

    @Test
    fun `TC-PUSH-001 the first member home entry with an undecided permission asks the OS once and stores the flag`() = runTest {
        val r = rig()
        val outcome = r.flow.onMainEntered(HomeMode.Member)
        assertEquals(PermissionFlowOutcome.Prompted(PermissionRequestResult.Granted), outcome)
        assertEquals(1, r.port.requests)
        assertTrue(r.store.requested)
    }

    @Test
    fun `TC-PUSH-001 a denied answer is not an error and the flag stays stored`() = runTest {
        val r = rig()
        r.port.result = PermissionRequestResult.Denied
        assertEquals(PermissionFlowOutcome.Prompted(PermissionRequestResult.Denied), r.flow.onMainEntered(HomeMode.Member))
        assertTrue(r.store.requested)
    }

    @Test
    fun `TC-PUSH-002 an already granted or denied OS state shows no dialog and only stores the flag (REQ-PUSH-004 temporary behavior)`() = runTest {
        for (state in listOf(OsPermissionState.Granted, OsPermissionState.Denied)) {
            val r = rig(state)
            assertEquals(PermissionFlowOutcome.MarkedOnly, r.flow.onMainEntered(HomeMode.Member), state.name)
            assertEquals(0, r.port.requests, state.name)
            assertTrue(r.store.requested, state.name)
        }
    }

    @Test
    fun `TC-PUSH-003 once asked it is never asked again, not on the next home entry and not after an app restart`() = runTest {
        val r = rig()
        r.flow.onMainEntered(HomeMode.Member)
        assertEquals(PermissionFlowOutcome.AlreadyRequested, r.flow.onMainEntered(HomeMode.Member))
        val afterRestart = NotificationPermissionFlow(r.port, r.store)
        assertEquals(PermissionFlowOutcome.AlreadyRequested, afterRestart.onMainEntered(HomeMode.Member))
        assertEquals(1, r.port.requests)
    }

    @Test
    fun `TC-PUSH-004 a guest gets neither a request nor a stored flag`() = runTest {
        val r = rig()
        assertEquals(PermissionFlowOutcome.NotMember, r.flow.onMainEntered(HomeMode.Guest))
        assertEquals(0, r.port.requests)
        assertFalse(r.store.requested)
    }

    @Test
    fun `TC-PUSH-004 after the guest browsed, the first member entry still asks`() = runTest {
        val r = rig()
        r.flow.onMainEntered(HomeMode.Guest)
        assertIs<PermissionFlowOutcome.Prompted>(r.flow.onMainEntered(HomeMode.Member))
    }

    @Test
    fun `TC-PUSH-007 a failed permission request shows noti perm error and still stores the flag`() = runTest {
        val r = rig()
        r.port.result = PermissionRequestResult.Failed
        val outcome = assertIs<PermissionFlowOutcome.Failed>(r.flow.onMainEntered(HomeMode.Member))
        assertEquals(NotiCopyKeys.PERM_ERROR, outcome.toastCopyKey)
        assertEquals("알림 권한을 요청하지 못했어요. 기기 설정에서 확인해 주세요.", Copy[outcome.toastCopyKey])
        assertTrue(r.store.requested)
    }

    @Test
    fun `TC-PUSH-007 a request that throws is handled like a failed request`() = runTest {
        val r = rig()
        r.port.failure = IllegalStateException("no activity")
        val outcome = assertIs<PermissionFlowOutcome.Failed>(r.flow.onMainEntered(HomeMode.Member))
        assertEquals(NotiCopyKeys.PERM_ERROR, outcome.toastCopyKey)
        assertTrue(r.store.requested)
    }

    @Test
    fun `TC-PUSH-008 Android 12 and below proceeds without any runtime request`() = runTest {
        val r = rig(OsPermissionState.NotRequired)
        assertEquals(PermissionFlowOutcome.NotRequired, r.flow.onMainEntered(HomeMode.Member))
        assertEquals(0, r.port.requests)
    }

    @Test
    fun `TC-PUSH-009 Android 13 plus requests POST_NOTIFICATIONS exactly once even when entries overlap`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.port.gate = gate
        val first = launch { r.flow.onMainEntered(HomeMode.Member) }
        runCurrent()
        assertTrue(r.store.requested, "the flag is stored when the dialog is shown, before the answer")
        val second = launch { r.flow.onMainEntered(HomeMode.Member) }
        runCurrent()
        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(first.isCompleted && second.isCompleted)
        assertEquals(1, r.port.requests)
    }

    @Test
    fun `TC-PUSH-010 and TC-ONB-047 the first home after signup is handled exactly like the first home after login`() = runTest {
        val afterSignup = rig()
        assertIs<PermissionFlowOutcome.Prompted>(afterSignup.flow.onMainEntered(HomeMode.Member))
        assertEquals(1, afterSignup.port.requests)
        assertEquals(PermissionFlowOutcome.AlreadyRequested, afterSignup.flow.onMainEntered(HomeMode.Member))
    }

    @Test
    fun `TC-PUSH-011 the flag belongs to the device, so a second account on the same device is not asked again`() = runTest {
        val r = rig()
        r.flow.onMainEntered(HomeMode.Member)
        // logout, other account logs in: same store, new flow instance
        val second = NotificationPermissionFlow(r.port, r.store)
        assertEquals(PermissionFlowOutcome.AlreadyRequested, second.onMainEntered(HomeMode.Member))
        assertEquals(1, r.port.requests)
    }
}

/** Foreground display and unread re-check (REQ-PUSH-019/020, TC-PUSH-068..073). */
class ForegroundPushHandlerTest {
    private class Rig(
        val port: FakePermissionPort,
        val display: RecordingDisplay,
        val unread: RecordingUnread,
        val handler: ForegroundPushHandler,
    )

    private fun rig(state: OsPermissionState = OsPermissionState.Granted): Rig {
        val port = FakePermissionPort(state)
        val display = RecordingDisplay()
        val unread = RecordingUnread()
        val handler = ForegroundPushHandler(
            permission = port,
            display = display,
            unread = unread,
            channelName = Copy[NotiCopyKeys.PUSH_CHANNEL_NAME],
            defaultBody = Copy[NotiCopyKeys.PUSH_DEFAULT_BODY],
        )
        return Rig(port, display, unread, handler)
    }

    private fun message(name: String = "post-approved", title: String? = null, body: String? = null): PushMessage {
        val fixture = PushFixture.load(name)
        return PushMessage(title ?: fixture.title, body ?: fixture.body, fixture.payload)
    }

    @Test
    fun `TC-PUSH-068 a foreground push with permission becomes an OS notification with the server title and body on channel moderation_push`() = runTest {
        val r = rig()
        val msg = message()
        r.handler.onMessageReceived(msg, foreground = true)
        assertEquals(
            listOf(ShownNotification("moderation_push", msg.title, msg.body!!, msg.payload)),
            r.display.shown.toList(),
        )
    }

    @Test
    fun `TC-PUSH-068 an empty or missing body is replaced by the default copy`() = runTest {
        val r = rig()
        r.handler.onMessageReceived(message().copy(body = ""), foreground = true)
        r.handler.onMessageReceived(message().copy(body = null), foreground = true)
        assertEquals(listOf(Copy[NotiCopyKeys.PUSH_DEFAULT_BODY], Copy[NotiCopyKeys.PUSH_DEFAULT_BODY]), r.display.shown.map { it.body })
        assertEquals("새 알림이 있어요. 알림함에서 확인해 주세요.", r.display.shown.first().body)
    }

    @Test
    fun `TC-PUSH-068 without a granted permission nothing is shown`() = runTest {
        for (state in listOf(OsPermissionState.Denied, OsPermissionState.NotDetermined)) {
            val r = rig(state)
            r.handler.onMessageReceived(message(), foreground = true)
            assertTrue(r.display.shown.isEmpty(), state.name)
        }
    }

    @Test
    fun `TC-PUSH-068 a push that arrives in the background is not drawn by the app`() = runTest {
        val r = rig()
        r.handler.onMessageReceived(message(), foreground = false)
        assertTrue(r.display.shown.isEmpty())
    }

    @Test
    fun `TC-PUSH-071 every push re-checks unread once, foreground or background, with or without permission`() = runTest {
        val r = rig(OsPermissionState.Denied)
        r.handler.onMessageReceived(message(), foreground = true)
        assertEquals(1, r.unread.calls)
        r.handler.onMessageReceived(message(), foreground = false)
        assertEquals(2, r.unread.calls)
        val granted = rig()
        granted.handler.onMessageReceived(message(), foreground = true)
        assertEquals(1, granted.unread.calls)
    }

    @Test
    fun `TC-PUSH-072 app start creates the moderation_push channel with the Korean channel name`() {
        val r = rig()
        r.handler.initChannel()
        r.handler.initChannel()
        assertEquals(setOf("moderation_push" to "게시물 검수 알림"), r.display.channels.toSet())
        assertEquals("게시물 검수 알림", Copy[NotiCopyKeys.PUSH_CHANNEL_NAME])
    }

    @Test
    fun `TC-PUSH-073 every type is shown from its payload alone, the client does not filter by local settings`() = runTest {
        val r = rig()
        val names = listOf("topic", "reminder", "post-approved", "post-rejected", "ai-review-completed", "ai-review-failed", "notice")
        for (name in names) r.handler.onMessageReceived(message(name), foreground = true)
        assertEquals(names.size, r.display.shown.size)
        assertEquals(names.map { PushFixture.load(it).payload }, r.display.shown.map { it.payload })
    }
}
