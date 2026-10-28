package kr.chalkak.feature.notification

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.core.common.testing.Copy
import kr.chalkak.core.data.notification.testing.FakeNotificationRepository
import kr.chalkak.core.data.notification.testing.httpFail
import kr.chalkak.core.data.notification.testing.invalidResponseFail
import kr.chalkak.core.data.notification.testing.offlineFail
import kr.chalkak.core.network.ErrorCode
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

private const val NID = "33333333-3333-4333-8333-333333333301"
private const val SRC = "22222222-2222-4222-8222-222222222201"

/** Read-then-navigate decision shared by inbox rows and push taps (REQ-NOTI-015..019, REQ-PUSH-027, D-11/D-24). */
class NotificationTapHandlerTest {
    private val post = NotificationDestination.PostDetail(SRC, openAiFeedbackSheet = false)
    private val plan = TapPlan(post, readNotificationId = NID)

    private class Rig(val repo: FakeNotificationRepository, val unread: RecordingUnread, val handler: NotificationTapHandler)

    private fun rig(): Rig {
        val repo = FakeNotificationRepository()
        val unread = RecordingUnread()
        return Rig(repo, unread, NotificationTapHandler(repo, unread))
    }

    @Test
    fun `TC-PUSH-053 and TC-NOTI-027 a successful read navigates and re-checks unread once`() = runTest {
        val r = rig()
        val outcome = r.handler.handle(plan)
        assertEquals(TapOutcome.Navigate(post, readConfirmed = true), outcome)
        assertEquals(listOf(NID), r.repo.readCalls.toList())
        assertEquals(1, r.unread.calls)
    }

    @Test
    fun `TC-PUSH-054 and TC-NOTI-032 a network failure toasts the read error and still navigates`() = runTest {
        val r = rig()
        r.repo.readResults += offlineFail()
        val outcome = assertIs<TapOutcome.Navigate>(r.handler.handle(plan))
        assertEquals(post, outcome.destination)
        assertEquals(false, outcome.readConfirmed)
        assertEquals(NotiCopyKeys.READ_ERROR_NETWORK, outcome.toastCopyKey)
        assertEquals("읽음 상태를 저장하지 못했어요. 네트워크 연결을 확인해 주세요.", Copy[NotiCopyKeys.READ_ERROR_NETWORK])
    }

    @Test
    fun `TC-PUSH-055 and TC-NOTI-033 a 404 shows the gone toast, refreshes unread and does not navigate`() = runTest {
        val r = rig()
        r.repo.readResults += httpFail(404)
        assertEquals(TapOutcome.Rejected(NotiCopyKeys.GONE), r.handler.handle(plan))
        assertEquals(1, r.unread.calls)
        assertEquals("더 이상 확인할 수 없는 알림이에요.", Copy[NotiCopyKeys.GONE])
    }

    @Test
    fun `TC-PUSH-056 and TC-NOTI-034 500, 403 and 400 are handled like a 404`() = runTest {
        for ((status, code) in listOf(500 to ErrorCode.INTERNAL_ERROR, 403 to ErrorCode.FORBIDDEN, 400 to ErrorCode.BUSINESS_ERROR)) {
            val r = rig()
            r.repo.readResults += httpFail(status, code)
            assertEquals(TapOutcome.Rejected(NotiCopyKeys.GONE), r.handler.handle(plan), "status $status")
            assertEquals(1, r.unread.calls, "status $status")
        }
    }

    @Test
    fun `TC-PUSH-056 an unusable response body is handled like a 404 too`() = runTest {
        val r = rig()
        r.repo.readResults += invalidResponseFail()
        assertEquals(TapOutcome.Rejected(NotiCopyKeys.GONE), r.handler.handle(plan))
    }

    @Test
    fun `TC-PUSH-057 and TC-NOTI-035 a 401 that survived the refresh and a REAUTHENTICATION_REQUIRED both end at the login screen`() = runTest {
        for (code in listOf(ErrorCode.UNAUTHORIZED, ErrorCode.REAUTHENTICATION_REQUIRED)) {
            val r = rig()
            r.repo.readResults += httpFail(401, code)
            assertEquals(TapOutcome.RequireLogin, r.handler.handle(plan), code.name)
            assertEquals(0, r.unread.calls, code.name)
        }
    }

