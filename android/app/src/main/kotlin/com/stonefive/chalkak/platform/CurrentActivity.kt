package com.stonefive.chalkak.platform

import android.app.Activity
import java.lang.ref.WeakReference

/**
 * The foreground [Activity], for platform adapters that must start an Activity-bound flow (Kakao login, Play update).
 * Held weakly; `MainActivity` sets it in `onCreate` and clears it in `onDestroy`.
 */
class CurrentActivity {
    @Volatile
    private var ref: WeakReference<Activity>? = null

    fun get(): Activity? = ref?.get()

    fun set(activity: Activity) {
        ref = WeakReference(activity)
    }

    /** Clears only if [activity] is still the current one (a new Activity may already have registered itself). */
    fun clear(activity: Activity) {
        if (ref?.get() === activity) ref = null
    }
}
