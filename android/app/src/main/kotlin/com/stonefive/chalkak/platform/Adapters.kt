package com.stonefive.chalkak.platform

import android.util.Log
import kr.chalkak.core.common.analytics.AnalyticsTracker
import kr.chalkak.feature.auth.HomePreloader
import kr.chalkak.feature.auth.HomeMode
import kr.chalkak.feature.auth.PreloadResult
import kr.chalkak.feature.auth.PushRegistrar
import kr.chalkak.feature.onboarding.DeviceRegistrar

/** Default analytics (REQ-ANL-001): log only. Firebase joins when its config file exists (later PR). Only screen names are logged. */
class LogAnalyticsTracker : AnalyticsTracker {
    override fun screenView(screen: String) {
        Log.d(TAG, "screen_view $screen")
    }

    override fun bottomNavigationSelected(destination: String) {
        Log.d(TAG, "bottom_navigation_selected $destination")
    }

    private companion object {
        const val TAG = "ChalkakAnalytics"
    }
}

/** FCM registration arrives with the push PR; until then login and boot register nothing. */
object NoopPushRegistrar : PushRegistrar, DeviceRegistrar {
    override suspend fun registerCurrentDevice() = Unit
}

/** The home PR supplies the real preload; until then the boot gate finds the home data "ready" at once. */
object ReadyHomePreloader : HomePreloader {
    override suspend fun preload(mode: HomeMode): PreloadResult = PreloadResult.Ready
}
