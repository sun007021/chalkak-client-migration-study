package com.stonefive.chalkak.di

import com.stonefive.chalkak.copy.Copy
import com.stonefive.chalkak.platform.AndroidSignatureEncoder
import com.stonefive.chalkak.platform.NoopPushRegistrar
import com.stonefive.chalkak.platform.PlatformAdapters
import com.stonefive.chalkak.platform.ReadyHomePreloader
import com.stonefive.chalkak.platform.UnconfiguredKakaoSdk
import com.stonefive.chalkak.testing.FakePush
import com.stonefive.chalkak.testing.NOTI_USER_A
import com.stonefive.chalkak.testing.RecordingAnalytics
import com.stonefive.chalkak.testing.pushPayload
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kr.chalkak.core.common.SystemClock
import kr.chalkak.core.data.auth.SecureRecordStorage
import kr.chalkak.core.data.auth.SessionRecord
import kr.chalkak.feature.auth.KakaoSocialLoginClient
import kr.chalkak.feature.auth.UpdateCheckResult
import kr.chalkak.feature.auth.UpdateFlowResult
import kr.chalkak.feature.home.BrowserOpenResult
import kr.chalkak.feature.notification.PendingTap
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The app container wires the push ports of `PlatformAdapters.pushPlatform` into the notification and push features. */
@RunWith(RobolectricTestRunner::class)
class AppContainerPushTest {
    private val storage = object : SecureRecordStorage {
        override suspend fun load() = SessionRecord()
        override suspend fun save(record: SessionRecord) = Unit
        override suspend fun wipe() = Unit
    }
    private val push = FakePush()
    private val analytics = RecordingAnalytics()

    private fun platform() = PlatformAdapters(
        socialLogin = KakaoSocialLoginClient(UnconfiguredKakaoSdk),
        updateChecker = { UpdateCheckResult.UpToDate },
        updateLauncher = { UpdateFlowResult.Cancelled },
        externalBrowser = { false },
        linkBrowser = { BrowserOpenResult.NoBrowser },
        signatureEncoder = AndroidSignatureEncoder(),
        analytics = analytics,
        push = NoopPushRegistrar,
        deviceRegistrar = NoopPushRegistrar,
        preloader = ReadyHomePreloader,
        pushPlatform = push.platform,
    )

    private val container = AppContainer(Copy(emptyMap()), "http://localhost:4010", SystemClock, storage, platform = platform())

    @Test
    fun `TC-PUSH-066 계정 전환 리셋은 대기 중이던 푸시 탭 저장소를 비운다`() = runBlocking {
        push.pendingTaps.current = PendingTap(pushPayload("post-approved"), NOTI_USER_A)
        container.userDataResetter.resetAll()
        assertNull(push.pendingTaps.current)
        assertTrue(push.pendingTaps.clears >= 1)
    }

    @Test
    fun `알림 푸시 화면 의존성이 메인과 루트 의존성에 모두 채워진다`() {
        val root = container.newRootDependencies()
        assertNotNull(root.pushTaps)
        val main = assertNotNull(root.main)
        assertNotNull(main.newNotificationInboxHolder)
        assertNotNull(main.newNotificationDetailHolder)
        assertNotNull(main.newAiReviewHolderOnEntry)
        assertNotNull(main.notificationPermission)
        assertNotNull(main.homeUnread)
    }

    @Test
    fun `알림 홀더는 screen_view 를 보내지 않는다 - 화면 전환 이벤트는 내비게이션 컨트롤러만 보낸다`() {
        val main = assertNotNull(container.newRootDependencies().main)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            main.newNotificationInboxHolder!!(scope).onShown()
            main.newNotificationDetailHolder!!(scope).onShown("33333333-3333-4333-8333-333333333301")
            assertTrue(analytics.screens.isEmpty(), "holders must get a tracker that drops everything: ${analytics.screens}")
        } finally {
            scope.cancel()
        }
    }

    @Test
    fun `푸시 런타임과 탭 큐는 컨테이너가 한 번만 만든다`() {
        assertTrue(container.pushRuntime === container.pushRuntime)
        assertTrue(container.pushTaps === container.pushTaps)
        assertTrue(container.newRootDependencies().pushTaps === container.pushTaps)
    }
}
