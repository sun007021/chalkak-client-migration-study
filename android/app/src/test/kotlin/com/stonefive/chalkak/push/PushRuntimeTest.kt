package com.stonefive.chalkak.push

import com.stonefive.chalkak.testing.FakePush
import com.stonefive.chalkak.testing.FakeSessionStore
import com.stonefive.chalkak.testing.NOTI_USER_A
import com.stonefive.chalkak.testing.RecordingUnreadRefresher
import com.stonefive.chalkak.testing.loadCopy
import com.stonefive.chalkak.testing.pushPayload
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kr.chalkak.core.common.testing.Fixtures
import kr.chalkak.core.data.notification.testing.FakePushDeviceRepository
import kr.chalkak.core.network.RefreshOutcome
import kr.chalkak.core.network.Session
import kr.chalkak.core.network.StoredSession
import kr.chalkak.feature.notification.OsPermissionState
import kr.chalkak.feature.notification.PushChannel
import kr.chalkak.feature.notification.PushMessage
import kr.chalkak.feature.notification.PushRegistrationCoordinator
import kr.chalkak.feature.notification.SessionRefresher
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** `PushRuntime`: the glue between a [com.stonefive.chalkak.platform.PushPlatform] and the pure-Kotlin push classes (fake platform). */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class PushRuntimeTest {
    private val copy = loadCopy()
    private val push = FakePush()
    private val devices = FakePushDeviceRepository()
    private val unread = RecordingUnreadRefresher()
    private val store = FakeSessionStore(StoredSession.None)

    private val sessionWithId = Session(
        userId = NOTI_USER_A,
        accessToken = Fixtures.json("push/jwt__with-session-id.json").jsonObject.getValue("token").jsonPrimitive.content,
        accessExpiresAt = Instant.parse("2026-12-01T00:00:00Z"),
        refreshToken = "refresh",
        refreshExpiresAt = Instant.parse("2027-01-01T00:00:00Z"),
    )

    private fun signedIn() {
        store.stored = StoredSession.User(sessionWithId)
    }

    private fun kotlinx.coroutines.test.TestScope.runtime(): PushRuntime {
        val registration = PushRegistrationCoordinator(store, push.tokens, devices, SessionRefresher { RefreshOutcome.Refreshed(it) })
        return PushRuntime(backgroundScope, push.platform, registration, unread, copy)
    }

    @Test
    fun `TC-PUSH-072 시작하면 moderation_push 채널을 push channel name 으로 만든다`() = runTest(UnconfinedTestDispatcher()) {
        runtime().start()
        assertEquals(listOf(PushChannel.ID to copy["push.channel.name"]), push.display.channels.toList())
    }

    @Test
    fun `TC-PUSH-015 토큰이 갱신되면 새 토큰으로 기기 등록을 한 번 한다`() = runTest(UnconfinedTestDispatcher()) {
        signedIn()
        runtime().start()
        push.tokens.emitRefreshed("fcm-token-2")
        assertEquals(listOf("fcm-token-2"), devices.tokens.toList())
    }

    @Test
    fun `TC-PUSH-016 로그인 전에 온 갱신 토큰은 등록하지 않는다`() = runTest(UnconfinedTestDispatcher()) {
        val registration = PushRegistrationCoordinator(store, push.tokens, devices, SessionRefresher { RefreshOutcome.Refreshed(it) })
        PushRuntime(backgroundScope, push.platform, registration, unread, copy).start()
        push.tokens.emitRefreshed("fcm-token-2")
        assertTrue(devices.tokens.isEmpty())
        signedIn()
        registration.registerCurrentDevice()
        assertEquals(listOf("fcm-token-2"), devices.tokens.toList(), "the handed-over token is kept and registered after login")
    }

    @Test
    fun `TC-PUSH-068 포그라운드에서 권한이 허용되면 서버 제목과 본문으로 알림을 직접 만들고 미읽음을 다시 조회한다`() = runTest(UnconfinedTestDispatcher()) {
        push.permission.state = OsPermissionState.Granted
        val fixture = com.stonefive.chalkak.testing.PushFixture.load("post-approved")
        runtime().onMessageReceived(PushMessage(fixture.title, fixture.body, fixture.payload), foreground = true)
        val shown = push.display.shown.single()
        assertEquals(PushChannel.ID, shown.channelId)
        assertEquals(fixture.title, shown.title)
        assertEquals(fixture.body, shown.body)
        assertEquals(fixture.payload, shown.payload)
        assertEquals(1, unread.calls)
    }

    @Test
    fun `TC-PUSH-068 본문이 비면 기본 문구를 쓴다`() = runTest(UnconfinedTestDispatcher()) {
        push.permission.state = OsPermissionState.Granted
        runtime().onMessageReceived(PushMessage("제목", "  ", pushPayload("post-approved")), foreground = true)
        assertEquals(copy["push.default.body"], push.display.shown.single().body)
    }

    @Test
    fun `TC-PUSH-068 권한이 허용되지 않으면 표시하지 않아도 미읽음은 다시 조회한다`() = runTest(UnconfinedTestDispatcher()) {
        push.permission.state = OsPermissionState.Denied
        runtime().onMessageReceived(PushMessage("제목", "본문", pushPayload("post-approved")), foreground = true)
        assertTrue(push.display.shown.isEmpty())
        assertEquals(1, unread.calls)
    }

    @Test
    fun `TC-PUSH-071 백그라운드 수신은 표시하지 않고 미읽음만 한 번 다시 조회한다`() = runTest(UnconfinedTestDispatcher()) {
        push.permission.state = OsPermissionState.Granted
        runtime().onMessageReceived(PushMessage("제목", "본문", pushPayload("post-approved")), foreground = false)
        assertTrue(push.display.shown.isEmpty())
        assertEquals(1, unread.calls)
    }
}