    @Test
    fun `TC-NOTI-025 a plan without a read navigates directly and never calls the read API`() = runTest {
        val r = rig()
        val home = NotificationDestination.Home(scrollToTopAndRefresh = true)
        val outcome = assertIs<TapOutcome.Navigate>(r.handler.handle(TapPlan(home, readNotificationId = null)))
        assertEquals(home, outcome.destination)
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-NOTI-024 a plan without a destination does nothing at all`() = runTest {
        val r = rig()
        assertEquals(TapOutcome.Dropped, r.handler.handle(TapPlan(null, null)))
        assertTrue(r.repo.readCalls.isEmpty())
        assertEquals(0, r.unread.calls)
    }

    @Test
    fun `TC-PUSH-044 a push-fallback inbox destination needs no read`() = runTest {
        val r = rig()
        val outcome = assertIs<TapOutcome.Navigate>(r.handler.handle(TapPlan(NotificationDestination.Inbox, null)))
        assertEquals(NotificationDestination.Inbox, outcome.destination)
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-NOTI-039 cancelling while the read is in flight produces no outcome`() = runTest {
        val r = rig()
        val gate = CompletableDeferred<Unit>()
        r.repo.readGates += gate
        var outcome: TapOutcome? = null
        val job = launch { outcome = r.handler.handle(plan) }
        runCurrent()
        job.cancel()
        gate.complete(Unit)
        advanceUntilIdle()
        assertNull(outcome)
        assertEquals(0, r.unread.calls)
    }
}

/** Push-tap buffering and gating (D-11 3, REQ-PUSH-030..032, TC-BOOT-035, TC-PUSH-058..066). */
class PushTapQueueTest {
    private class Rig(
        val session: MutableStateFlow<TapSession>,
        val mainReady: MutableStateFlow<Boolean>,
        val blocking: MutableStateFlow<Boolean>,
        var top: TopScreen,
        val repo: FakeNotificationRepository,
        val unread: RecordingUnread,
        val store: InMemoryPendingTapStore,
        val queue: PushTapQueue,
        val events: MutableList<PushNavigationEvent>,
    )

    private fun TestScope.rig(
        session: TapSession = TapSession.Member(USER_A),
        mainReady: Boolean = true,
        blocking: Boolean = false,
        store: InMemoryPendingTapStore = InMemoryPendingTapStore(),
        top: TopScreen = TopScreen.Other,
        repo: FakeNotificationRepository = FakeNotificationRepository(),
        start: Boolean = true,
    ): Rig {
        val sessionFlow = MutableStateFlow(session)
        val readyFlow = MutableStateFlow(mainReady)
        val blockingFlow = MutableStateFlow(blocking)
        val unread = RecordingUnread()
        lateinit var rig: Rig
        val queue = PushTapQueue(
            scope = holderScope(),
            store = store,
            handler = NotificationTapHandler(repo, unread),
            session = sessionFlow,
            mainReady = readyFlow,
            blockingScreen = blockingFlow,
            top = { rig.top },
        )
        val events = collectAll(queue.events)
        rig = Rig(sessionFlow, readyFlow, blockingFlow, top, repo, unread, store, queue, events)
        if (start) queue.start()
        return rig
    }

    private fun payload(name: String = "post-approved") = PushFixture.load(name).payload

    private fun Rig.tap(name: String = "post-approved") = queue.onTap(payload(name))

    private val approvedGo = PushNavigationEvent.Go(
        NavCommand(NotificationDestination.PostDetail(SRC, openAiFeedbackSheet = false), NavMode.Push),
    )

    @Test
    fun `a failing pending-tap store does not stop the tap from being handled or kill the queue`() = runTest {
        val store = InMemoryPendingTapStore().apply { failWith = IllegalStateException("disk full") }
        val r = rig(mainReady = false, store = store)
        r.tap()
        advanceUntilIdle()
        r.mainReady.value = true
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(approvedGo), r.events.toList())
        r.tap()
        advanceUntilIdle()
        assertEquals(2, r.events.size, "the gate collector is still alive")
    }

