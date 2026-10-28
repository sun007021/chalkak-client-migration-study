package com.stonefive.chalkak.platform

import android.content.Context
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.stonefive.chalkak.BuildConfig
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

/**
 * Everything platform specific that the screens' holders reach through interfaces. [android] wires the real adapters (Kakao SDK or the
 * fixture client, Play In-App Update, system browser, `android.graphics` PNG encoder); [headless] gives inert ones for JVM tests.
 */
class PlatformAdapters(
    val socialLogin: SocialLoginClient,
    val updateChecker: UpdateChecker,
    val updateLauncher: UpdateLauncher,
    val externalBrowser: ExternalBrowser,
    val signatureEncoder: SignatureImageEncoder,
    val analytics: AnalyticsTracker,
    val push: PushRegistrar,
    val deviceRegistrar: DeviceRegistrar,
    val preloader: HomePreloader,
    /** Foreground Activity (Kakao login, Play update). `MainActivity` registers itself here. */
    val currentActivity: CurrentActivity = CurrentActivity(),
    /** Result channel of Play's immediate update flow, wired by `MainActivity`. */
    val updateFlowBridge: UpdateFlowBridge = UpdateFlowBridge(),
) {
    companion object {
        fun android(context: Context): PlatformAdapters {
            val app = context.applicationContext
            val activity = CurrentActivity()
            val bridge = UpdateFlowBridge()
            val playManager = AppUpdateManagerFactory.create(app)
            val socialLogin: SocialLoginClient = when {
                // Debug builds only: BuildConfig.FAKE_SOCIAL_LOGIN is hard false in release (build.gradle.kts).
                BuildConfig.FAKE_SOCIAL_LOGIN -> FakeSocialLoginClient()
                else -> KakaoSocialLoginClient(KakaoSdkFactory.create(app, BuildConfig.KAKAO_NATIVE_APP_KEY, activity))
            }
            return PlatformAdapters(
                socialLogin = socialLogin,
                updateChecker = ConfiguredUpdateChecker(BuildConfig.FORCE_UPDATE_CHECK_ENABLED, PlayUpdateChecker(PlayUpdateSourceAdapter(playManager))),
                updateLauncher = PlayUpdateLauncher(playManager, activity, bridge, StoreOpener(app)),
                externalBrowser = AndroidExternalBrowser(app),
                signatureEncoder = AndroidSignatureEncoder(),
                analytics = LogAnalyticsTracker(),
                push = NoopPushRegistrar,
                deviceRegistrar = NoopPushRegistrar,
                preloader = ReadyHomePreloader,
                currentActivity = activity,
                updateFlowBridge = bridge,
            )
        }

        fun headless(): PlatformAdapters = PlatformAdapters(
            socialLogin = KakaoSocialLoginClient(UnconfiguredKakaoSdk),
            updateChecker = { UpdateCheckResult.UpToDate },
            updateLauncher = { UpdateFlowResult.Cancelled },
            externalBrowser = { false },
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
