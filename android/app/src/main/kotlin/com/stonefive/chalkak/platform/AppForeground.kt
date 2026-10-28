package com.stonefive.chalkak.platform

import android.app.Activity
import android.app.Application
import android.os.Bundle

/** Whether any Activity of the app is started (the app is visible). Registered once by the Application. */
class AppForeground : Application.ActivityLifecycleCallbacks {
    @Volatile
    private var started = 0

    val isForeground: Boolean get() = started > 0

    fun register(app: Application) = app.registerActivityLifecycleCallbacks(this)

    override fun onActivityStarted(activity: Activity) {
        started++
    }

    override fun onActivityStopped(activity: Activity) {
        started = (started - 1).coerceAtLeast(0)
    }

    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