    @Test
    fun `TC-BOOT-035 a tap during the closed update gate waits and is processed once home is open`() = runTest {
        val r = rig(mainReady = false)
        r.tap()
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertTrue(r.repo.readCalls.isEmpty())
        assertEquals(payload(), r.store.current?.payload)
        r.mainReady.value = true
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(approvedGo), r.events.toList())
        assertEquals(listOf(NID), r.repo.readCalls.toList())
    }

    @Test
    fun `TC-PUSH-058 a tap while logged out is dropped, nothing is stored and a later login does not replay it`() = runTest {
        val r = rig(session = TapSession.LoggedOut)
        r.tap()
        advanceUntilIdle()
        assertEquals(0, r.store.saves)
        assertNull(r.store.current)
        r.session.value = TapSession.Member(USER_A)
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-PUSH-059 a guest tap is dropped`() = runTest {
        val r = rig(session = TapSession.Guest)
        r.tap()
        r.tap("topic")
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertEquals(0, r.store.saves)
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-PUSH-059 a pending tap is discarded when the session turns into logged out or guest before it could run`() = runTest {
        val r = rig(blocking = true)
        r.tap()
        advanceUntilIdle()
        r.session.value = TapSession.Guest
        advanceUntilIdle()
        r.session.value = TapSession.Member(USER_A)
        r.blocking.value = false
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertNull(r.store.current)
    }

    @Test
    fun `TC-PUSH-060 a tap during the signature preview or login screens waits until home is shown`() = runTest {
        val r = rig(mainReady = false, blocking = true)
        r.tap()
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        r.mainReady.value = true
        advanceUntilIdle()
        assertTrue(r.events.isEmpty(), "still on a blocking screen")
        r.blocking.value = false
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(approvedGo), r.events.toList())
    }

    @Test
    fun `TC-PUSH-061 a tap while an upload or feedback screen is open waits until that screen is left`() = runTest {
        val r = rig(blocking = true)
        r.tap()
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertTrue(r.repo.readCalls.isEmpty())
        r.blocking.value = false
        advanceUntilIdle()
        assertEquals(1, r.events.size)
        assertEquals(1, r.repo.readCalls.size)
    }

    @Test
    fun `TC-PUSH-062 a cold start tap is buffered until the member and the main screen are ready, then consumed exactly once`() = runTest {
        val r = rig(session = TapSession.Unknown, mainReady = false)
        r.tap("topic")
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        r.session.value = TapSession.Member(USER_A)
        advanceUntilIdle()
        assertTrue(r.events.isEmpty(), "main not ready yet")
        r.mainReady.value = true
        advanceUntilIdle()
        val go = PushNavigationEvent.Go(NavCommand(NotificationDestination.Home(true), NavMode.Push))
        assertEquals(listOf<PushNavigationEvent>(go), r.events.toList())
        r.blocking.value = true
        r.blocking.value = false
        r.mainReady.value = false
        r.mainReady.value = true
        advanceUntilIdle()
        assertEquals(1, r.events.size)
    }

    @Test
    fun `TC-PUSH-062 a cold start tap that turns out to be a guest session is dropped`() = runTest {
        val r = rig(session = TapSession.Unknown, mainReady = false)
        r.tap()
        r.session.value = TapSession.Guest
        r.mainReady.value = true
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-PUSH-063 a pending tap survives process death, is consumed once and then no longer stored`() = runTest {
        val store = InMemoryPendingTapStore()
        val first = rig(store = store, mainReady = false)
        first.tap()
        advanceUntilIdle()
        assertEquals(payload(), store.current?.payload)

        val restored = rig(store = store, mainReady = false, start = false)
        restored.queue.restore()
        restored.queue.start()
        restored.mainReady.value = true
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(approvedGo), restored.events.toList())
        assertNull(store.current)

        val again = rig(store = store, start = false)
        again.queue.restore()
        again.queue.start()
        advanceUntilIdle()
        assertTrue(again.events.isEmpty())
    }

    @Test
    fun `TC-PUSH-063 a newer tap replaces the pending one`() = runTest {
        val r = rig(blocking = true)
        r.tap("post-approved")
        r.tap("notice")
        advanceUntilIdle()
        assertEquals(payload("notice"), r.store.current?.payload)
        r.blocking.value = false
        advanceUntilIdle()
        assertEquals(1, r.events.size)
        assertEquals(listOf(payload("notice").notificationId), r.repo.readCalls.toList())
    }

    @Test
    fun `TC-PUSH-064 a post detail that is already open is replaced, not stacked`() = runTest {
        val r = rig(top = TopScreen.PostDetail(SRC))
        r.tap("ai-review-completed")
        advanceUntilIdle()
        val go = assertIs<PushNavigationEvent.Go>(r.events.single())
        assertEquals(NavMode.ReplaceTop, go.command.mode)
        assertEquals(NotificationDestination.PostDetail(SRC, openAiFeedbackSheet = true), go.command.destination)
    }

    @Test
    fun `TC-PUSH-065 TOPIC while on home adds no screen but asks for scroll to top and refresh, with no read`() = runTest {
        val r = rig(top = TopScreen.Home)
        r.tap("topic")
        advanceUntilIdle()
        assertEquals(
            listOf<PushNavigationEvent>(PushNavigationEvent.Go(NavCommand(NotificationDestination.Home(true), NavMode.AlreadyThere))),
            r.events.toList(),
        )
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-PUSH-066 a tap pending for one account is discarded when another account becomes the member`() = runTest {
        val r = rig(blocking = true)
        r.tap()
        advanceUntilIdle()
        r.session.value = TapSession.Member(USER_B)
        r.blocking.value = false
        advanceUntilIdle()
        assertTrue(r.events.isEmpty())
        assertTrue(r.repo.readCalls.isEmpty())
        assertNull(r.store.current)
    }

    @Test
    fun `TC-PUSH-052 the same eventId tapped twice is handled twice`() = runTest {
        val r = rig()
        r.tap()
        advanceUntilIdle()
        r.tap()
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(approvedGo, approvedGo), r.events.toList())
        assertEquals(2, r.repo.readCalls.size)
    }

    @Test
    fun `TC-PUSH-044 an unknown type tap opens the inbox with no read request`() = runTest {
        val r = rig()
        r.tap("unknown-type")
        advanceUntilIdle()
        assertEquals(
            listOf<PushNavigationEvent>(PushNavigationEvent.Go(NavCommand(NotificationDestination.Inbox, NavMode.Push))),
            r.events.toList(),
        )
        assertTrue(r.repo.readCalls.isEmpty())
    }

    @Test
    fun `TC-PUSH-054 a push tap with a network failure on read shows the toast and still navigates`() = runTest {
        val r = rig()
        r.repo.readResults += offlineFail()
        r.tap()
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(approvedGo.copy(toastCopyKey = NotiCopyKeys.READ_ERROR_NETWORK)), r.events.toList())
    }

    @Test
    fun `TC-PUSH-055 a push tap on a 404 shows the gone toast, refreshes unread and does not navigate`() = runTest {
        val r = rig()
        r.repo.readResults += httpFail(404)
        r.tap()
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(PushNavigationEvent.Toast(NotiCopyKeys.GONE)), r.events.toList())
        assertEquals(1, r.unread.calls)
    }

    @Test
    fun `TC-PUSH-057 a push tap whose read needs re-authentication goes to login and leaves nothing pending`() = runTest {
        val r = rig()
        r.repo.readResults += httpFail(401, ErrorCode.REAUTHENTICATION_REQUIRED)
        r.tap()
        advanceUntilIdle()
        assertEquals(listOf<PushNavigationEvent>(PushNavigationEvent.RequireLogin), r.events.toList())
        assertNull(r.store.current)
        r.mainReady.value = false
        r.mainReady.value = true
        advanceUntilIdle()
        assertEquals(1, r.events.size)
    }
}

