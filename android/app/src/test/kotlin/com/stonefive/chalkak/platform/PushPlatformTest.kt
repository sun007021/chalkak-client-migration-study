package com.stonefive.chalkak.platform

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityOptionsCompat
import androidx.test.core.app.ApplicationProvider
import com.stonefive.chalkak.testing.NOTI_USER_A
import com.stonefive.chalkak.testing.NOTI_USER_B
import com.stonefive.chalkak.testing.PushFixture
import com.stonefive.chalkak.testing.pushPayload
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kr.chalkak.feature.notification.OsPermissionState
import kr.chalkak.feature.notification.PendingTap
import kr.chalkak.feature.notification.PermissionRequestResult
import kr.chalkak.feature.notification.PushChannel
import kr.chalkak.feature.notification.PushPayload
import kr.chalkak.feature.notification.ShownNotification
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowPendingIntent
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The push platform contract: what the Android adapters (and the headless stand-ins) must do. The FCM token adapter is behind a Gradle
 * flag and is not tested here; it only has to implement [PushTokenSource].
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class PushPlatformTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    // ---- headless ----------------------------------------------------------------------------------------------------------

    @Test
    fun `헤드리스 푸시 플랫폼은 토큰이 없고 갱신도 없고 권한 요청이 필요 없다`() = runTest {
        val platform = PushPlatform.headless()
        assertNull(platform.tokens.currentToken())
        val refreshed = CopyOnWriteArrayList<String>()
        val job = launch { platform.tokens.refreshed.collect { refreshed += it } }
        advanceUntilIdle()
        job.cancel()
        assertTrue(refreshed.isEmpty())
        assertEquals(OsPermissionState.NotRequired, platform.permission.state())
    }

    @Test
    fun `헤드리스 푸시 플랫폼의 저장소는 메모리에서 동작하고 표시는 아무 일도 하지 않는다`() = runTest {
        val platform = PushPlatform.headless()
        assertFalse(platform.promptStore.wasRequested())
        platform.promptStore.markRequested()
        assertTrue(platform.promptStore.wasRequested())

        assertNull(platform.pendingTaps.load())
        val tap = PendingTap(pushPayload("post-approved"), NOTI_USER_A)
        platform.pendingTaps.save(tap)
        assertEquals(tap, platform.pendingTaps.load())
        platform.pendingTaps.clear()
        assertNull(platform.pendingTaps.load())

        platform.display.ensureChannel(PushChannel.ID, "name")
        platform.display.show(ShownNotification(PushChannel.ID, "t", "b", pushPayload("post-approved")))
    }

    // ---- POST_NOTIFICATIONS ------------------------------------------------------------------------------------------------

    private class RecordingLauncher : ActivityResultLauncher<String>() {
        val launched = CopyOnWriteArrayList<String>()
        override fun launch(input: String, options: ActivityOptionsCompat?) { launched += input }
        override fun unregister() = Unit
        override val contract: ActivityResultContract<String, *> = ActivityResultContracts.RequestPermission()
    }

    private fun permission(sdk: Int, bridge: PushPermissionBridge = PushPermissionBridge()) =
        AndroidNotificationPermission(context, bridge, sdkInt = sdk)

    @Test
    fun `TC-PUSH-008 Android 12 이하는 권한이 필요 없고 요청도 하지 않는다`() = runTest {
        val bridge = PushPermissionBridge()
        val launcher = RecordingLauncher().also { bridge.launcher = it }
        val port = permission(32, bridge)
        assertEquals(OsPermissionState.NotRequired, port.state())
        assertEquals(PermissionRequestResult.Granted, port.request())
        assertTrue(launcher.launched.isEmpty())
    }

    @Test
    fun `TC-PUSH-009 Android 13 이상에서 허용되지 않았으면 결정 전이고 허용되면 Granted 이다`() = runTest {
        val port = permission(33)
        assertEquals(OsPermissionState.NotDetermined, port.state())
        shadowOf(context as android.app.Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        assertEquals(OsPermissionState.Granted, port.state())
    }

    @Test
    fun `TC-PUSH-009 요청은 POST_NOTIFICATIONS 를 한 번 런처로 띄우고 결과를 돌려준다`() = runTest {
        val bridge = PushPermissionBridge()
        val launcher = RecordingLauncher().also { bridge.launcher = it }
        val port = permission(33, bridge)

        val granted = async { port.request() }
        runCurrent()
        assertEquals(listOf(Manifest.permission.POST_NOTIFICATIONS), launcher.launched.toList())
        bridge.onResult(true)
        assertEquals(PermissionRequestResult.Granted, granted.await())

        val denied = async { port.request() }
        runCurrent()
        bridge.onResult(false)
        assertEquals(PermissionRequestResult.Denied, denied.await())
    }

    @Test
    fun `TC-PUSH-007 런처가 없으면 요청은 Failed 이다`() = runTest {
        assertEquals(PermissionRequestResult.Failed, permission(33).request())
    }

    @Test
    fun `파괴된 Activity 의 런처는 브리지에서 놓이고 새 Activity 의 런처는 남는다`() {
        val bridge = PushPermissionBridge()
        val old = RecordingLauncher()
        val new = RecordingLauncher()
        bridge.launcher = old
        bridge.launcher = new
        bridge.detach(old)
        assertTrue(bridge.launcher === new)
        bridge.detach(new)
        assertNull(bridge.launcher)
    }

    // ---- persisted stores --------------------------------------------------------------------------------------------------

    @Test
    fun `TC-PUSH-003 권한 안내 플래그는 기기에 저장되어 새 인스턴스도 읽는다`() = runTest {
        assertFalse(AndroidPermissionPromptStore(context).wasRequested())
        AndroidPermissionPromptStore(context).markRequested()
        assertTrue(AndroidPermissionPromptStore(context).wasRequested())
    }

    @Test
    fun `TC-PUSH-063 보류 중인 탭은 새 인스턴스에서도 복원되고 clear 뒤에는 없다`() = runTest {
        val tap = PendingTap(pushPayload("ai-review-completed"), NOTI_USER_A)
        AndroidPendingTapStore(context).save(tap)
        assertEquals(tap, AndroidPendingTapStore(context).load())
        AndroidPendingTapStore(context).clear()
        assertNull(AndroidPendingTapStore(context).load())
    }

    @Test
    fun `TC-PUSH-063 계정을 모르는 탭도 저장하고 새 푸시 탭은 이전 보류분을 교체한다`() = runTest {
        val first = PendingTap(pushPayload("topic"), userId = null)
        val second = PendingTap(pushPayload("notice"), NOTI_USER_B)
        val store = AndroidPendingTapStore(context)
        store.save(first)
        assertEquals(first, AndroidPendingTapStore(context).load())
        store.save(second)
        assertEquals(second, AndroidPendingTapStore(context).load())
    }

    @Test
    fun `TC-PUSH-063 일부 필드가 없는 페이로드도 그대로 복원된다`() = runTest {
        val sparse = PendingTap(PushPayload(type = "TOPIC", notificationId = null, sourceType = null, sourceId = null, eventId = null), null)
        AndroidPendingTapStore(context).save(sparse)
        assertEquals(sparse, AndroidPendingTapStore(context).load())
    }

    // ---- notification display ----------------------------------------------------------------------------------------------

    private val manager get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    @Test
    fun `TC-PUSH-072 채널 moderation_push 를 주어진 이름으로 만들고 다시 불러도 하나다`() {
        val display = AndroidNotificationDisplay(context)
        display.ensureChannel(PushChannel.ID, "게시물 검수 알림")
        display.ensureChannel(PushChannel.ID, "게시물 검수 알림")
        val channel = assertNotNull(manager.getNotificationChannel(PushChannel.ID))
        assertEquals("게시물 검수 알림", channel.name.toString())
        assertEquals(1, manager.notificationChannels.count { it.id == PushChannel.ID })
    }

    @Test
    fun `TC-PUSH-068 알림은 채널 제목 본문을 담고 탭하면 같은 페이로드가 앱에 전달된다`() {
        shadowOf(context as android.app.Application).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val display = AndroidNotificationDisplay(context)
        display.ensureChannel(PushChannel.ID, "게시물 검수 알림")
        val fixture = PushFixture.load("ai-review-completed")
        display.show(ShownNotification(PushChannel.ID, fixture.title, fixture.body!!, fixture.payload))

        val notification = shadowOf(manager).allNotifications.single()
        assertEquals(PushChannel.ID, notification.channelId)
        assertEquals(fixture.title, notification.extras.getString(Notification.EXTRA_TITLE))
        assertEquals(fixture.body, notification.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString())
        val tapIntent = shadowOf(notification.contentIntent).savedIntent
        assertEquals(fixture.payload, PushIntentParser.fromIntent(tapIntent))
    }

    // ---- notification tap intent -> payload (TC-PUSH-050, Android half) ---------------------------------------------------

    private fun fcmIntent(vararg extras: Pair<String, Any?>) = Intent().apply {
        putExtra("google.message_id", "0:1700000000000000%abc")
        putExtra("google.sent_time", 1_700_000_000_000L)
        putExtra("from", "123456789")
        putExtra("collapse_key", "com.stonefive.chalkak")
        extras.forEach { (k, v) ->
            when (v) {
                is String -> putExtra(k, v)
                is Int -> putExtra(k, v)
                is Bundle -> putExtra(k, v)
                else -> Unit
            }
        }
    }

    @Test
    fun `TC-PUSH-050 시스템 트레이 FCM 알림 탭 인텐트는 data 맵과 같은 PushPayload 가 된다`() {
        val fixture = PushFixture.load("post-approved")
        val intent = fcmIntent(*fixture.data.map { (k, v) -> k to v }.toTypedArray())
        assertEquals(fixture.payload, PushIntentParser.fromIntent(intent))
    }

    @Test
    fun `TC-PUSH-050 google 부가 키와 from collapse_key 는 무시한다`() {
        val payload = PushIntentParser.fromIntent(fcmIntent("type" to "TOPIC"))
        assertEquals(PushPayload(type = "TOPIC", notificationId = null, sourceType = null, sourceId = null, eventId = null), payload)
    }

    @Test
    fun `TC-PUSH-049 문자열이 아닌 extra 값은 누락으로 보고 예외가 없다`() {
        val payload = PushIntentParser.fromIntent(fcmIntent("type" to 7, "notificationId" to "33333333-3333-4333-8333-333333333301"))
        assertNull(payload?.type)
        assertEquals("33333333-3333-4333-8333-333333333301", payload?.notificationId)
    }

    @Test
    fun `TC-PUSH-050 FCM 탭이 아닌 인텐트와 null 과 빈 인텐트는 null 이고 FCM 탭만 페이로드가 된다`() {
        assertNotNull(PushIntentParser.fromIntent(fcmIntent("type" to "TOPIC")))
        assertNull(PushIntentParser.fromIntent(null))
        assertNull(PushIntentParser.fromIntent(Intent()))
        assertNull(PushIntentParser.fromIntent(Intent(Intent.ACTION_MAIN).putExtra("type", "TOPIC")))
    }
}
