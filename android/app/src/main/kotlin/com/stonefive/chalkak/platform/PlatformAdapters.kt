package com.stonefive.chalkak.platform

import android.content.Context
import coil3.ImageLoader
import kr.chalkak.feature.record.CalendarImageRenderer
import kr.chalkak.feature.record.CalendarImageSaver
import kr.chalkak.feature.record.SaveOutcome
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.stonefive.chalkak.BuildConfig
import com.stonefive.chalkak.copy.Copy
import kr.chalkak.core.common.SystemClock
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.feature.auth.ConfiguredUpdateChecker
import kr.chalkak.feature.auth.HomePreloader
import kr.chalkak.feature.auth.KakaoSocialLoginClient
import kr.chalkak.feature.auth.PlayUpdateChecker
import kr.chalkak.feature.auth.PushRegistrar
import kr.chalkak.feature.auth.SocialLoginClient
import kr.chalkak.feature.auth.UpdateCheckResult
import kr.chalkak.feature.auth.UpdateChecker
import kr.chalkak.feature.auth.UpdateFlowResult
import kr.chalkak.feature.auth.UpdateLauncher
import kr.chalkak.feature.onboarding.DeviceRegistrar
import kr.chalkak.feature.onboarding.ExternalBrowser
import kr.chalkak.feature.onboarding.SignatureImageEncoder
import kr.chalkak.feature.settings.DeviceNotificationSettings

/**
 * Everything platform specific that the screens' holders reach through interfaces. [android] wires the real adapters (Kakao SDK or the
 * fixture client, Play In-App Update, system browser, `android.graphics` PNG encoder); [headless] gives inert ones for JVM tests.
 */
class PlatformAdapters(
    val socialLogin: SocialLoginClient,
    val updateChecker: UpdateChecker,
    val updateLauncher: UpdateLauncher,
    val externalBrowser: ExternalBrowser,
    /** Banner links opened outside the app (home feature port). */
    val linkBrowser: kr.chalkak.feature.home.ExternalBrowser,
    val signatureEncoder: SignatureImageEncoder,
    val analytics: AnalyticsTracker,
    val push: PushRegistrar,
    val deviceRegistrar: DeviceRegistrar,
    val preloader: HomePreloader,
    /** Foreground Activity (Kakao login, Play update). `MainActivity` registers itself here. */
    val currentActivity: CurrentActivity = CurrentActivity(),
    /** Result channel of Play's immediate update flow, wired by `MainActivity`. */
    val updateFlowBridge: UpdateFlowBridge = UpdateFlowBridge(),
    /** Result channel of the Photo Picker / camera, wired by `MainActivity`. */
    val photoPickBridge: PhotoPickBridge = PhotoPickBridge(),
    /** Photo upload and editing ports (picker, camera, codec, WebP, temp files, gallery, edit preview). */
    val upload: UploadAdapters = UploadAdapters.headless(),
    /** Record tab "이미지로 저장": MediaStore writer and the month-calendar bitmap renderer (gets the app's image loader). */
    val calendarSaver: CalendarImageSaver = CalendarImageSaver { _, _ -> SaveOutcome.Failed },
    val calendarRenderer: (ImageLoader?) -> CalendarImageRenderer = { CalendarImageRenderer { _, _ -> ByteArray(0) } },
    /** Push ports (FCM token, POST_NOTIFICATIONS, notification display, stores). */
    val pushPlatform: PushPlatform = PushPlatform.headless(),
    /** Device notification permission and the jump to the app's system notification settings (settings push switches). */
    val deviceNotifications: DeviceNotificationSettings = InertDeviceNotificationSettings,
) {
    companion object {
        fun android(context: Context, copy: Copy = Copy.load(context)): PlatformAdapters {
            val app = context.applicationContext
            val activity = CurrentActivity()
            val bridge = UpdateFlowBridge()
            val photoBridge = PhotoPickBridge()
            val playManager = AppUpdateManagerFactory.create(app)
            val socialLogin: SocialLoginClient = when {
                // Debug builds only: BuildConfig.FAKE_SOCIAL_LOGIN is hard false in release (build.gradle.kts); DEBUG is a second lock.
                BuildConfig.FAKE_SOCIAL_LOGIN && BuildConfig.DEBUG -> FakeSocialLoginClient()
                else -> KakaoSocialLoginClient(KakaoSdkFactory.create(app, BuildConfig.KAKAO_NATIVE_APP_KEY, activity))
            }
            return PlatformAdapters(
                socialLogin = socialLogin,
                updateChecker = ConfiguredUpdateChecker(BuildConfig.FORCE_UPDATE_CHECK_ENABLED, PlayUpdateChecker(PlayUpdateSourceAdapter(playManager))),
                updateLauncher = PlayUpdateLauncher(playManager, activity, bridge, StoreOpener(app)),
                externalBrowser = AndroidExternalBrowser(app),
                linkBrowser = AndroidLinkBrowser(app),
                signatureEncoder = AndroidSignatureEncoder(),
                analytics = LogAnalyticsTracker(),
                push = NoopPushRegistrar,
                deviceRegistrar = NoopPushRegistrar,
                preloader = ReadyHomePreloader,
                currentActivity = activity,
                updateFlowBridge = bridge,
                photoPickBridge = photoBridge,
                upload = UploadAdapters.android(app, activity, photoBridge, copy, SystemClock),
                calendarSaver = AndroidCalendarImageSaver(app),
                calendarRenderer = { loader -> AndroidCalendarImageRenderer(app, copy, loader) },
                pushPlatform = PushPlatform.android(app),
                deviceNotifications = AndroidDeviceNotificationSettings(app),
            )
        }

        fun headless(): PlatformAdapters = PlatformAdapters(
            socialLogin = KakaoSocialLoginClient(UnconfiguredKakaoSdk),
            updateChecker = { UpdateCheckResult.UpToDate },
            updateLauncher = { UpdateFlowResult.Cancelled },
            externalBrowser = { false },
            linkBrowser = { kr.chalkak.feature.home.BrowserOpenResult.NoBrowser },
            signatureEncoder = AndroidSignatureEncoder(),
            analytics = object : AnalyticsTracker {
                override fun screenView(screen: String) = Unit
            },
            push = NoopPushRegistrar,
            deviceRegistrar = NoopPushRegistrar,
            preloader = ReadyHomePreloader,
        )
    }
}