/** Logout / account switch clean-up (D-16, TC-PUSH-035, TC-PUSH-032, TC-PUSH-066, TC-NOTI-040/053). */
class NotificationDataResetterTest {
    @Test
    fun `TC-PUSH-035 logout clears local push state and calls no device API`() = runTest {
        val sessionStore = kr.chalkak.core.network.testing.FakeSessionStore(member())
        val devices = kr.chalkak.core.data.notification.testing.FakePushDeviceRepository()
        val registration = PushRegistrationCoordinator(sessionStore, FakeFcmTokenSource("fcm-token-1"), devices, ScriptedRefresher(sessionStore))
        val repo = FakeNotificationRepository()
        val inbox = NotificationInboxStateHolder(holderScope(), repo, NotificationTapHandler(repo, RecordingUnread()), RecordingAnalytics(), kr.chalkak.core.common.testing.FakeClock())
        val store = InMemoryPendingTapStore(PendingTap(PushFixture.load("post-approved").payload, USER_A))
        val resetter = NotificationDataResetter(registration, store, inbox)

        registration.registerCurrentDevice()
        resetter.resetAll()
        assertNull(store.current)
        assertEquals(1, devices.tokens.size)
        assertEquals(listOf("register:fcm-token-1"), devices.log.entries.toList())

        registration.registerCurrentDevice()
        assertEquals(2, devices.tokens.size)
    }

    @Test
    fun `TC-NOTI-053 logout empties the inbox state of the previous account`() = runTest {
        val repo = FakeNotificationRepository()
        repo.listResults += kr.chalkak.core.data.notification.testing.NotificationFixtureModels.success("notification/notifications__page1.json")
        val inbox = NotificationInboxStateHolder(holderScope(), repo, NotificationTapHandler(repo, RecordingUnread()), RecordingAnalytics(), kr.chalkak.core.common.testing.FakeClock())
        inbox.onShown()
        advanceUntilIdle()
        assertEquals(20, inbox.state.value.rows.size)

        val sessionStore = kr.chalkak.core.network.testing.FakeSessionStore(member())
        val registration = PushRegistrationCoordinator(
            sessionStore,
            FakeFcmTokenSource(null),
            kr.chalkak.core.data.notification.testing.FakePushDeviceRepository(),
            ScriptedRefresher(sessionStore),
        )
        NotificationDataResetter(registration, InMemoryPendingTapStore(), inbox).resetAll()
        assertTrue(inbox.state.value.rows.isEmpty())
    }
}
